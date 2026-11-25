# step-012: the drag adapter (`src/app/relocate.js`) wired into the controller

## How to perform this step

Create the mouse tool that grabs the antenna and drags the site across the map,
and connect it so a drag emits ordinary state patches (UI never mutates state —
GUIDELINES.md §6).

1. Create `src/app/relocate.js` with header `Layer: L4 (render adapter)`:
   *Translate pointer gestures into site relocations.* It owns no state: it reads
   the camera + the current site and calls back with a new `{x, z}`.
   - imports: `import { VIEW } from '../config.js';` and
     `import { cameraPose, pickGround, projectToNdc } from './pick.js';`
   - two named, commented local constants (presentational, like `ORBIT_SPEED` in
     `orbit.js`): `const GRAB_RADIUS_PX = 26;` and
     `const COMMIT_INTERVAL_MS = 120;` (one terrain+coverage rebuild is ~100 ms;
     committing per `pointermove` would drop frames).
   - `export function createSiteRelocator({ domElement, viewport, getSite, onMove, now })`
     where `getSite()` returns the current `Site` (`{x, z, groundY, y}`),
     `onMove({x, z})` is the commit callback and
     `now = options.now ?? (() => globalThis.performance?.now?.() ?? Date.now())`.
   - private helpers:
     - `pose()` — `cameraPose({ ...viewport.cameraState(), fovDeg: viewport.camera.fov, aspect: viewport.camera.aspect })`.
     - `pointerNdc(event)` — from `domElement.getBoundingClientRect()`:
       `ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1`,
       `ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1)`.
     - `grabPoints()` — `[{ x: s.x, y: s.y, z: s.z }, { x: s.x, y: s.groundY, z: s.z }]`
       (the phase centre and the mast foot, so either end of the hardware works).
     - `nearSite(event)` — convert each grab point with `projectToNdc`, turn NDC
       into CSS pixels (`px = (ndcX * 0.5 + 0.5) * rect.width`,
       `py = (1 - (ndcY * 0.5 + 0.5)) * rect.height`), require `depth > 0`, and
       return true when the pointer is within `GRAB_RADIUS_PX` of either point.
   - exported behaviour:
     - `intercept(event)` — returns **false** unless `event.button === 0` and no
       `shiftKey/ctrlKey/altKey/metaKey` and `nearSite(event)`; when it returns
       true it has already started the drag (captures `planeY = getSite().groundY`,
       sets `active`, `domElement.style.cursor = 'grabbing'`). Document loudly in
       the header that this is the gate `createOrbitControls` asks before it takes
       a gesture, i.e. it claims the pointer *and* answers.
     - `pointermove` listener (registered on `domElement`): when dragging, map the
       pointer with `pickGround(pose(), ndcX, ndcY, planeY)`; if a point comes
       back, commit it through `commit(x, z, false)` (throttled by
       `COMMIT_INTERVAL_MS` using `now()`). When not dragging, update the hover
       cursor: `domElement.style.cursor = nearSite(event) ? 'grab' : ''`.
     - `pointerup` / `pointercancel` listeners: when dragging, commit the final
       point with `force = true`, clear `active`, restore `cursor = ''`.
     - programmatic entry points for the test API:
       `beginAtSite()` (start a drag as if the pointer sat on the mast, returns
       `{ ok: true, planeY }`), `dragToNdc(ndcX, ndcY)` (begins if needed, picks
       the plane point and commits with `force = true`, returns
       `{ ok, x, z, active }` or `{ ok: false, reason: 'not on the ground' }`),
       `release()` (ends the drag, returns `{ ok: true, active: false }`) and
       `state()` returning `{ active, hovering: false, planeY, last }` where
       `last` is the last committed `{x, z}` or null.
     - `dispose()` — remove every listener and restore the cursor.
   - no `console.*`, no timers (`COMMIT_INTERVAL_MS` throttles on event volume,
     it does not schedule anything).
