# step-011: orbit controls: an `intercept` gate for pointer grabs

## How to perform this step

`src/app/orbit.js` (L4) grabs every `pointerdown` on the canvas. Before the drag
adapter can move the antenna, orbit needs a way to be asked "may I take this
drag?" and answer no.

1. In `src/app/orbit.js`:
   - extend the JSDoc of `createOrbitControls(options)` with
     `intercept?:(event:Event)=>boolean` and document it in the header: *an
     optional gate that is asked, on pointerdown, whether another tool has already
     claimed the gesture; when it returns true orbit ignores the event. It is
     called exactly once per pointerdown, before orbit touches any state.*
   - next to `const limits = {...}` add:

     ```js
     const intercept = options.intercept ?? (() => false);
     ```

   - change the head of `onPointerDown` from `if (!active) return;` to:

     ```js
     if (!active || intercept(event)) return;
     ```

     (the intercepting tool claims the gesture, so orbit must not capture the
     pointer, must not set `dragging`, and must not `preventDefault`).
   - Keep `enabled(value)` as-is: `active === false` still short-circuits first.
2. No caller passes `intercept` yet, so behaviour is unchanged.
3. Verify:
   - `npm run lint` → `lint ok`; `wc -l src/app/orbit.js` stays ≤ 350.
   - The camera still works end to end:
     `node tools/test.js --browser --only tests/browser/app-boot.test.js` passes
     (it drives the camera through the test API), and
     `npm run test:unit` is green.
   - Manual sanity: `npm run serve -- --port 8125 --print-url`,
     `node tools/browser.js shot --url http://127.0.0.1:8125/ --out .tmp/artifacts/orbit-still-works.png`,
     look at the screenshot (terrain + rig present), then `npm run serve -- stop`.

## Expected result

Orbit exposes an opt-in `intercept` gate that is consulted before it starts an
orbit/pan gesture; default behaviour identical to today.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
