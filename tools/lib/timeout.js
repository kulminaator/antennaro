/**
 * Time budget helpers.
 *
 * Project rule (GUIDELINES.md §10): no `await` in a tool or a test without one
 * of these wrapping it. Every number comes from `src/config.js` TIMEOUTS so a
 * budget can be changed in exactly one place.
 */

import { readFileSync } from 'node:fs';

/** Default budget for anything not otherwise specified. */
export const DEFAULT_TIMEOUT_MS = 60_000;

export class TimeoutError extends Error {
  constructor(message, ms) {
    super(`${message} (timed out after ${ms} ms)`);
    this.name = 'TimeoutError';
    this.timeoutMs = ms;
  }
}

/** Resolved after `ms`; never use bare setTimeout in test logic. */
export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Reject with TimeoutError if `promise` is still pending after `ms`.
 * The underlying promise is NOT cancelled - callers that own a resource must
 * clean it up in a finally block.
 */
export function withTimeout(promise, ms = DEFAULT_TIMEOUT_MS, label = 'operation') {
  let timer;
  const guarded = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    Promise.resolve(promise).then(resolve, reject);
  });
  return guarded.finally(() => clearTimeout(timer));
}

/**
 * Poll `probe` until it returns a truthy value or the budget runs out.
 * @returns {Promise<unknown>} the truthy probe result
 */
export async function waitFor(probe, { timeoutMs = 10_000, intervalMs = 60, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  for (;;) {
    try {
      const value = await probe();
      if (value) return value;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() > deadline) {
      const suffix = lastError ? ` - last error: ${lastError.message}` : '';
      throw new TimeoutError(`${label} not met${suffix}`, timeoutMs);
    }
    await sleep(intervalMs);
  }
}

/** A monotonic deadline object: `budget.remaining()`, `budget.expired()`. */
export function createBudget(totalMs) {
  const start = Date.now();
  return {
    totalMs,
    elapsed: () => Date.now() - start,
    remaining: () => Math.max(0, totalMs - (Date.now() - start)),
    expired: () => Date.now() - start >= totalMs,
  };
}

/** Read a JSON file, returning `fallback` when it is missing or corrupt. */
export function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}
