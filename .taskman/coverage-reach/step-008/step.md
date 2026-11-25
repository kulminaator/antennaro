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

- The ring went into `src/app/mapmesh.js` (82 -> 175 lines) as a fourth map object
  rather than a new module: it is built from the same height field and shares its life
  cycle, and `mapmesh.js` already matches the `/mesh\.js$/` THREE-allow pattern, so no
  `LAYER_TABLE` / `PURE_PATTERNS` / reachability change was needed.
- Drawn as a `THREE.LineLoop` of `VIEW.rangeRingSamples` (160) points sampled around the
  mast, each lifted to `field.sample(x, z) + VIEW.coverageOffsetM + VIEW.rangeRingLiftM`
  so it rides the surface it describes. It follows the *coverage drape's* height
  convention deliberately (`coveragemesh.js` draws at raw field height + `coverageOffsetM`);
  the comment at the top of the ring says so, because the two must not drift apart.
- The "can never bind" rule lives with the geometry: `canBind() = 0 < radius <
  field.half * sqrt(2)`, combined with `setShown(coverageVisible)`. So the default
  `RF.defaultMaxRangeM` of 3800 m draws **no** ring on the 5200 m map (half-diagonal
  3677 m): a circle that could never cut a coverage blob is not drawn, because an
  always-present circle trains the eye to ignore it.
- Live, port 8147 (`/project/.tmp/artifacts/reach-ring.png`):
  - default: `{ visible: false, radiusM: 3800, canBind: false }`,
  - study range 1400: `{ visible: true, radiusM: 1400, canBind: true }`, and the picture
    shows the dipole's ragged 934 m blob well inside the drawn circle - which is the
    whole point: the link died inside our work area and nothing looks clipped,
  - moving the mast to (-1600, 300) moves the ring with it,
  - turning the coverage overlay off hides the ring; whole-map study range hides it again,
  - no console errors.
- Follow-up found while reading the HUD in that screenshot, for step-009: the HUD prints
  `Cells with link 26.0 % (800/6318)` - 26 % is the new walked-cell denominator and
  800/6318 is the evaluated one, printed side by side in the same row. Both numbers are
  correct; the row now has to say which is which, using `mapCoveragePct` and
  `walkedCells`.
- `npm run lint` ok, `npm run test:unit` all 12 files pass (architecture included:
  `mapmesh.js` importing three.js is still inside the allow-list).
