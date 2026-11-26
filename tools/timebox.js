#!/usr/bin/env node
/**
 * timebox - run any command with a hard deadline and guaranteed cleanup.
 *
 *   node tools/timebox.js -t 30 -- node tests/unit/pattern.test.js
 *   node tools/timebox.js --timeout 90 npm run lint
 *   echo '{"a":1}' | node tools/timebox.js 10 -- node script.js
 *
 * Exit codes: the child's code, 124 if it blew the budget, 127 if it could not
 * start. The child is killed with SIGTERM, then SIGKILL to its whole process
 * group - a hung test can never survive this wrapper.
 */

import { checkArgs, numFlag, parseArgs, usage } from './lib/args.js';
import { guardBrokenPipe, run } from './lib/proc.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const USAGE_TEXT = `timebox - run a command with a deadline

  node tools/timebox.js [-t seconds|ms] [--quiet] -- command [args...]

  -t, --timeout   budget, plain number = seconds (default 60)
      --kill-after  grace between SIGTERM and SIGKILL, seconds (default 2)
      --quiet       do not forward the child's stdout
      --json        report {code, timedOut, durationMs, stdout, stderr} as JSON`.trim();

async function main() {
  guardBrokenPipe();
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv, { aliases: { t: 'timeout' }, booleans: ['quiet'] });
  if (parsed.help || parsed._.length === 0) usage(USAGE_TEXT, parsed.help ? 0 : 2);
  // Everything after the command word belongs to the child, so positionals are unlimited here;
  // the flags this tool itself reads are not, and a mistyped budget must not silently become 60 s.
  checkArgs(parsed, {
    name: 'timebox.js',
    flags: ['help', 'timeout', 'kill-after', 'quiet', 'json'],
    positionals: Infinity,
    hint: 'the budget is -t/--timeout in seconds, and the command goes after --',
    usageText: USAGE_TEXT,
  });

  const rawBudget = numFlag(parsed.flags, 'timeout', 60);
  const timeoutMs = rawBudget > 1000 ? rawBudget : rawBudget * 1000;
  const killAfterMs = numFlag(parsed.flags, 'kill-after', 2) * 1000;
  const [command, ...args] = parsed._;

  const result = await run(command, args, { timeoutMs, killGraceMs: killAfterMs });

  if (parsed.json) {
    process.stdout.write(`${JSON.stringify({
      command: [command, ...args],
      code: result.code,
      signal: result.signal,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      stdout: result.stdout,
      stderr: result.stderr,
    }, null, 2)}\n`);
  } else {
    if (!parsed.quiet && result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.timedOut) {
      process.stderr.write(`\ntimebox: ${command} exceeded ${timeoutMs} ms and was killed\n`);
    } else {
      process.stdout.write(`timebox: ${command} exited ${result.code} in ${(result.durationMs / 1000).toFixed(1)}s\n`);
    }
  }

  process.exitCode = result.timedOut ? 124 : (result.code ?? 127);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
