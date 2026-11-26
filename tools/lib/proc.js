/**
 * Process spawning with enforced time budgets.
 *
 * Project rule: nothing may be spawned without a deadline. `run()` guarantees a
 * settled result ({code, stdout, stderr, timedOut}) and always leaves no orphan
 * process behind: SIGTERM first, then SIGKILL to the whole process group after a
 * grace period. This is what makes `npm test` safe to run unattended.
 */

import { spawn, spawnSync } from 'node:child_process';
import { openSync } from 'node:fs';
import { DEFAULT_TIMEOUT_MS, withTimeout } from './timeout.js';

const KILL_GRACE_MS = 1500;

/**
 * Run a command to completion with a hard wall-clock budget.
 * @param {string} command
 * @param {string[]} args
 * @param {{timeoutMs?:number, cwd?:string, env?:object, input?:string,
 *   maxBufferBytes?:number, killGraceMs?:number, echo?:boolean}} [options]
 * @returns {Promise<{code:number|null, signal:string|null, stdout:string, stderr:string,
 *   timedOut:boolean, killed:boolean, durationMs:number, truncated:boolean}>}
 */
export function run(command, args = [], options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    cwd,
    env,
    input,
    maxBufferBytes = 4 * 1024 * 1024,
    killGraceMs = KILL_GRACE_MS,
    echo = false,
  } = options;
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Own process group so the whole tree dies, not just the shell wrapper.
      detached: process.platform !== 'win32',
    });

    let stdout = '';
    let stderr = '';
    let truncated = false;
    let killed = false;
    let settled = false;

    const append = (which, chunk) => {
      const target = which === 'stdout' ? 'stdout' : 'stderr';
      if (stdout.length + stderr.length > maxBufferBytes) {
        truncated = true;
        return;
      }
      if (target === 'stdout') stdout += chunk;
      else stderr += chunk;
    };

    child.stdout.on('data', (chunk) => {
      append('stdout', chunk.toString());
      if (echo) process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      append('stderr', chunk.toString());
      if (echo) process.stderr.write(chunk);
    });
    if (input !== undefined) {
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }

    const killTree = (signal) => {
      killed = true;
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        /* already gone */
      }
    };

    let timer = setTimeout(() => {
      killTree('SIGTERM');
      timer = setTimeout(() => killTree('SIGKILL'), killGraceMs);
    }, timeoutMs);

    const finish = (code, signal, timedOut) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code,
        signal,
        stdout,
        stderr,
        timedOut,
        killed,
        truncated,
        durationMs: Date.now() - startedAt,
      });
    };

    child.on('error', (error) => {
      stderr += `\nspawn failed: ${error.message}`;
      finish(-1, null, false);
    });
    child.on('close', (code, signal) => finish(code, signal, killed && code === null));
  });
}

/**
 * Synchronous variant for tiny CLI helpers that must never hang.
 * @returns {{code:number|null, signal:string|null, stdout:string, stderr:string, timedOut:boolean, error:Error|null}}
 */
export function runSync(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    encoding: 'utf8',
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    code: result.status,
    signal: result.signal ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut: Boolean(result.error && /ETIMEDOUT|ETIMEOUT/i.test(result.error.code ?? '')),
    error: result.error ?? null,
  };
}

/**
 * Start a long-running process detached from this CLI, logging to `logFile`.
 * Returns the pid; the caller is responsible for the lifecycle file.
 * @returns {number}
 */
