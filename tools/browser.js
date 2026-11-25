#!/usr/bin/env node
/**
 * Browser control CLI.
 *
 *   node tools/browser.js doctor                     # is this environment usable?
 *   node tools/browser.js start [--name dev] [--url URL] [--headful]
 *   node tools/browser.js status [--name dev | --all]
 *   node tools/browser.js stop   [--name dev | --all] [--force]
 *   node tools/browser.js open URL [--name dev]
 *   node tools/browser.js eval "1+1" [--name dev] [--url URL]
 *   node tools/browser.js shot [--url URL] [--out .tmp/artifacts/shot.png]
 *   node tools/browser.js pages [--name dev]
 *
 * A started instance is *persistent*: iterate against it with `eval`/`shot`
 * instead of relaunching Chromium for every experiment. `stop` is always safe,
 * even after a crash (`stop --all` sweeps everything under .tmp/browser).
 *
 * Every subcommand runs under a deadline; nothing here can hang a terminal.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { numFlag, parseArgs, usage } from './lib/args.js';
import { PATHS, ensureDir, display } from './lib/paths.js';
import { withTimeout } from './lib/timeout.js';
import { exitAfterFlush } from './lib/proc.js';
import {
  findChrome,
  findOrphanPids,
  listInstances,
  startBrowser,
  statusBrowser,
  stopAllBrowsers,
  stopBrowser,
  versionInfo,
} from './lib/browser.js';
import { CdpConnection, evaluate, openPage, screenshot, waitForExpression } from './lib/cdp.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const USAGE_TEXT = `
browser.js - start / stop / drive a headless Chromium through CDP

  doctor [--json]                          check binary, WebGL2 and CDP end to end
  start   [--name dev] [--url URL] [--headful] [--flag F]
  status  [--name dev | --all] [--json]
  stop    [--name dev | --all] [--force]
  open    URL [--name dev]
  eval    EXPR [--name dev] [--url URL] [--wait] [--timeout ms]
  shot    [--url URL] [--out FILE] [--name dev] [--width N] [--height N]
  pages   [--name dev] [--json]

  Env: SIM_CHROME=/abs/path/to/chrome overrides binary autodetection.
  State: .tmp/browser/<name>/{state.json,profile,browser.log}
`.trim();

async function connect(options) {
  const record = await startBrowser({ name: options.name, headless: !options.headful });
  const cdp = await CdpConnection.connect(record.wsEndpoint, { timeoutMs: 10_000 });
  return { record, cdp };
}

async function commandStatus(flags) {
  const names = flags.all ? listInstances() : [String(flags.name ?? 'dev')];
  const rows = [];
  for (const name of names) rows.push(await statusBrowser(name));
  // Processes outlive their state file; say so instead of reporting "stopped".
  const orphans = findOrphanPids();
  if (orphans.length > 0) {
    rows.push({
      name: `(unrecorded chromium processes x${orphans.length})`,
      state: 'stale',
      pid: orphans.join(','),
      processAlive: true,
    });
  }
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return orphans.length > 0 ? 2 : 0;
  }
  for (const row of rows) {
    if (row.state === 'running') {
      process.stdout.write(`${row.name}: running pid=${row.pid} port=${row.port} ${row.browser ?? ''}\n`);
    } else if (row.state === 'stale') {
      process.stdout.write(`${row.name}: STALE (pid=${row.pid} processAlive=${row.processAlive}) - run: browser.js stop --name ${row.name}\n`);
    } else {
      process.stdout.write(`${row.name}: stopped\n`);
    }
  }
  if (orphans.length > 0) {
    process.stdout.write(`run: node tools/browser.js stop --all  (sweeps these too)\n`);
  }
  return rows.some((row) => row.state === 'stale') ? 2 : 0;
}

async function commandStart(flags) {
  const extraFlags = flags.flag ? [String(flags.flag)] : [];
  const result = await startBrowser({
    name: String(flags.name ?? 'dev'),
    headless: !flags.headful,
    flags: extraFlags,
  });
  if (flags.url) {
    const { cdp } = await connect({ name: String(flags.name ?? 'dev') });
    const page = await openPage(cdp, String(flags.url), { timeoutMs: 25_000 });
    await cdp.close();
    process.stdout.write(`opened ${flags.url} in session ${page.sessionId}\n`);
  }
  process.stdout.write(
    `${result.reused ? 'reused' : 'started'} ${result.name}: pid=${result.pid} port=${result.port} ${result.browser}\n`
    + `  profile: ${display(result.profileDir)}\n`
    + `  log:     ${display(result.logFile)}\n`,
  );
  return 0;
}

async function commandStop(flags) {
  const all = Boolean(flags.all);
  const results = all
    ? await stopAllBrowsers()
    : await stopBrowser({ name: String(flags.name ?? 'dev'), force: Boolean(flags.force) });
  for (const row of results) process.stdout.write(`${row.name}: ${row.state} (${row.how})\n`);
  if (results.length === 0) process.stdout.write('no browser instances recorded, and no stray chromium processes found\n');
  return results.every((row) => row.state === 'stopped') ? 0 : 1;
}

async function commandPages(flags) {
  const name = String(flags.name ?? 'dev');
  const record = await startBrowser({ name });
  const response = await fetch(`http://127.0.0.1:${record.port}/json/list`);
  const targets = await response.json();
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(targets, null, 2)}\n`);
  } else {
    for (const target of targets) {
      process.stdout.write(`${target.type}\t${target.url}\t${target.title ?? ''}\n`);
    }
  }
  return 0;
}

async function commandOpen(flags, url) {
  if (!url) usage('open needs a URL\n\n' + USAGE_TEXT, 2);
  const name = String(flags.name ?? 'dev');
  const { cdp } = await connect({ name });
  const page = await openPage(cdp, url, { timeoutMs: 25_000 });
  const title = await evaluate(cdp, page.sessionId, 'document.title', { timeoutMs: 5000 }).catch(() => '');
  await cdp.close();
  process.stdout.write(`opened ${url}\n  target=${page.targetId}\n  title=${title}\n`);
  if (page.pageErrors.length > 0) {
    process.stdout.write(`  page errors: ${page.pageErrors.length}\n`);
    for (const error of page.pageErrors.slice(0, 5)) process.stdout.write(`    - ${error.message}\n`);
    return 3;
  }
  return 0;
}

async function commandEval(flags, expression) {
  const expr = expression ?? (typeof flags.expr === 'string' ? flags.expr : null);
  if (!expr) usage('eval needs an expression\n\n' + USAGE_TEXT, 2);
  const name = String(flags.name ?? 'dev');
  const { cdp } = await connect({ name });
  const url = flags.url ? String(flags.url) : 'about:blank';
  const page = await openPage(cdp, url, { timeoutMs: numFlag(flags, 'timeout', 25_000) });
  if (flags.wait) {
    await waitForExpression(cdp, page.sessionId, expr, {
      timeoutMs: numFlag(flags, 'timeout', 15_000),
      label: `expression ${expr}`,
    });
  }
  const value = await evaluate(cdp, page.sessionId, expr, { timeoutMs: numFlag(flags, 'timeout', 15_000) });
  await page.close().catch(() => {});
  await cdp.close();
  process.stdout.write(`${JSON.stringify(value, null, 2) ?? 'undefined'}\n`);
  return 0;
}

async function commandShot(flags) {
  const name = String(flags.name ?? 'dev');
  const url = flags.url ? String(flags.url) : 'about:blank';
  const out = flags.out ? String(flags.out) : join(PATHS.artifacts, `shot-${Date.now()}.png`);
  ensureDir(PATHS.artifacts);
  const { cdp } = await connect({ name });
  const page = await openPage(cdp, url, { timeoutMs: 25_000 });
  if (flags.width || flags.height) {
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: numFlag(flags, 'width', 1280), height: numFlag(flags, 'height', 800), deviceScaleFactor: 1, mobile: false },
      { sessionId: page.sessionId },
    );
  }
  // Wait for a real boot, then force a few frames. An expression that is
  // vacuously true while `window.__sim` is still loading would capture a blank
  // page, so the readiness check must be able to fail.
  await waitForExpression(cdp, page.sessionId, 'Boolean(window.__sim && window.__sim.ready)', {
    timeoutMs: 20_000,
    label: 'app boot before screenshot',
  }).catch(() => false);
  await evaluate(cdp, page.sessionId, 'window.__sim && window.__sim.settle(3)').catch(() => undefined);
  const buffer = await screenshot(cdp, page.sessionId, { timeoutMs: 20_000 });
  writeFileSync(out, buffer);
  await page.close().catch(() => {});
  await cdp.close();
  process.stdout.write(`wrote ${display(out)} (${(buffer.length / 1024).toFixed(0)} KiB)\n`);
  return 0;
}

async function commandDoctor(flags) {
  const binary = findChrome({ quiet: true });
  const report = { binary, checks: [], ok: true };
  const note = (name, ok, detail) => {
    report.checks.push({ name, ok, detail });
    if (!ok) report.ok = false;
  };

  note('chromium binary', Boolean(binary), binary ?? 'set SIM_CHROME to override autodetection');
  if (!binary) return finish(report, flags);

  const threeEntry = join(PATHS.vendorThree, 'three.module.js');
  const fs = await import('node:fs');
  note('vendored three.js', fs.existsSync(threeEntry), `${display(threeEntry)} (run: node tools/vendor.js)`);

  let record = null;
  let cdp = null;
  try {
    record = await startBrowser({ name: 'doctor' });
    note('cdp start', Boolean(record.port), `pid=${record.pid} port=${record.port} ${record.browser}`);
    const version = await versionInfo(record.port);
    note('cdp http', Boolean(version), version ? `${version.browser} protocol ${version.protocolVersion}` : 'no answer');

    cdp = await CdpConnection.connect(record.wsEndpoint, { timeoutMs: 10_000 });
    const page = await openPage(cdp, 'about:blank', { timeoutMs: 15_000 });
    const probe = await evaluate(cdp, page.sessionId, `(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      if (!gl) return { webgl2: false };
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        webgl2: true,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        userAgent: navigator.userAgent,
      };
    })()`, { timeoutMs: 15_000 });
    note('webgl2', Boolean(probe?.webgl2), probe?.renderer ?? 'no WebGL2 context');
    await page.close().catch(() => {});
    await cdp.close();
  } catch (error) {
    note('browser session', false, error.message);
  } finally {
    if (cdp) await cdp.close().catch(() => {});
    if (record) await stopBrowser({ name: 'doctor', force: true }).catch(() => {});
  }
  return finish(report, flags);
}

function finish(report, flags) {
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    for (const check of report.checks) {
      process.stdout.write(`${check.ok ? 'ok  ' : 'FAIL'} ${check.name}: ${check.detail ?? ''}\n`);
    }
  }
  return report.ok ? 0 : 1;
}

const COMMANDS = {
  doctor: commandDoctor,
  start: commandStart,
  stop: commandStop,
  status: commandStatus,
  pages: commandPages,
  open: commandOpen,
  eval: commandEval,
  shot: commandShot,
  screenshot: commandShot,
};

async function main() {
  const parsed = parseArgs(process.argv.slice(2), { aliases: { n: 'name', u: 'url', o: 'out', t: 'timeout' } });
  if (parsed.help || parsed._.length === 0) usage(USAGE_TEXT, parsed.help ? 0 : 2);
  const command = COMMANDS[parsed._[0]];
  if (!command) usage(`unknown command "${parsed._[0]}"\n\n${USAGE_TEXT}`, 2);

  const timeoutMs = numFlag(parsed.flags, 'budget', 120_000);
  try {
    const code = await withTimeout(command(parsed.flags, parsed._[1]), timeoutMs, `browser.js ${parsed._[0]}`);
    exitAfterFlush(code ?? 0);
  } catch (error) {
    process.stderr.write(`browser.js ${parsed._[0]} failed: ${error.message}\n`);
    exitAfterFlush(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
