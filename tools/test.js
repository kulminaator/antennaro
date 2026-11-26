#!/usr/bin/env node
/**
 * Test runner. Everything here is timeboxed: a hung browser or a stuck test can
 * never wedge CI, it fails the run instead.
 *
 *   node tools/test.js                     # unit suite (fast, no browser)
 *   node tools/test.js --browser           # unit + headless-browser suite
 *   node tools/test.js --browser --only browser
 *   node tools/test.js --unit --grep state
 *   node tools/test.js --list
 *
 * Flags
 *   --unit / --browser / --all   select suites (default: --unit)
 *   --only <substr>              restrict the file list by path substring
 *   --grep <pattern>             node:test --test-name-pattern
 *   --per-file <ms>              wall-clock limit per test file (defaults from TIMEOUTS)
 *   --test-timeout <ms>          per-test timeout handed to node:test
 *   --json                       machine-readable summary
 *
 * Unit tests run in plain Node. Browser tests share one static server per file
 * (started and stopped by this runner) and each file gets its own browser
 * instance created and destroyed by the test harness itself.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS, display } from './lib/paths.js';
import { checkArgs, parseArgs, usage } from './lib/args.js';
import { exitAfterFlush, guardBrokenPipe, run } from './lib/proc.js';
import { withTimeout } from './lib/timeout.js';
import { walk } from './lib/scan.js';
import { startServer } from './staticserver.js';
import { stopMatching } from './lib/browser.js';
import { TIMEOUTS } from '../src/config.js';

const HELP = `test.js - timeboxed test runner

  node tools/test.js [--unit] [--browser] [--only <substr>] [--grep <pattern>]
                     [--per-file <ms>] [--test-timeout <ms>] [--json] [--list]
`;

/** Budgets come from src/config.js so the app, the tools and the tests agree. */
const DEFAULTS = Object.freeze({
  browserPerFileMs: TIMEOUTS.browserTestPerFile,
  unitPerFileMs: TIMEOUTS.unitTestPerFile,
  unitPerTestMs: TIMEOUTS.unitTestPerTest,
  browserPerTestMs: TIMEOUTS.browserTestPerTest,
});

function collectFiles(suite) {
  const dir = suite === 'unit' ? PATHS.unitTests : PATHS.browserTests;
  if (!existsSync(dir)) return [];
  return walk(dir).filter((file) => file.endsWith('.test.js')).sort();
}

function nodeTestArgs(files, options) {
  const args = ['--test', '--test-reporter=spec', '--test-timeout', String(options.testTimeoutMs)];
  if (options.grep) args.push('--test-name-pattern', options.grep);
  return args.concat(files);
}

async function runFiles(files, { suite, options, env, server }) {
  const results = [];

  try {
    for (const file of files) {
      const started = Date.now();
      const perFile = options.perFileMs ?? (suite === 'unit' ? DEFAULTS.unitPerFileMs : DEFAULTS.browserPerFileMs);
      const perTest = options.testTimeoutMs ?? (suite === 'unit' ? DEFAULTS.unitPerTestMs : DEFAULTS.browserPerTestMs);
      const result = await run(process.execPath, nodeTestArgs([file], { ...options, testTimeoutMs: perTest }), {
        timeoutMs: perFile,
        env: { ...env, SIM_URL: server?.url ?? '', SIM_ROOT: PATHS.root },
        echo: !options.json,
      });
      results.push({
        suite,
        file: display(file),
        code: result.timedOut ? 'timeout' : result.code,
        durationMs: Date.now() - started,
        tail: (result.stdout + result.stderr).split('\n').slice(-14).join('\n'),
      });
      if (result.timedOut) {
        results.at(-1).tail = `TIMEBOX: killed after ${perFile} ms\n${results.at(-1).tail}`;
      }
    }
  } finally {
    /* nothing to release: the server belongs to the caller */
  }
  return results;
}

