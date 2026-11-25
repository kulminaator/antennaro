# step-008: the study-range ring (L4 adapter + wiring)

## How to perform this step

1. Read `src/app/mapmesh.js` and `tools/lib/arch.js` first (the `/mesh\.js$/` pattern is
   already L4 and THREE-allowed; decide whether the ring belongs in `mapmesh.js` as
   another map object or in its own `src/app/limitmesh.js` - if `mapmesh.js` has the
   headroom, put it there and avoid a new module).
2. Draw the study-range boundary as a flat ring/line loop on the ground at
   `coverage.stats.studyRangeM` around the site, using `COLOURS.rangeLimit`. It must:
   - be visible only when the coverage overlay is visible **and** the study range is
     smaller than the map's half-diagonal (a ring that can never bind is noise);
   - sit at the same visual layer as the coverage drape (`coverageOffsetM` or a hair
     above), and be a thin line, not a band;
   - follow the site when it moves, and disappear with `display.showCoverage` off.
3. Wire it in `src/app/controller.js`: build it with the other map objects, refresh it
   where the coverage result is applied, and include it in `applyVisibility()`. If a new
   module is created, register it in `LAYER_TABLE` and make sure it is reachable from
   `src/main.js`, or the architecture tests will fail the build.
4. Expose enough for tests: `window.__sim.scene()` should report the ring's visibility
   and radius (extend `sceneInfo()` in `src/app/reports.js`), because browser tests read
   state, never DOM.
5. Verify: `npm run lint`; `timeout 300 npm run test:unit` (architecture tests
   included); then live, timeboxed: default study range -> no ring; `?range=1400` with
   the coverage on -> ring visible, and `scene()` reports its radius. Screenshot to
   `.tmp/reach-ring.png`, look at it, then stop browser and server.

## Expected result

When the app's own work area is the limit, the map draws that limit as an obvious
artificial circle, in a colour the coverage ramp never uses.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
