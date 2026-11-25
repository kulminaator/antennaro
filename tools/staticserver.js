#!/usr/bin/env node
/**
 * Zero-dependency static file server for the app and for browser tests.
 *
 *   node tools/staticserver.js                        # http://127.0.0.1:8080
 *   node tools/staticserver.js --port 0 --print-url    # ephemeral port, print URL
 *   node tools/staticserver.js stop                    # kill a detached instance
 *   node tools/staticserver.js status
 *
 * This exists only for development convenience: the app is plain static files,
 * so `python3 -m http.server` (or GitHub Pages) serves it just as well. Because
 * the repository root *is* the web root, this server refuses to hand out the
 * development-only directories (`.git`, `.tmp`, `node_modules`, ...) that a
 * clone also contains - see SERVE_DENY.
 *
 * Loopback-only by default, `no-store` on every response, strict path-traversal
 * guard, and a loopback `POST /-/shutdown` so a detached server can be stopped
 * without hunting for its pid.
 */

import { createServer } from 'node:http';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PATHS, SERVE_DENY, display } from './lib/paths.js';
import { numFlag, parseArgs, usage } from './lib/args.js';
import { isAlive, terminate } from './lib/proc.js';
import { readJson } from './lib/timeout.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export const STATE_PATH = join(PATHS.tmp, 'server.json');

function mimeFor(path) {
  return MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/** True when `relPath` (no leading slash) is a development-only path. */
export function isDenied(relPath) {
  const head = relPath.split('/')[0];
  return SERVE_DENY.includes(head);
}

/**
 * Start a server. `port: 0` asks the OS for a free port (what tests should use).
 * @param {{port?:number, host?:string, quiet?:boolean}} [options]
 */
export async function startServer(options = {}) {
  const { port = 8080, host = '127.0.0.1', quiet = false } = options;

  const server = createServer((request, response) => {
    handle(request, response, { quiet }).catch((error) => {
      if (!response.headersSent) json(response, 500, { ok: false, error: String(error?.message ?? error) });
      else response.end();
    });
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, host, () => resolveListen());
  });

  const actualPort = server.address().port;
  return {
    server,
    host,
    port: actualPort,
    url: `http://${host}:${actualPort}/`,
    root: PATHS.webRoot,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolveClose) => server.close(() => resolveClose()));
    },
  };
}

function insideAny(candidate, roots) {
  return roots.some((root) => candidate === root || candidate.startsWith(root + sep));
}

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  if (clean.includes('\0')) return null;
  const relative = clean.replace(/^\/+/, '');
  if (isDenied(relative)) return null;
  const candidate = relative === '' ? join(PATHS.webRoot, 'index.html') : resolve(PATHS.webRoot, relative);
  return insideAny(candidate, [PATHS.webRoot]) ? candidate : null;
}

function json(response, status, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

async function handle(request, response, { quiet }) {
  const path = request.url ?? '/';

  if (path === '/-/health') {
    json(response, 200, {
      ok: true,
      root: display(PATHS.webRoot),
      index: existsSync(join(PATHS.webRoot, 'index.html')),
      denied: SERVE_DENY,
    });
    return;
  }

  if (path === '/-/shutdown') {
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, error: 'use POST' });
      return;
    }
    json(response, 200, { ok: true, bye: true });
    rmSync(STATE_PATH, { force: true });
    setTimeout(() => process.exit(0), 50);
    return;
  }

  const file = resolveFile(path);
  if (!file) {
    json(response, 403, { ok: false, error: 'forbidden path' });
    return;
  }

  let payload;
  try {
    payload = await readFile(file);
  } catch (error) {
    const code = error?.code ?? 'ERROR';
    const status = code === 'ENOENT' || code === 'EISDIR' ? 404 : code === 'EACCES' ? 403 : 500;
    if (!quiet) process.stdout.write(`${status} ${request.method} ${path} (${code})\n`);
    json(response, status, { ok: false, error: code, path });
    return;
  }

  if (!quiet) process.stdout.write(`200 ${request.method} ${path} ${display(file)} (${payload.length} B)\n`);
  response.writeHead(200, {
    'content-type': mimeFor(file),
    'content-length': payload.length,
    'cache-control': 'no-store, must-revalidate',
    'x-content-type-options': 'nosniff',
  });
  if (request.method === 'HEAD') response.end();
  else response.end(payload);
}

async function commandStop() {
  const state = readJson(STATE_PATH, null);
  if (!state?.pid) {
    process.stdout.write('no server record found\n');
    return 1;
  }
  if (!isAlive(state.pid)) {
    rmSync(STATE_PATH, { force: true });
    process.stdout.write(`pid ${state.pid} was already gone; removed the record\n`);
    return 0;
  }
  const outcome = await terminate(state.pid, { termMs: 3000, killMs: 1500 });
  rmSync(STATE_PATH, { force: true });
  process.stdout.write(`server ${outcome.stopped ? 'stopped' : 'FAILED to stop'} (${outcome.how})\n`);
  return outcome.stopped ? 0 : 1;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2), {
    aliases: { p: 'port', q: 'quiet' },
    booleans: ['print-url'],
  });

  if (parsed.help) {
    usage(`staticserver.js - static server for the app and the browser tests

  start [--port 8080] [--host 127.0.0.1] [--print-url] [--quiet]
  stop
  status`);
  }

  const sub = parsed._[0];

  if (sub === 'stop') {
    process.exitCode = await commandStop();
    return;
  }
  if (sub === 'status') {
    const state = readJson(STATE_PATH, null);
    process.stdout.write(state?.pid && isAlive(state.pid) ? `running pid=${state.pid} url=${state.url}\n` : 'stopped\n');
    return;
  }

  if (!existsSync(join(PATHS.webRoot, 'index.html'))) {
    process.stderr.write('index.html is missing from the web root\n');
    process.exitCode = 1;
    return;
  }

  const instance = await startServer({
    port: numFlag(parsed.flags, 'port', 8080),
    host: String(parsed.flags.host ?? '127.0.0.1'),
    quiet: Boolean(parsed.flags.quiet),
  });
  writeFileSync(STATE_PATH, `${JSON.stringify({ pid: process.pid, url: instance.url, startedAt: Date.now() }, null, 2)}\n`);
  process.stdout.write(`serving ${display(PATHS.webRoot)} at ${instance.url} (denied: ${SERVE_DENY.join(', ')})\n`);
  if (parsed.flags['print-url']) process.stdout.write(`${instance.url}\n`);
  process.stdout.write('stop with Ctrl-C or: node tools/staticserver.js stop\n');

  const shutdown = () => {
    instance.close().then(() => {
      rmSync(STATE_PATH, { force: true });
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
