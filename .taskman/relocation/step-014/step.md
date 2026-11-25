# step-014: test API: site and drag surface on `window.__sim`

## How to perform this step

Browser tests drive the app through `window.__sim`, never by scraping DOM or
clicking at coordinates (GUIDELINES.md §9), so the relocation needs first-class
methods before step-015 can test it.

1. In `src/app/testapi.js`, next to the existing `heightAt` / `pick` methods, add:

   ```js
   /** Where the mast stands: {x, z, groundY, heightM, y}. */
   site: () => structuredClone(controller.site()),
   /** Start a relocation drag as if the pointer were on the mast. */
   grabSite: () => controller.grabSite(),
   /** Move the grabbed site to a pointer position in NDC (-1..1, y up). */
   dragSiteTo: (ndcX, ndcY) => controller.dragSiteTo(ndcX, ndcY),
   /** Finish the drag; the site patch has been committed by then. */
   releaseSite: () => controller.releaseSite(),
   /** {active, planeY, last} of the drag adapter. */
   dragState: () => controller.dragState(),
   ```

   (`structuredClone` is what `state()` already uses; `controller.site()` returns
   a frozen record, cloning keeps the JSON round-trip boring.)
2. Update the module header comment's list of exposed commands if it enumerates
   them (the full doc list in GUIDELINES.md is step-017 — do not edit GUIDELINES
   here).
3. Verify:
   - `npm run lint` → `lint ok`.
   - Serve and inspect the surface:

     ```bash
     npm run serve -- --port 8128 --print-url
     node tools/browser.js eval "const a=window.__sim; a.grabSite(); const d=a.dragSiteTo(0.4, 0); a.releaseSite(); JSON.stringify({ keys: Object.keys(a).sort().filter((k) => /site|drag|pick/.test(k)), dragged: d, site: a.site() })" --url http://127.0.0.1:8128/ --wait
     npm run serve -- stop
     ```

     Expect `keys` to contain `site, grabSite, dragSiteTo, releaseSite, dragState,
     pick`, `dragged.ok === true` with a finite `x`/`z`, and `site().x`/`site().z`
     to be that committed point (not the default `0, 0`).
   - `node tools/test.js --browser --only tests/browser/app-boot.test.js` passes.

## Expected result

`window.__sim` can report the site and drive a full grab → drag → release cycle
deterministically, which is what the browser tests in step-015 use instead of
synthetic mouse coordinates.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- `site()` returns the site the **pipeline last built**, not the live state: a drag
  patches state immediately but the ground/rig rebuild happens in the next frame.
  Measured: right after `dragSiteTo` the state said `{-390,-315}` while `site()`
  still said `{0,0}`; after `settle()` both agree. The step comment on the method
  now says "call settle() first", and step-015's tests must follow that.
- `dragSiteTo()` commits a raw ground point; the reducer snaps it to
  `ANTENNA.siteStepM` (5 m), so expect `{x,z}` to be the nearest multiple of 5, not
  the exact pick. Compare with a tolerance of one step.
- Filtering `Object.keys(window.__sim)` for `site|drag|pick` misses `grabSite` and
  `releaseSite` (capital S). Use `/(site|drag|pick|Site)/` when listing the surface.
