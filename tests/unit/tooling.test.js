/**
 * The command-line tools must at least start.
 *
 * `node --check` only proves a file parses: an unimported constant inside
 * `main()` compiles happily and then crashes the moment anyone runs the tool -
 * which is exactly how a broken static server once made every browser test time
 * out with a confusing "app never booted" error. These tests run each entry
 * point for real, with the runner's own timeboxes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PATHS, ensureDir } from '../../tools/lib/paths.js';
import { run, spawnDetached, terminate, isGroupAlive } from '../../tools/lib/proc.js';
import { isPortFree, findOrphanPids } from '../../tools/lib/browser.js';
import { waitFor } from '../../tools/lib/timeout.js';
import { STATE_PATH } from '../../tools/staticserver.js';
import { TIMEOUTS } from '../../src/config.js';

const NODE_TIMEOUT_MS = TIMEOUTS.cliDefault;

/** Run a tool and fail the test if it does not exit cleanly. */
async function tool(args, options = {}) {
  const result = await run(process.execPath, args, { timeoutMs: NODE_TIMEOUT_MS, cwd: PATHS.root, ...options });
  assert.equal(result.timedOut, false, `tools/${args.join(' ')} did not finish in ${NODE_TIMEOUT_MS} ms`);
  return result;
}

const CLIS = ['vendor.js', 'staticserver.js', 'browser.js', 'lint.js', 'test.js', 'timebox.js'];

test('tooling: every CLI answers --help without crashing', async () => {
  for (const cli of CLIS) {
    const result = await tool([`tools/${cli}`, '--help']);
    assert.equal(result.code, 0, `tools/${cli} --help exited ${result.code}: ${result.stderr.slice(0, 400)}`);
    assert.match(result.stdout + result.stderr, /./, `tools/${cli} --help printed nothing`);
    // A crash on an undefined name would show up as a stack trace, not usage.
    assert.equal(result.stderr.includes('ReferenceError'), false, `tools/${cli} --help threw ReferenceError`);
    assert.equal(result.stderr.includes('SyntaxError'), false, `tools/${cli} --help threw SyntaxError`);
  }
});

test('tooling: the static server CLI serves the web root and blocks the dev directories', async () => {
  // Detached on purpose: the CLI runs until it is told to stop, so "run it and
  // wait" would hang the suite. Health-check it, then shut it down by name.
  let port = 8931;
  while (!(await isPortFree(port)) && port < 8941) port += 1;
  const base = `http://127.0.0.1:${port}`;
  const logFile = join(ensureDir(PATHS.logs), 'staticserver-smoke.log');
  // The server records its pid in a shared file; do not corrupt a developer's.
  const previousRecord = existsSync(STATE_PATH) ? readFileSync(STATE_PATH, 'utf8') : null;
  const pid = spawnDetached(process.execPath, ['tools/staticserver.js', '--port', String(port), '--quiet'], {
    cwd: PATHS.root, logFile,
  });

  try {
    const health = await waitFor(async () => {
      const response = await fetch(`${base}/-/health`).catch(() => null);
      return response?.ok ? response.json() : null;
    }, { timeoutMs: TIMEOUTS.serveHealth, intervalMs: 100, label: `static server on ${port} (log: ${logFile})` });
    assert.equal(health.index, true, 'the server cannot see index.html - is the web root right?');

    const index = await (await fetch(`${base}/`)).text();
    assert.match(index, /Antenna &amp; Terrain Simulator/, 'GET / did not return the app');
    assert.match(index, /"three"\s*:\s*"\.\/vendor\/three\/[^"]+"/, 'the served page has no usable import map');

    const bundle = await fetch(`${base}/vendor/three/three.module.min.js`);
    assert.equal(bundle.status, 200, 'the vendored bundle is not reachable over HTTP');
    assert.match(bundle.headers.get('content-type') ?? '', /javascript/,
      'a .js file must be served as JavaScript or the browser refuses the module');
    const entry = await fetch(`${base}/src/main.js`);
    assert.equal(entry.status, 200);
    assert.match(entry.headers.get('content-type') ?? '', /javascript/);

    for (const denied of ['.git/config', '.tmp/server.json', 'node_modules/three/package.json']) {
      const response = await fetch(`${base}/${denied}`);
      assert.equal(response.status, 403, `${denied} must not be served by the dev server`);
    }
  } finally {
    await fetch(`${base}/-/shutdown`, { method: 'POST' }).catch(() => {});
    await terminate(pid, { termMs: 2000, killMs: 1500, group: true });
    if (previousRecord) writeFileSync(STATE_PATH, previousRecord);
    else rmSync(STATE_PATH, { force: true });
  }
});

