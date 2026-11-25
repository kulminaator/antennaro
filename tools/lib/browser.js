/**
 * Headless Chromium lifecycle: find it, start it, connect to it, stop it.
 *
 * Design notes (why this file exists):
 *  - The browser is the most expensive, flakiest and most orphan-prone part of
 *    the toolchain, so its lifecycle lives in exactly one module.
 *  - Start uses `--remote-debugging-port=0`; the OS-assigned port is read from
 *    `<profile>/DevToolsActivePort` instead of guessing/hunting free ports.
 *  - Each named instance owns a directory under `.tmp/browser/<name>/` holding
 *    `profile/`, `state.json` and `browser.log`. `stop --all` can therefore
 *    clean up orphans left by a crashed run without scanning the process table.
 *  - Stop is always graceful-then-escalating: CDP Browser.close, SIGTERM,
 *    SIGKILL, each with its own deadline; the profile is deleted afterwards.
 */

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS, ensureDir } from './paths.js';
import { isAlive, spawnDetached, terminate } from './proc.js';
import { readJson, sleep, waitFor, withTimeout } from './timeout.js';
import net from 'node:net';

const DEFAULT_NAME = 'dev';
const LAUNCH_TIMEOUT_MS = 25_000;
const POLL_MS = 40;

/** Chromium flags this project relies on. Keep the reasons next to the flags. */
export function baseFlags({ userDataDir, headless = true }) {
  return [
    ...(headless ? ['--headless=new'] : []),
    `--user-data-dir=${userDataDir}`,
    // Port 0 asks the OS for a free port; the real one is read from
    // DevToolsActivePort. Prevents the classic "port already in use" flake.
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-extensions',
    '--disable-component-update',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-sandbox', // container has no user-namespace sandbox
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    // Software GL: this environment has no GPU, and Chrome refuses the automatic
    // SwiftShader fallback unless it is opted into explicitly.
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--window-size=1440,900',
    '--lang=en-US',
  ];
}

