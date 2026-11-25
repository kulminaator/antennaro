# step-010: browser tests: toggle, colouring, and obstruction where it belongs

## How to perform this step

New file `tests/browser/fresnel.test.js`, driven through `window.__sim` only
(GUIDELINES.md §9: no DOM scraping, no synthetic clicks; `withApp` for cleanup).

1. `fresnel()` reports the criterion and self-consistent counts
   (`clear + obstructed === evaluatedCells`, `obstructedLinked <= linkedCells`) on the
   default boot.
2. Obstruction is where the geography says it is: with `useDiffraction: true` and the
   site at the centre, a cell behind the northern ridge has `fresnelClear === false`
   (or the aggregate north-sector obstructed count exceeds the east-sector one), while
   the flat field to the east is largely clear. Prefer comparing sectors over pinning
   counts, and assert the difference is large.
3. Frequency behaviour: same geometry, `frequencyKey: '5800'` vs `'433'` - the smaller
   zone at 5800 MHz must be *at least as clear* as at 433 MHz (`fresnelClearPct` not
   lower, within a small tolerance). Comment why (r1 shrinks with wavelength).
4. The volume: `patch({ display: { showFresnel: true } })` + `settle()` ->
   `scene()` says visible with a positive vertex count; patch false -> hidden; the
   vertex count does not change between two toggles (the geometry is reused, not
   rebuilt per frame).
5. Colouring is real: with defaults, `pixelStats()` must differ between
   `showCoverage` on and off, and a screenshot with the obstructed colour present must
   not be identical to one where the criterion is impossible (e.g. `useDiffraction:
   false`) - compare `distinctColours`.
6. `assert.deepEqual(session.errors(), [])` in every test.
7. Verify: `node --test tests/browser/fresnel.test.js`, then
   `node tools/test.js --browser --only tests/browser/fresnel.test.js`, then `npm run lint`.

## Expected result

A browser suite proves the zone flag, its colouring and its volume behave as the docs
claim, with no page errors.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