test('tooling: browser.js finds and reports chromium we started but lost the record for', async () => {
  // A fake "browser": any process whose command line points at our profile
  // directory is one we launched, recorded or not. Deleting the state file must
  // not make a running browser invisible.
  const marker = `${join(ensureDir(PATHS.browserProfiles), 'ghost-profile')}/profile`;
  const fake = spawnDetached('/bin/sh', ['-c', `sleep 30 # chromium --user-data-dir=${marker}`], {
    cwd: PATHS.root,
    logFile: join(PATHS.logs, 'ghost-browser.log'),
  });

  try {
    await waitFor(() => (findOrphanPids().includes(fake) ? true : null), {
      timeoutMs: 4000, intervalMs: 200, label: 'the fake browser to show up in the process table',
    });
    assert.ok(findOrphanPids().includes(fake), 'findOrphanPids missed a process it started');

    const status = await tool(['tools/browser.js', 'status', '--all']);
    assert.equal(status.code, 2, 'status must signal unrecorded processes with a non-zero exit');
    assert.match(status.stdout, /unrecorded chromium processes/, 'status reported nothing about the stray process');
    assert.match(status.stdout, /stop --all/, 'status must say how to get rid of them');
  } finally {
    await terminate(fake, { group: true, termMs: 1000, killMs: 1000 });
    rmSync(join(PATHS.browserProfiles, 'ghost-profile'), { recursive: true, force: true });
  }
});

test('tooling: a group terminate reaps grandchildren that outlive their leader', async () => {
  // Chromium's launcher is a shell wrapper that dies on SIGTERM while the real
  // browser behind it ignores the signal. Reporting "stopped" when only the
  // recorded pid died left orphaned browsers running, and every later browser
  // test then timed out for a reason that looked like an app bug.
  const marker = join(ensureDir(PATHS.tmp), 'proc-group-survivor.pid');
  rmSync(marker, { force: true });
  const script = `sleep 30 & echo $! > ${JSON.stringify(marker)}; trap 'exit 0' TERM; wait`;
  const pid = spawnDetached('/bin/sh', ['-c', script], {
    cwd: PATHS.root,
    logFile: join(ensureDir(PATHS.logs), 'proc-group.log'),
  });

  try {
    const text = await waitFor(
      () => (existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null),
      { timeoutMs: 4000, intervalMs: 100, label: 'the grandchild to record its pid', },
    );
    const survivor = Number(text);
    assert.ok(survivor > 0, `nonsense pid in the marker file: ${text}`);
    assert.equal(isGroupAlive(pid), true, 'the process group should be alive before termination');

    const result = await terminate(pid, { group: true, termMs: 1500, killMs: 2000 });
    assert.equal(result.stopped, true, `terminate reported ${result.how}`);
    assert.equal(isGroupAlive(pid), false, 'a member of the group survived the terminate');

    let survivorAlive = true;
    try {
      process.kill(survivor, 0);
    } catch {
      survivorAlive = false;
    }
    assert.equal(survivorAlive, false, `the grandchild (${survivor}) outlived its process group`);
  } finally {
    rmSync(marker, { force: true });
  }
});

test('tooling: vendor show prints the manifest the app is pinned to', async () => {
  const result = await tool(['tools/vendor.js', 'show']);
  assert.equal(result.code, 0, result.stderr.slice(0, 400));
  const manifest = JSON.parse(result.stdout);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.artifact['three.module.min.js'].sha256, 'the manifest must carry the artifact hash');
  assert.equal(manifest.importedAs, 'three', 'the manifest must state the specifier the bundle answers to');
});

test('tooling: test.js refuses arguments it does not read', async () => {
  // `test.js browser interaction` used to run the unit suite and exit 0. A runner that answers a
  // question it was not asked is worse than one that crashes, so both halves are pinned: the
  // refusal, and that nothing ran before it.
  const positional = await tool(['tools/test.js', 'browser', 'interaction']);
  assert.equal(positional.code, 2, `expected a refusal, got exit ${positional.code}`);
  assert.match(positional.stdout, /"browser interaction" is not something test\.js takes/);
  assert.doesNotMatch(positional.stdout, /== unit suite|== browser suite/,
    'it ran a suite on its way to refusing');
  assert.match(positional.stdout, /--browser/, 'the refusal has to say what to type instead');

  const flag = await tool(['tools/test.js', '--br0wser']);
  assert.equal(flag.code, 2, `expected a refusal, got exit ${flag.code}`);
  assert.match(flag.stdout, /--br0wser is not a flag test\.js reads/);

  // The guards must not eat the ways people actually use the tool.
  const listed = await tool(['tools/test.js', '--list', '--browser']);
  assert.equal(listed.code, 0, listed.stderr.slice(0, 300));
  assert.match(listed.stdout, /tests\/browser\/[a-z]+\.test\.js/);

  // `... | head -3` is ordinary use: the tool must end quietly when its reader goes away.
  const piped = await run('/bin/sh', ['-c', `cd ${PATHS.root} && node tools/test.js --list --browser | head -3`],
    { timeoutMs: NODE_TIMEOUT_MS });
  assert.equal(piped.code, 0, `a closed reading end must not crash the tool: ${piped.stderr.slice(0, 300)}`);
  assert.doesNotMatch(piped.stderr, /EPIPE|Unhandled/, 'writing into a closed pipe raised a stack trace');
});