async function main() {
  guardBrokenPipe();
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.flags.help) usage(HELP);
  // Suites are flags, not subcommands. Before this, `test.js browser interaction` read nothing out
  // of those words, ran the unit suite and exited 0 - an answer to a question that was not asked.
  checkArgs(parsed, {
    name: 'test.js',
    flags: ['help', 'all', 'unit', 'browser', 'only', 'grep', 'per-file', 'test-timeout', 'json', 'list'],
    positionals: 0,
    hint: 'suites are flags: --browser runs the browser tests, and --only <text> narrows them to one file',
    usageText: HELP,
  });

  // No flags = unit only (the fast loop). --all = unit + browser.
  const wantUnit = Boolean(parsed.flags.all || parsed.flags.unit) || !parsed.flags.browser;
  const wantBrowser = Boolean(parsed.flags.browser || parsed.flags.all);
  const only = typeof parsed.flags.only === 'string' ? parsed.flags.only : null;
  const options = {
    grep: typeof parsed.flags.grep === 'string' ? parsed.flags.grep : null,
    perFileMs: Number(parsed.flags['per-file'] ?? 0) || null,
    testTimeoutMs: Number(parsed.flags['test-timeout'] ?? 0) || null,
    json: Boolean(parsed.flags.json),
  };

  const suites = [];
  if (wantUnit) suites.push({ suite: 'unit', files: collectFiles('unit') });
  if (wantBrowser) suites.push({ suite: 'browser', files: collectFiles('browser') });
  for (const entry of suites) {
    if (only) entry.files = entry.files.filter((file) => display(file).includes(only));
  }

  if (parsed.flags.list) {
    for (const entry of suites) {
      for (const file of entry.files) process.stdout.write(`${entry.suite}  ${display(file)}\n`);
    }
    return 0;
  }

  const all = [];
  for (const entry of suites) {
    if (entry.files.length === 0) {
      if (!options.json) process.stdout.write(`(${entry.suite}: no test files)\n`);
      continue;
    }
    if (!options.json) process.stdout.write(`\n== ${entry.suite} suite: ${entry.files.length} file(s) ==\n`);
    // Browser tests need a server; unit tests never do. Port 0 = the OS picks, so
    // parallel runs and leftover processes cannot collide.
    const server = entry.suite === 'browser' ? await startServer({ port: 0, quiet: true }) : null;
    if (server && !options.json) process.stdout.write(`serving ${server.url}\n`);
    // A Chromium that survived an earlier crashed run makes every browser test in
    // this run slow and flaky, so sweep before and after - never assume the
    // previous process cleaned up after itself.
    const sweep = async () => {
      const stopped = await stopMatching(/^sim-test-/).catch(() => []);
      const stuck = stopped.filter((row) => row.state !== 'stopped');
      if (stuck.length > 0 && !options.json) {
        process.stdout.write(`warning: browsers refused to stop: ${stuck.map((row) => `${row.name} (${row.how})`).join(', ')}\n`);
      }
    };
    if (entry.suite === 'browser') await withTimeout(sweep, TIMEOUTS.browserKill * 4, 'sweep leftover browsers').catch(() => {});
    try {
      all.push(...await runFiles(entry.files, { suite: entry.suite, options, env: process.env, server }));
    } finally {
      if (entry.suite === 'browser') await withTimeout(sweep, TIMEOUTS.browserKill * 4, 'sweep leftover browsers').catch(() => {});
      if (server) await withTimeout(() => server.close(), TIMEOUTS.serveHealth, 'stop static server').catch(() => {});
    }
  }

  const failures = all.filter((result) => result.code !== 0);
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ok: failures.length === 0, results: all }, null, 2)}\n`);
  } else if (failures.length > 0) {
    process.stdout.write(`\n---- failures ----\n`);
    for (const failure of failures) {
      process.stdout.write(`\n# ${failure.file} (exit ${failure.code}, ${failure.durationMs} ms)\n${failure.tail}\n`);
    }
    process.stdout.write(`\n${failures.length}/${all.length} test file(s) failed\n`);
  } else {
    const totalMs = all.reduce((sum, result) => sum + result.durationMs, 0);
    process.stdout.write(`\nall ${all.length} test file(s) passed in ${totalMs} ms\n`);
  }
  return failures.length === 0 ? 0 : 1;
}

// The runner talked HTTP; do not wait for a draining keep-alive socket to close.
exitAfterFlush(await main());
