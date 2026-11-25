/**
 * Browser test harness: static server + headless Chromium + booted app, with
 * guaranteed teardown.
 *
 * A test asks for a session, drives `window.__sim`, and closes it. Everything
 * created here is registered for cleanup before it is used, so a failing
 * assertion can never leave a Chromium process behind. Every await is bounded by
 * a budget from `src/config.js` TIMEOUTS (GUIDELINES.md §10).
 *
 *   const session = await createAppSession();
 *   await session.settle();
 *   const stats = await session.sim('coverage');
 *   await session.close();
 *
 * or, when the test owns nothing else:
 *
 *   await withApp(async (session) => { ... });
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { TIMEOUTS } from '../../src/config.js';
import { PATHS } from '../../tools/lib/paths.js';
import { startServer } from '../../tools/staticserver.js';
import { startBrowser, stopBrowser } from '../../tools/lib/browser.js';
import { CdpConnection, evaluate, openPage, screenshot, waitForExpression } from '../../tools/lib/cdp.js';

/** Whole-session budget: boot, talk CDP, run the body, clean up. */
export const DEFAULT_TIMEOUT_MS = TIMEOUTS.browserTestPerFile;

let counter = 0;

/**
 * Boot the app in a private browser instance and wait until `window.__sim`
 * reports a ready boot.
 * @param {{name?:string, url?:string, timeoutMs?:number, viewport?:{width:number,height:number},
 *   query?:string}} [options]
 */
export async function createAppSession(options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  counter += 1;
  const name = options.name ?? `sim-test-${process.pid}-${counter}`;
  const started = { server: null, browser: null, cdp: null, page: null };

  async function cleanup() {
    const problems = [];
    if (started.cdp) {
      try {
        await started.cdp.close({ timeoutMs: 4000 });
      } catch { /* the browser may already be gone */ }
    }
    if (started.browser) {
      try {
        const results = await stopBrowser({ name, force: false });
        const stuck = results.filter((row) => row.state !== 'stopped');
        problems.push(...stuck.map((row) => `browser ${row.name} did not stop (${row.how})`));
      } catch (error) {
        problems.push(`stopBrowser threw: ${error?.message ?? error}`);
      }
    }
    if (started.server) {
      try {
        await started.server.close();
      } catch (error) {
        problems.push(`server close threw: ${error?.message ?? error}`);
      }
    }
    return problems;
  }

  try {
    const session = await runBounded(timeoutMs, 'create app session', async () => {
      // The suite runner exports SIM_URL and owns one shared server; running a
      // test file on its own must still work, so fall back to a private server.
      const shared = options.url ?? process.env.SIM_URL ?? '';
      if (!shared) started.server = await startServer({ port: 0, quiet: true });
      const url = `${shared || started.server.url}${options.query ?? ''}`;

      started.browser = await startBrowser({ name, timeoutMs: TIMEOUTS.browserLaunch });
      started.cdp = await CdpConnection.connect(started.browser.wsEndpoint, { timeoutMs: TIMEOUTS.cdpCall });
      started.page = await openPage(started.cdp, url, { timeoutMs: TIMEOUTS.pageNavigation });
      if (options.viewport) {
        await started.cdp.send('Emulation.setDeviceMetricsOverride', {
          width: options.viewport.width, height: options.viewport.height, deviceScaleFactor: 1, mobile: false,
        }, { sessionId: started.page.sessionId, timeoutMs: TIMEOUTS.cdpCall });
      }
      await waitForExpression(started.cdp, started.page.sessionId,
        'Boolean(window.__sim && window.__sim.boot && window.__sim.boot.status === "ready")', {
          timeoutMs: TIMEOUTS.pageSettle,
          intervalMs: 80,
          label: 'app boot (window.__sim.boot.status === ready)',
        });

      return buildSession({ ...options, name, url, started, cleanup });
    });
    return session;
  } catch (error) {
    await cleanup();
    throw error;
  }
}

