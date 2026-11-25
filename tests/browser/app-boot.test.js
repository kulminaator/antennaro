/**
 * Browser tests: the app boots, renders, and stays error-free.
 *
 * These run under `node --test` with the harness starting its own static server.
 * Every session owns a private Chromium instance and is torn down in `withApp`'s
 * finally block, so a red assertion leaks no processes.
 *
 * Assertions read `window.__sim` only - never DOM ids - and use the real return
 * shapes: `stats()` is the frame loop, `scene()` is the scene graph, `antenna()`
 * is the model summary.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PATHS } from '../../tools/lib/paths.js';
import { withApp } from '../harness/app.js';

/** Read the provenance record that `tools/vendor.js check` guards. */
function vendorManifest() {
  return JSON.parse(readFileSync(join(PATHS.vendorThree, 'manifest.json'), 'utf8'));
}

test('browser: boots to "ready" with an empty error list', async () => {
  await withApp(async (session) => {
    assert.equal((await session.evaluate('window.__sim.boot')).status, 'ready');
    assert.equal(await session.evaluate('window.__sim.ready'), true);
    assert.deepEqual(await session.appErrors(), [], 'the global error handler caught something during boot');
    assert.deepEqual(session.pageErrors(), []);
    assert.deepEqual(session.errors(), [], 'console warnings or errors during boot');
  });
});

test('browser: the page runs exactly the audited, vendored three.js bundle', async () => {
  await withApp(async (session) => {
    const manifest = vendorManifest();
    const importMap = await session.evaluate(
      'JSON.parse(document.querySelector("script[type=importmap]").textContent)',
    );
    // "./" is not decoration: Chrome only resolves import map values that are
    // explicitly relative, and root-relative ones break under a Pages sub-path.
    assert.match(importMap.imports.three, /^\.\//, 'import map value must be explicitly relative');
    const served = importMap.imports.three.replace(/^\.\//, '');

    const response = await session.evaluate(
      `(async () => { const r = await fetch(${JSON.stringify(served)}); return { status: r.status, bytes: (await r.arrayBuffer()).byteLength }; })()`,
    );
    assert.equal(response.status, 200, 'the import map points at a missing file - run: node tools/vendor.js bundle');

    const artifact = manifest.artifact['three.module.min.js'];
    assert.equal(response.bytes, artifact.bytes, 'the served bundle is not the size the manifest records');

    const digest = await session.evaluate(`(async () => {
      const body = new Uint8Array(await (await fetch(${JSON.stringify(served)})).arrayBuffer());
      const hash = await crypto.subtle.digest('SHA-256', body);
      return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    })()`);
    assert.equal(digest, artifact.sha256, 'the browser is running bytes that do not match vendor/three/manifest.json');

    const loaded = await session.evaluate('(async () => (await import("three")).REVISION)()');
    assert.equal(loaded, manifest.version.split('.')[1], `three r${loaded} loaded, manifest pins ${manifest.version}`);
  });
});

test('browser: WebGL2 is live and the scene holds terrain, antenna and coverage', async () => {
  await withApp(async (session) => {
    const stats = await session.settle();
    assert.equal(stats.status, 'active', 'the frame loop is not running');
    assert.ok(stats.renderCalls > 0, 'nothing has been rendered');

    const scene = await session.sim('scene');
    assert.equal(scene.webgl2, true, 'expected a WebGL2 context');
    assert.equal(scene.contextLost, false);
    assert.ok(scene.drawingBufferWidth > 0 && scene.drawingBufferHeight > 0);
    assert.ok(scene.terrainVertices >= 10_000, `terrain grid looks small: ${scene.terrainGrid}`);
    assert.ok(scene.triangles > 1000, `scene looks empty: ${scene.triangles} triangles`);
    assert.ok(scene.antennaParts > 0, 'no antenna hardware in the scene');
    assert.equal(scene.coverageVisible, true);
    assert.equal(scene.patternVisible, true);
    assert.equal(scene.labelsVisible, true);

    const state = await session.sim('state');
    assert.equal(Number(scene.mastHeightM.toFixed(2)), state.heightM);
    assert.equal(scene.terrainStats.cells, state.gridSize ** 2);
  });
});

test('browser: the frame is not blank and the control panel is wired', async () => {
  await withApp(async (session) => {
    await session.settle();
    const pixels = await session.sim('pixelStats');
    assert.ok(pixels.distinctColours > 6, `frame looks flat: ${pixels.distinctColours} colours`);
    assert.ok(pixels.nonBackgroundFraction > 0.2, `frame is mostly empty: ${pixels.nonBackgroundFraction}`);
    assert.ok(pixels.meanLuminance > 4 && pixels.meanLuminance < 250);

    const controls = await session.sim('controls');
    for (const key of ['designId', 'heightM', 'aim.azimuthDeg', 'aim.tiltDeg', 'txPowerDbm', 'seed']) {
      assert.ok(controls.includes(key), `control panel is missing ${key}`);
    }
  });
});

test('browser: the screenshot has real content and survives a resize', async () => {
  await withApp(async (session) => {
    await session.settle();
    const before = await session.sim('scene');
    const file = await session.shot();
    const png = readFileSync(file);
    assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
    assert.ok(png.length > 15_000, `screenshot looks empty (${png.length} bytes)`);

    // A resize must rebuild the drawing buffer, not stretch the old one.
    await session.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 640, height: 400, deviceScaleFactor: 1, mobile: false,
    }, { sessionId: session.page.sessionId });
    await session.settle();
    const resized = await session.sim('scene');
    const layout = await session.evaluate('(() => { const c = document.getElementById("scene"); return { w: c.clientWidth, h: c.clientHeight }; })()');
    assert.equal(resized.width, layout.w, 'the drawing buffer no longer tracks the CSS box');
    assert.equal(resized.height, layout.h);
    assert.ok(resized.width < before.width, `shrinking the window did not shrink the canvas (${before.width} -> ${resized.width})`);
    assert.ok(resized.drawingBufferWidth > 0);
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: the camera can be driven and reset', async () => {
  await withApp(async (session) => {
    const moved = await session.sim('setCamera', { azimuthDeg: 45, elevationDeg: 30, distance: 900 });
    assert.equal(moved.azimuthDeg, 45);
    assert.equal(moved.elevationDeg, 30);
    assert.equal(moved.distance, 900);

    await session.settle();
    assert.equal((await session.action({ type: 'reset-view' })).ok, true);
    assert.notEqual((await session.sim('camera')).distance, 900);
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: dispose() stops the frame loop', async () => {
  await withApp(async (session) => {
    await session.settle();
    await session.sim('dispose');
    assert.equal((await session.sim('stats')).status, 'stopped');
    assert.deepEqual(session.errors(), []);
  });
});