/** Locate the Chromium binary. Override with `SIM_CHROME=/path/to/chrome`. */
export function findChrome({ quiet = false } = {}) {
  const candidates = [
    process.env.SIM_CHROME,
    process.env.CHROME_PATH,
    '/usr/bin/chromium-headless-shell',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  // Fall back to a PATH lookup for bare command names.
  for (const name of ['chromium-headless-shell', 'chromium', 'google-chrome', 'chrome']) {
    const found = which(name);
    if (found) return found;
  }
  if (!quiet) {
    throw new Error('no Chromium binary found; set SIM_CHROME=/absolute/path/to/chrome');
  }
  return null;
}

function which(name) {
  const pathEntries = (process.env.PATH ?? '').split(':');
  for (const dir of pathEntries) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function instanceDir(name = DEFAULT_NAME) {
  return join(PATHS.browserProfiles, name);
}

export function statePath(name = DEFAULT_NAME) {
  return join(instanceDir(name), 'state.json');
}

/**
 * Start a named browser instance. Idempotent: if the instance is already alive
 * and reachable it is returned as-is (`reused: true`).
 *
 * @param {{name?:string, url?:string, headless?:boolean, flags?:string[],
 *   timeoutMs?:number, env?:object}} [options]
 * @returns {Promise<{name:string, pid:number, port:number, wsEndpoint:string,
 *   profileDir:string, logFile:string, reused:boolean, startedAt:number}>}
 */
export async function startBrowser(options = {}) {
  const {
    name = DEFAULT_NAME,
    headless = true,
    flags = [],
    timeoutMs = LAUNCH_TIMEOUT_MS,
    env = {},
  } = options;

  const existing = readState(name);
  if (existing && isAlive(existing.pid)) {
    const version = await versionInfo(existing.port).catch(() => null);
    if (version) return { ...existing, reused: true, version };
  }
  if (existing) cleanupFiles(name); // stale record from a crashed run

  const dir = ensureDir(instanceDir(name));
  const profileDir = ensureDir(join(dir, 'profile'));
  const logFile = join(dir, 'browser.log');
  const chrome = findChrome();

  const args = [...baseFlags({ userDataDir: profileDir, headless }), ...flags];
  const pid = spawnDetached(chrome, args, { env, logFile });

  const activePortFile = join(profileDir, 'DevToolsActivePort');
  const info = await waitFor(
    () => {
      if (!isAlive(pid)) throw new Error(`chromium exited during startup (see ${logFile})`);
      if (!existsSync(activePortFile)) return null;
      const lines = readFileSync(activePortFile, 'utf8').trim().split('\n');
      const port = Number(lines[0]);
      if (!Number.isFinite(port) || port <= 0) return null;
      return { port, browserGuidPath: lines[1] };
    },
    { timeoutMs: timeoutMs - 4000, intervalMs: POLL_MS, label: 'DevToolsActivePort' },
  );

  const version = await waitFor(
    async () => {
      const payload = await versionInfo(info.port).catch(() => null);
      return payload ? { ...payload, port: info.port } : null;
    },
    { timeoutMs: 8000, intervalMs: 80, label: 'DevTools /json/version' },
  );

  const record = {
    name,
    pid,
    port: info.port,
    wsEndpoint: version.webSocketDebuggerUrl,
    browser: version.browser,
    protocolVersion: version.protocolVersion,
    profileDir,
    logFile,
    startedAt: Date.now(),
  };
  writeFileSync(statePath(name), `${JSON.stringify(record, null, 2)}\n`);
  return { ...record, reused: false };
}

/** @returns {{port:number, browser:string, webSocketDebuggerUrl:string}|null} */
export async function versionInfo(port, { timeoutMs = 1500 } = {}) {
  if (!Number.isFinite(port) || port <= 0) return null;
  try {
    const response = await withTimeout(fetch(`http://127.0.0.1:${port}/json/version`), timeoutMs, 'version fetch');
    if (!response.ok) return null;
    const payload = await response.json();
    return {
      port,
      browser: payload.Browser ?? '',
      webSocketDebuggerUrl: payload.webSocketDebuggerUrl ?? '',
      protocolVersion: payload['Protocol-Version'] ?? '',
      userAgent: payload['User-Agent'] ?? '',
    };
  } catch {
    return null;
  }
}

/** Read the on-disk record of an instance (does not check liveness). */
export function readState(name = DEFAULT_NAME) {
  return readJson(statePath(name), null);
}

/**
 * Is it actually alive *and* speaking CDP? `stopped` means "no record";
 * `stale` means "record exists but nothing answers" (kill it and clean up).
 */
export async function statusBrowser(name = DEFAULT_NAME) {
  const record = readState(name);
  if (!record) return { name, state: 'stopped' };
  const processAlive = isAlive(record.pid);
  const version = processAlive ? await versionInfo(record.port) : null;
  if (processAlive && version) {
    return { name, state: 'running', pid: record.pid, port: record.port, browser: version.browser, startedAt: record.startedAt };
  }
  return { name, state: 'stale', pid: record.pid, port: record.port, processAlive };
}

export function listInstances() {
  if (!existsSync(PATHS.browserProfiles)) return [];
  return readdirSync(PATHS.browserProfiles, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * Stop one instance. Never waits longer than the sum of its own deadlines.
 * @param {{name?:string, all?:boolean, force?:boolean}} [options]
 */
export async function stopBrowser(options = {}) {
  const { name = DEFAULT_NAME, all = false, force = false } = options;
  const names = all ? listInstances() : [name];
  const results = [];

  for (const target of names) {
    const record = readState(target);
    if (!record) {
      // No record: still drop the directory, so a crashed run cannot leave a
      // profile (or a DevToolsActivePort we might later mistake for live).
      cleanupFiles(target);
      results.push({ name: target, state: 'stopped', how: 'no-record' });
      continue;
    }
    let how = 'no-process';
    if (isAlive(record.pid)) {
      const graceful = force ? undefined : () => closeOverCdp(record.port);
      // Browsers are spawned detached: signal the whole group, or the GPU and
      // renderer children outlive the leader and pile up across test runs.
      const outcome = await terminate(record.pid, { graceful, group: true });
      how = outcome.how;
      if (!outcome.stopped) {
        results.push({ name: target, state: 'stuck', pid: record.pid, how });
        continue;
      }
    }
    cleanupFiles(target);
    results.push({ name: target, state: 'stopped', how });
  }
  return results;
}

async function closeOverCdp(port) {
  const info = await versionInfo(port, { timeoutMs: 1500 });
  if (!info || !info.webSocketDebuggerUrl) throw new Error('no CDP endpoint');
  const { CdpConnection } = await import('./cdp.js');
  const cdp = await CdpConnection.connect(info.webSocketDebuggerUrl, { timeoutMs: 2000 });
  await cdp.send('Browser.close', {}, { timeoutMs: 2000 }).catch(() => {});
  await cdp.close().catch(() => {});
}

function cleanupFiles(name) {
  rmSync(instanceDir(name), { recursive: true, force: true });
}

/** Best-effort sweep used by the test runner so a crash cannot leak browsers. */
export async function stopAllBrowsers() {
  const names = listInstances();
  if (names.length === 0) return [];
  return stopBrowser({ all: true });
}

/**
 * Stop leftover instances whose name matches `pattern` (used by the test runner
 * to sweep browsers a crashed run did not reap).
 * @returns {Promise<Array<{name:string, state:string, how:string}>>}
 */
export async function stopMatching(pattern) {
  const names = listInstances().filter((name) => pattern.test(name));
  if (names.length === 0) return [];
  const results = [];
  for (const name of names) results.push(...await stopBrowser({ name, force: true }));
  return results;
}

/** Wait until a URL answers, e.g. after starting the static server. */
/** True when nothing is listening on `port` (used to pick a free CDP/server port). */
export function isPortFree(port) {
  return new Promise((resolvePort) => {
    const server = net.createServer();
    server.once('error', () => resolvePort(false));
    server.once('listening', () => {
      server.close(() => resolvePort(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

export async function waitForHttp(url, { timeoutMs = 10_000, intervalMs = 60 } = {}) {
  return waitFor(
    async () => {
      try {
        const response = await withTimeout(fetch(url), 1200, 'health fetch');
        return response.ok ? response : null;
      } catch {
        return null;
      }
    },
    { timeoutMs, intervalMs, label: `http ${url}` },
  );
}

/** Re-exported for convenience in tools and tests. */
export { sleep };
