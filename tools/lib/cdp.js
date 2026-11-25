/**
 * Chrome DevTools Protocol client, zero dependencies.
 *
 * Node ships both `fetch` and `WebSocket`, so talking CDP directly is about 150
 * lines and keeps the project's single-dependency promise intact (no puppeteer,
 * no playwright). Every call carries a deadline; every wait is bounded.
 *
 * One connection = one browser. Pages are "sessions" multiplexed over the same
 * socket (Target.attachToTarget with flatten:true).
 */

import { DEFAULT_TIMEOUT_MS, TimeoutError, sleep, withTimeout } from './timeout.js';

const CALL_TIMEOUT_MS = 10_000;

export class CdpConnection {
  /** @param {WebSocket} socket */
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    /** @type {Map<number, {resolve:(v:any)=>void, reject:(e:any)=>void, label:string}>} */
    this.pending = new Map();
    /** @type {Set<(message:any)=>void>} */
    this.listeners = new Set();
    this.closed = false;
    this.closeReason = null;

    socket.addEventListener('message', (event) => this.#handleMessage(String(event.data)));
    socket.addEventListener('close', (event) => {
      this.closed = true;
      this.closeReason = event?.reason ?? 'socket closed';
      const error = new Error(`CDP socket closed (${this.closeReason})`);
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    });
    socket.addEventListener('error', () => {
      this.closed = true;
      this.closeReason = 'socket error';
    });
  }