function buildSession({ name, url, started, cleanup, viewport }) {
  const { cdp, page } = started;
  const sessionId = page.sessionId;

  const session = {
    name,
    url,
    port: Number(new URL(url).port) || 0,
    cdp,
    page,
    browser: started.browser,
    viewport,

    /** Evaluate an arbitrary expression in the page and return its value. */
    evaluate: (expression, evaluateOptions = {}) => evaluate(cdp, sessionId, expression, {
      timeoutMs: TIMEOUTS.cdpCall,
      ...evaluateOptions,
    }),

    /**
     * Call a `window.__sim` method and return a JSON-safe snapshot of its
     * result. Arguments are inlined as JSON, so keep them serialisable.
     */
    sim(method, ...callArgs) {
      const source = `(async () => {
        const api = window.__sim;
        if (!api) throw new Error('window.__sim is missing');
        if (typeof api[${JSON.stringify(method)}] !== 'function') throw new Error('no such testapi method: ${method}');
        const value = await api[${JSON.stringify(method)}](...${JSON.stringify(callArgs)});
        return JSON.parse(JSON.stringify(value === undefined ? null : value));
      })()`;
      return evaluate(cdp, sessionId, source, { timeoutMs: TIMEOUTS.cdpCall * 3, awaitPromise: true });
    },

    patch(values) {
      return session.sim('patch', values);
    },

    action(request) {
      return session.sim('action', request);
    },

    /** Rebuild everything and paint; throws if the frame loop is not running. */
    async settle(frames = 2) {
      const stats = await session.sim('settle', frames);
      if (stats.status !== 'active') throw new Error(`frame loop is "${stats.status}", expected "active"`);
      return stats;
    },

    waitFor(expression, waitForOptions = {}) {
      return waitForExpression(cdp, sessionId, expression, {
        timeoutMs: TIMEOUTS.cdpCall,
        intervalMs: 100,
        ...waitForOptions,
      });
    },

    /** Page errors + console errors/warnings collected since load. */
    pageErrors: () => page.pageErrors.slice(),
    consoleMessages: () => page.consoleMessages.slice(),

    /** Anything that is not a known software-rendering artefact. */
    errors() {
      const ignorable = /SwiftShader|swiftshader|ANGLE|software WebGL|GroupMarkerNotSet|deprecated/i;
      const thrown = page.pageErrors.map((entry) => `${entry.type}: ${entry.message}`);
      const noisy = page.consoleMessages.map((entry) => `${entry.type}: ${entry.message}`);
      return [...thrown, ...noisy].filter((line) => !ignorable.test(line));
    },

    /** Messages the app's own global error handler collected (window.__simErrors). */
    appErrors: () => session.evaluate('window.__simErrors.map((entry) => entry.message)'),

    /** PNG screenshot of the current frame; returns the file written. */
    async shot(fileName) {
      const buffer = await screenshot(cdp, sessionId, {
        timeoutMs: TIMEOUTS.screenshot,
        format: 'png',
        clip: viewport ? { x: 0, y: 0, width: viewport.width, height: viewport.height } : undefined,
      });
      const target = fileName ?? join(PATHS.artifacts, `${name}.png`);
      writeFileSync(target, buffer);
      return target;
    },

    /** Reload the page (same URL) and wait for a fresh boot. */
    async reload() {
      await cdp.send('Page.navigate', { url: session.url }, { sessionId, timeoutMs: TIMEOUTS.pageNavigation });
      await waitForExpression(cdp, sessionId,
        'Boolean(window.__sim && window.__sim.boot && window.__sim.boot.status === "ready")', {
          timeoutMs: TIMEOUTS.pageNavigation,
          intervalMs: 80,
          label: 'app reboot after navigation',
        });
    },

    close: cleanup,
  };
  return session;
}

/** Run `body(session)` and always tear the session down. */
export async function withApp(body, options = {}) {
  const session = await createAppSession(options);
  try {
    return await body(session);
  } finally {
    const problems = await session.close();
    if (problems.length > 0) throw new Error(`session cleanup reported: ${problems.join('; ')}`);
  }
}

/** Bound a promise with a wall-clock budget and a readable error message. */
export async function runBounded(timeoutMs, label, task) {
  let timer = null;
  try {
    return await Promise.race([
      task(),
      new Promise((resolveTask, rejectTask) => {
        timer = setTimeout(() => rejectTask(new Error(`TIMEBOX: ${label} exceeded ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