2. Register it as an adapter in `tools/lib/arch.js`: extend the L4 row
   `/^src\/app\/(viewport|labels|orbit)\.js$/` to
   `/^src\/app\/(viewport|labels|orbit|relocate)\.js$/`.
3. Wire it in `src/app/controller.js` — the relocator must be created **before**
   `createOrbitControls`, because orbit is handed the gate:

   ```js
   const relocator = createSiteRelocator({
     domElement: options.canvas,
     viewport,
     // Resolved lazily: the pipeline rebuilds `site` on every terrain pass.
     getSite: () => site,
     onMove: (next) => patch({ site: { x: next.x, z: next.z } }),
   });
   const orbit = createOrbitControls({ domElement: options.canvas, viewport, intercept: (event) => relocator.intercept(event) });
   ```

   plus `import { createSiteRelocator } from './relocate.js';`,
   `relocator.dispose();` inside `dispose()`, and these accessors on the returned
   controller object (the test API wraps them in step-014):

   ```js
   grabSite: () => relocator.beginAtSite(),
   dragSiteTo: (ndcX, ndcY) => relocator.dragToNdc(ndcX, ndcY),
   releaseSite: () => relocator.release(),
   dragState: () => relocator.state(),
   ```
4. Verify:
   - `npm run lint` → `lint ok`; `wc -l src/app/controller.js src/app/relocate.js`
     both ≤ 350.
   - `node tools/test.js --browser --only tests/browser/app-boot.test.js` passes
     (the page boots, no page errors, orbit still works).
   - Manual smoke: serve and drive a synthetic drag through the DOM once —

     ```bash
     npm run serve -- --port 8126 --print-url
     node tools/browser.js eval "const c=document.getElementById('scene'); c.dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:700,clientY:400,bubbles:true})); c.dispatchEvent(new PointerEvent('pointermove',{clientX:900,clientY:420,bubbles:true})); c.dispatchEvent(new PointerEvent('pointerup',{clientX:900,clientY:420,bubbles:true})); JSON.stringify(window.__sim.state().site)" --url http://127.0.0.1:8126/ --wait
     npm run serve -- stop
     ```

     The coordinate may or may not land on the mast; either `{"x":0,"z":0}` (no
     grab) or a plausible moved site is a pass — it must **not** throw and must
     not move the camera. The real assertions come in step-015.

## Expected result

Pressing on the mast and dragging relocates the site through the normal patch
channel, the cursor hints at it, orbit stays out of the way, and the controller
exposes the drag programmatically.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- **Regression this step exposed and fixed:** `orbit.js` called
  `releasePointerCapture()` unconditionally on `pointerup`. While orbit always
  captured its own `pointerdown` that was harmless; once a gesture can be
  *intercepted*, orbit never captured it and every relocated drag threw
  `NotFoundError: … releasePointerCapture … No active pointer`. Fixed by releasing
  only when the drag was orbit's own (`if (wasDragging) …`).
- **`tools/browser.js eval --wait "EXPR"` runs EXPR repeatedly** — `--wait` polls
  with the very same expression (`waitForExpression`) before the final
  `evaluate()`. A script with side effects therefore runs 2–3 times and the value
  it finally prints comes from the last pass, which looks exactly like "the page
  remembered an old drag". Verdict: stateful probes must run **without** `--wait`
  (single evaluation); keep `--wait` for read-only readiness expressions.
- Under *synthetic* `PointerEvent`s, orbit's `setPointerCapture()` throws
  `NotFoundError` (a dispatched event has no active pointer in the browser). That
  is pre-existing orbit behaviour under fake events, not a regression — and it is
  why the real tests (step-015) drive `grabSite`/`dragSiteTo` instead of
  dispatching mouse events.
- Measured with the fake-event probe on a fresh page: pointerdown on the mast →
  cursor `grabbing`, site `{0,0}` → `{-225,-345}`, camera untouched; a second drag
  far from the mast moved the camera and left the site alone. That is the whole
  point of the intercept gate.
- `src/app/controller.js` is now **345 of 350 lines**; the next feature that needs
  to grow it must split it (GUIDELINES.md §3).
