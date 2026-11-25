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
import { run, spawnDetached, terminate } from '../../tools/lib/proc.js';
import { isPortFree } from '../../tools/lib/browser.js';
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

test('tooling: vendor show prints the manifest the app is pinned to', async () => {
  const result = await tool(['tools/vendor.js', 'show']);
  assert.equal(result.code, 0, result.stderr.slice(0, 400));
  const manifest = JSON.parse(result.stdout);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.artifact['three.module.min.js'].sha256, 'the manifest must carry the artifact hash');
  assert.equal(manifest.importedAs, 'three', 'the manifest must state the specifier the bundle answers to');
});