  /**
   * @param {string} wsEndpoint ws://127.0.0.1:port/devtools/browser/<guid>
   * @param {{timeoutMs?:number}} [options]
   */
  static async connect(wsEndpoint, options = {}) {
    const { timeoutMs = CALL_TIMEOUT_MS } = options;
    const socket = await withTimeout(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(wsEndpoint);
        ws.addEventListener('open', () => resolve(ws), { once: true });
        ws.addEventListener('error', () => reject(new Error(`cannot open CDP socket ${wsEndpoint}`)), { once: true });
      }),
      timeoutMs,
      'CDP websocket connect',
    );
    return new CdpConnection(socket);
  }

  #handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message.id && this.pending.has(message.id)) {
      const entry = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${entry.label}: ${message.error.message}`));
      else entry.resolve(message.result ?? {});
      return;
    }
    for (const listener of Array.from(this.listeners)) listener(message);
  }

  /**
   * @param {string} method
   * @param {object} [params]
   * @param {{sessionId?:string, timeoutMs?:number}} [options]
   */
  send(method, params = {}, options = {}) {
    if (this.closed) return Promise.reject(new Error(`CDP connection closed (${this.closeReason})`));
    const { sessionId, timeoutMs = CALL_TIMEOUT_MS } = options;
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new TimeoutError(`CDP ${method}`, timeoutMs));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        label: `CDP ${method}`,
      });
      try {
        this.socket.send(JSON.stringify(payload));
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /** Subscribe to raw CDP events. Returns an unsubscribe function. */
  onEvent(handler) {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  /**
   * Wait for the first matching event. Enable the domain BEFORE calling this.
   * @returns {Promise<object>} event params
   */
  waitForEvent(method, { sessionId, timeoutMs = CALL_TIMEOUT_MS, predicate = () => true } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new TimeoutError(`event ${method}`, timeoutMs));
      }, timeoutMs);
      const off = this.onEvent((message) => {
        if (message.method !== method) return;
        if (sessionId && message.sessionId !== sessionId) return;
        if (!predicate(message.params ?? {})) return;
        clearTimeout(timer);
        off();
        resolve(message.params ?? {});
      });
    });
  }

  async close() {
    this.closed = true;
    try {
      this.socket.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Open a page and attach a flattened session.
 * @param {CdpConnection} cdp
 * @param {string} url
 * @param {{timeoutMs?:number, waitForLoad?:boolean}} [options]
 */
export async function openPage(cdp, url, options = {}) {
  const { timeoutMs = 25_000, waitForLoad = true } = options;
  const { targetId } = await cdp.send('Target.createTarget', { url }, { timeoutMs });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, { timeoutMs });

  const pageErrors = [];
  const consoleMessages = [];
  const off = cdp.onEvent((message) => {
    if (message.sessionId && message.sessionId !== sessionId) return;
    const params = message.params ?? {};
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = params.exceptionDetails ?? {};
      pageErrors.push({
        type: 'exception',
        message: detail.exception?.description ?? detail.text ?? 'unknown exception',
        url: detail.url ?? '',
        line: detail.lineNumber ?? 0,
      });
    } else if (message.method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'warning')) {
      consoleMessages.push({
        type: params.type,
        message: (params.args ?? []).map((arg) => arg.value ?? arg.description ?? arg.type).join(' '),
      });
    } else if (message.method === 'Log.entryAdded') {
      const entry = params.entry ?? {};
      if (entry.level === 'error') pageErrors.push({ type: 'log', message: entry.text ?? '', url: entry.url ?? '' });
    }
  });

  await cdp.send('Page.enable', {}, { sessionId, timeoutMs });
  await cdp.send('Runtime.enable', {}, { sessionId, timeoutMs });
  await cdp.send('Log.enable', {}, { sessionId, timeoutMs }).catch(() => {});

  if (waitForLoad) {
    // A fresh target starts as about:blank, whose readyState is already
    // "complete", so waiting for that alone can run before the real navigation
    // commits (and `import('/abs/path')` then fails with no base URL to resolve
    // against). Wait for the requested URL to be committed first.
    const wanted = url.split('#')[0];
    if (wanted !== 'about:blank') {
      await waitForExpression(cdp, sessionId, `document.location.href.startsWith(${JSON.stringify(wanted)})`, {
        timeoutMs,
        intervalMs: 40,
        label: `navigation committed to ${wanted}`,
      });
    }
    // Polling document.readyState is race-free: the load event may have fired
    // between createTarget and attach (about:blank does exactly that).
    await waitForExpression(cdp, sessionId, 'document.readyState === "complete"', {
      timeoutMs,
      intervalMs: 60,
      label: 'page readyState complete',
    });
  }

  return {
    targetId,
    sessionId,
    pageErrors,
    consoleMessages,
    async close() {
      off();
      await cdp.send('Target.closeTarget', { targetId }, { timeoutMs: 5000 }).catch(() => {});
    },
  };
}

/**
 * Evaluate an expression and return the value (structured-clone safe only).
 * Throws when the page throws.
 */
export async function evaluate(cdp, sessionId, expression, options = {}) {
  const { timeoutMs = CALL_TIMEOUT_MS, awaitPromise = true } = options;
  const response = await cdp.send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise },
    { sessionId, timeoutMs: Math.max(timeoutMs, 1000) },
  );
  const details = response.exceptionDetails;
  if (details) {
    const message = details.exception?.description ?? details.text ?? 'evaluation failed';
    throw new Error(`page evaluation threw: ${String(message).split('\n')[0]}`);
  }
  return response.result?.value;
}

/** Poll an in-page expression until it is truthy or the budget is exhausted. */
export async function waitForExpression(cdp, sessionId, expression, options = {}) {
  const { timeoutMs = 15_000, intervalMs = 100, label = 'page condition' } = options;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  for (;;) {
    try {
      const value = await evaluate(cdp, sessionId, expression, { timeoutMs: Math.max(1000, intervalMs * 6) });
      if (value) return value;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() > deadline) {
      throw new TimeoutError(`${label}${lastError ? ` - last error: ${lastError.message}` : ''}`, timeoutMs);
    }
    await sleep(intervalMs);
  }
}

/**
 * Capture the page as PNG.
 * @returns {Promise<Buffer>}
 */
export async function screenshot(cdp, sessionId, options = {}) {
  const { timeoutMs = 20_000, format = 'png', quality, clip } = options;
  const params = { format };
  if (quality !== undefined) params.quality = quality;
  if (clip) params.clip = { scale: 1, ...clip };
  const result = await cdp.send('Page.captureScreenshot', params, { sessionId, timeoutMs });
  return Buffer.from(result.data, 'base64');
}

/** Navigate an existing session and wait for the load event. */
export async function navigate(cdp, sessionId, url, options = {}) {
  const { timeoutMs = 25_000 } = options;
  const loaded = cdp.waitForEvent('Page.loadEventFired', { sessionId, timeoutMs });
  await cdp.send('Page.navigate', { url }, { sessionId, timeoutMs });
  await loaded;
}
