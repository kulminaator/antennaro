/**
 * The browser CLI drives the page you opened, not one it invented.
 *
 * Layer: test (browser).
 *
 * `open <url>` then `eval "..."` is the obvious way to poke at a running app, and for a while it
 * answered truthfully about the wrong page: both `eval` and `shot` created a fresh target and, with
 * no `--url`, navigated it to `about:blank`. `document.title` came back empty and `window.__sim`
 * came back undefined - which reads like "the app is broken" rather than "you are asking a blank
 * page". A tool that answers a different question than it was asked is the defect this file pins,
 * and the second test is the half that matters most: when there is no page to drive, the CLI has to
 * say so instead of producing a result.
 *
 * These run the real CLI in a real Chromium, so they are in the browser group rather than with the
 * unit tooling tests, which never launch a browser.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { PATHS } from '../../tools/lib/paths.js';
import { run } from '../../tools/lib/proc.js';
import { stopBrowser } from '../../tools/lib/browser.js';
import { startServer } from '../../tools/staticserver.js';

const NAME = `cli-${process.pid}`;
const EMPTY_NAME = `cli-${process.pid}-empty`;
const CLI_TIMEOUT_MS = 90_000;

const cli = (...args) => run(process.execPath, ['tools/browser.js', ...args], { timeoutMs: CLI_TIMEOUT_MS });

test('browser: browser.js drives the page that is already open', async () => {
  const server = await startServer({ port: 0, quiet: true });
  const shotPath = join(PATHS.artifacts, `cli-shot-${process.pid}.png`);
  rmSync(shotPath, { force: true });
  try {
    const opened = await cli('open', server.url, '--name', NAME);
    assert.equal(opened.code, 0, `open failed: ${opened.stderr}`);
    assert.match(opened.stdout, /opened /, 'open did not report the page it opened');

    const title = await cli('eval', 'document.title', '--name', NAME);
    assert.equal(title.code, 0, `eval failed: ${title.stderr}`);
    assert.match(title.stdout, /Antenna/,
      `eval is not answering about the opened page - it said ${JSON.stringify(title.stdout)}`);
    assert.match(title.stderr, /reusing the open page/,
      'eval did not say which page it drove, so a wrong one would look like a right answer');

    const view = await cli('eval', 'window.__sim.state().display.coverageView', '--name', NAME);
    assert.equal(JSON.parse(view.stdout), 'steps',
      'the page eval drove is not the app - it has no coverage state');

    const pages = await cli('pages', '--name', NAME, '--json');
    const targets = JSON.parse(pages.stdout);
    assert.ok(targets.some((t) => String(t.url).startsWith(server.url)),
      'a command that borrows a page must not close it; the page is gone from the browser');

    const shot = await cli('shot', shotPath, '--name', NAME);
    assert.equal(shot.code, 0, `shot failed: ${shot.stderr}`);
    assert.ok(existsSync(shotPath), `shot ignored the positional output path ${shotPath}`);
    assert.ok(statSync(shotPath).size > 10_000,
      `the picture written to the positional path is ${(statSync(shotPath).size / 1024).toFixed(0)} KiB - too small to be a rendered map`);
  } finally {
    rmSync(shotPath, { force: true });
    await stopBrowser({ name: NAME, force: false }).catch(() => {});
    await server.close().catch(() => {});
  }
});

test('browser: browser.js refuses to invent a page when none is open', async () => {
  try {
    const evalRes = await cli('eval', 'document.title', '--name', EMPTY_NAME);
    assert.notEqual(evalRes.code, 0,
      'eval succeeded against a page nobody opened - it is driving an invented target again');
    assert.match(`${evalRes.stdout}${evalRes.stderr}`, /no page is open/,
      `the failure has to be actionable, and it said: ${evalRes.stdout}${evalRes.stderr}`);

    const shotRes = await cli('shot', '--name', EMPTY_NAME);
    assert.notEqual(shotRes.code, 0, 'shot wrote a picture of a page that does not exist');
    assert.match(`${shotRes.stdout}${shotRes.stderr}`, /no page is open/);
  } finally {
    await stopBrowser({ name: EMPTY_NAME, force: false }).catch(() => {});
  }
});