export function spawnDetached(command, args = [], options = {}) {
  const { cwd, env, logFile } = options;
  const out = logFile ? openSync(logFile, 'a') : 'ignore';
  const child = spawn(command, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  return child.pid;
}

/** True when `pid` exists and is not a zombie we own. */
export function isAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask a process to die, escalating on a deadline:
 * onTerminate (e.g. a graceful CDP Browser.close) -> SIGTERM -> SIGKILL.
 * @param {number} pid
 * @param {{graceful?:()=>Promise<unknown>, termMs?:number, killMs?:number, group?:boolean}} [options]
 *   `group: true` signals the whole process group (the children too), which is
 *   what a detached browser needs: killing only its leader orphans the GPU and
 *   renderer processes.
 * @returns {Promise<{stopped:boolean, how:string}>}
 */
/**
 * Does anything in process group `pgid` still run?
 *
 * The recorded pid is not enough: Chromium starts as a shell wrapper, so the
 * wrapper can exit on SIGTERM while the real browser and its GPU and network
 * children ignore it and keep running as orphans. Zombies do not count - the
 * wrapper stays one until we reap it.
 * @param {number} pgid
 * @returns {boolean}
 */
export function isGroupAlive(pgid) {
  if (process.platform === 'win32') return isAlive(pgid);
  try {
    process.kill(-pgid, 0);
  } catch (error) {
    if (error?.code !== 'EPERM') return false;
  }
  const probe = spawnSync('ps', ['-o', 'stat=', '-g', String(pgid)], { encoding: 'utf8', timeout: 1500 });
  if (probe.status !== 0) return isAlive(pgid);
  return probe.stdout
    .split('\n')
    .map((line) => line.trim())
    .some((stat) => stat.length > 0 && !stat.startsWith('Z'));
}

export async function terminate(pid, options = {}) {
  const { graceful, termMs = 4000, killMs = 2500, group = false } = options;
  const signal = (which) => {
    try {
      if (group && process.platform !== 'win32') process.kill(-pid, which);
      else process.kill(pid, which);
      return true;
    } catch {
      return false;
    }
  };
  const signalChildren = () => {
    if (!group || process.platform === 'win32') return;
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      /* group already gone */
    }
  };
  const alive = () => (group && process.platform !== 'win32' ? isGroupAlive(pid) : isAlive(pid));
  if (!alive()) {
    // The leader may be gone while its detached children keep running.
    try {
      if (group && process.platform !== 'win32') process.kill(-pid, 'SIGKILL');
    } catch {
      /* nothing left in the group */
    }
    return { stopped: true, how: 'already-exited' };
  }

  if (graceful) {
    try {
      await withTimeout(Promise.resolve(graceful()), Math.min(2000, termMs), 'graceful terminate');
    } catch {
      /* fall through to signals */
    }
  }
  if (!alive()) return { stopped: true, how: 'graceful' };

  if (!signal('SIGTERM')) return { stopped: !alive(), how: 'signal-race' };
  const deadline = Date.now() + termMs;
  while (Date.now() < deadline) {
    if (!alive()) return { stopped: true, how: 'SIGTERM' };
    await new Promise((r) => setTimeout(r, 80));
  }

  signal('SIGKILL');
  const killDeadline = Date.now() + killMs;
  while (Date.now() < killDeadline) {
    if (!alive()) {
      signalChildren();
      return { stopped: true, how: 'SIGKILL' };
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  signalChildren();
  return { stopped: false, how: 'stuck' };
}

/**
 * Treat a closed reading end as the end of the conversation, not a crash.
 *
 * `tools/test.js --list | head -3` is ordinary use, and it used to end in a stack trace: once
 * `head` exits, the next write gets EPIPE, Node raises an unhandled `error` event on stdout, and the
 * tool dies loudly after it had already given the answer. Output queued behind a live socket runs
 * into the same thing on the way out - which is also why `exitAfterFlush` exists. So each CLI
 * installs this once at startup: a broken pipe ends the run quietly, with the code the tool had
 * already earned.
 */
export function guardBrokenPipe() {
  const quiet = () => (error) => {
    if (error && error.code === 'EPIPE') process.exit(process.exitCode ?? 0);
    throw error;
  };
  process.stdout.on('error', quiet());
  process.stderr.on('error', quiet());
}

/**
 * Exit a CLI reliably.
 *
 * A CLI that touched `fetch` or a WebSocket can sit on a draining keep-alive
 * socket long after its work is done. This flushes stdout, then hard-exits if
 * the event loop has not emptied within `graceMs`.
 * @param {number} code
 * @param {number} [graceMs]
 */
export function exitAfterFlush(code, graceMs = 1200) {
  process.exitCode = code;
  const timer = setTimeout(() => process.exit(code), graceMs);
  // Keep the timer unref'd so a clean process still exits by itself.
  timer.unref?.();
}