test('tooling: every CLI refuses arguments it cannot read', async () => {
  const cases = [
    { tool: 'lint.js', args: ['src/config.js'], expect: /"src\/config\.js" is not something lint\.js takes/ },
    { tool: 'lint.js', args: ['--verbose-y'], expect: /--verbose-y is not a flag lint\.js reads/ },
    { tool: 'test.js', args: ['browser', 'interaction'], expect: /"browser interaction" is not something test\.js takes/ },
    { tool: 'timebox.js', args: ['--timout', '90', 'true'], expect: /--timout is not a flag timebox\.js reads/ },
    { tool: 'vendor.js', args: ['show', '--json'], expect: /--json is not a flag vendor\.js reads/ },
    { tool: 'browser.js', args: ['shot', '--force'], expect: /--force is not a flag browser\.js shot reads/ },
    { tool: 'browser.js', args: ['status', 'extra'], expect: /"extra" is not something browser\.js status takes/ },
    // The one with consequences: a mistyped flag used to fall through to the default and listen.
    { tool: 'staticserver.js', args: ['--prob', '8123'], expect: /--prob is not a flag staticserver\.js reads/ },
  ];
  for (const { tool: script, args, expect } of cases) {
    const result = await tool([`tools/${script}`, ...args]);
    assert.equal(result.code, 2, `${script} ${args.join(' ')} exited ${result.code} instead of refusing`);
    assert.match(result.stdout, expect, `${script} ${args.join(' ')} refused without naming the argument`);
    assert.match(result.stdout, /\n  \S/, `${script} ${args.join(' ')}: a refusal has to say what to type`);
  }
});

test('tooling: the arguments the CLIs do read still work', async () => {
  const cases = [
    ['lint.js', []],
    ['lint.js', ['--json']],
    ['lint.js', ['--verbose']],
    ['test.js', ['--list']],
    ['test.js', ['--list', '--browser']],
    ['timebox.js', ['-t', '20', '--', 'node', '-e', '0']],
    ['vendor.js', ['show']],
    ['vendor.js', ['check']],
    ['staticserver.js', ['status']],
    ['browser.js', ['status', '--all']],
  ];
  for (const [script, args] of cases) {
    const result = await tool([`tools/${script}`, ...args]);
    const said = `${result.stdout.slice(0, 200)}${result.stderr.slice(0, 200)}`;
    // lint.js may legitimately exit 1 while the tree has violations; what must never happen here is
    // exit 2, the code that means "I did not understand this invocation".
    assert.notEqual(result.code, 2, `${script} ${args.join(' ')} was refused: ${said}`);
    assert.ok(result.code === 0 || script === 'lint.js', `${script} ${args.join(' ')} failed: ${said}`);
    assert.doesNotMatch(said, /is not a flag|is not something/, `${script} ${args.join(' ')} was refused: ${said}`);
  }
});

test('tooling: the browser harness refuses session options it does not read', async () => {
  const { withApp } = await import('../harness/app.js');
  const started = Date.now();
  // The whole point is the shape of the failure: an unread option used to become a default, and the
  // run then failed much later as a timeout blaming the app for a typo in the test.
  await assert.rejects(() => withApp(async () => {}, { timeout: 5000 }),
    /"timeout" is not an option the session reads/);
  const elapsedMs = Date.now() - started;
  assert.ok(elapsedMs < 500, `a mistyped option must fail at once, took ${elapsedMs} ms`);

  await assert.rejects(() => withApp(async () => {}, { waitFor: 'idle', settle: 3 }),
    /"waitFor", "settle" are not options the session reads/);
  await assert.rejects(() => withApp(async () => {}, { viewport: { width: 900 } }),
    /viewport needs numeric width and height/);
});
