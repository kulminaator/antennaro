# step-015: browser tests: relocate by patch, by drag, and back again

## How to perform this step

Create `tests/browser/relocate.test.js` using `withApp` so the browser and server
always get torn down, and drive everything through `window.__sim`.

1. Skeleton: header comment, `import test from 'node:test'`,
   `import assert from 'node:assert/strict'`,
   `import { withApp } from '../harness/app.js';` and a small helper
   `const almost = (value, expected, tolerance) => Math.abs(value - expected) < tolerance;`.
2. Tests:
   - `test('browser: relocating the site moves the pad, the rig and the coverage')`
     - `await session.settle()`; read `const padHere = await session.sim('heightAt', 0, 0)`
       (must be `WORLD.siteElevation`, import `WORLD` from `../../src/config.js`).
     - `await session.patch({ site: { x: 400, z: 200 } })`, assert
       `rejected`/`clamped` are empty, `await session.settle()`.
     - `site()` reports `x === 400`, `z === 200`; `scene().sitePosition` deep-equals
       `[400, 200]`; `heightAt(400, 200)` is the pad level (same tolerance as
       above) while `heightAt(0, 0)` is no longer level — the pad travelled with
       the mast.
     - physics follows: with `{ designId: 'yagi', params: { directors: 8, spacingLambda: 0.3 }, aim: { azimuthDeg: 90, tiltDeg: 0 }, useDiffraction: false }`
       and the site at `400, 200`, the sample at `rssiAt(400 + 500, 200)` (in
       front of the beam) beats `rssiAt(400 - 500, 200)` (behind it) by > 10 dB —
       comment: the beam is aimed east from wherever the mast stands.
     - pixels agree: `pixelStats()` before and after the relocation must differ in
       `distinctColours` or `meanLuminance`.
     - `assert.deepEqual(session.errors(), [])`.
   - `test('browser: grabbing the mast and dragging moves the site')`
     - start from a settled default state; `const grab = await session.sim('grabSite')`
       → `grab.ok === true`; `await session.settle()`.
     - `const moved = await session.sim('dragSiteTo', 0.45, 0)` → `moved.ok === true`,
       finite `x`/`z`, and **not** both ~0 (`dragState().active === true`).
     - `await session.sim('releaseSite')`; then `dragState().active === false` and
       `state().site` matches the last dragged point within the panel step
       (`ANTENNA.siteStepM`, since the reducer snaps to the slider step).
     - `scene().sitePosition` agrees with `site()` (the rig followed the state),
       and `session.errors()` is empty.
   - `test('browser: picking at the mast returns the site footprint')`
     - after `patch({ site: { x: 300, z: -150 } })` + `settle()`, `pick(0, 0)`
       (screen centre, the camera looks at the map centre by default) returns a
       point whose distance to `{x: 300, z: -150}` is smaller than its distance to
       the origin. If the default camera framing makes that ambiguous, first
       `await session.sim('setCamera', { targetX: 300, targetZ: -150 })`, and
       comment why.
   - `test('browser: reset placement and reset all both bring the mast home')`
     - patch a site offset, `action({ type: 'reset-site' })` → `ok true` and
       `site()` is `{ x: 0, z: 0, ... }` (compare the two numbers, not the whole
       record);
     - patch again, `action({ type: 'reset-all' })` → `site()` back at `0, 0` and
       `state().designId === ANTENNA.defaultDesignId` (the old full reset still
       works);
     - an unknown action still answers `{ ok: false }`.
3. Verify: `node --test tests/browser/relocate.test.js` (standalone run, it starts
   its own server), then
   `node tools/test.js --browser --only tests/browser/relocate.test.js`, then
   `npm run lint` (test-layout rules).

## Expected result

A new browser test file proves the whole relocation story end to end — state,
terrain, rig, coverage, pixels, drag gestures and both resets — with no page
errors.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
