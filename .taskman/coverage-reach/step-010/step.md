# step-010: presets, sliders and URL parameters for the bigger world

## How to perform this step

1. Read `src/app/presets.js`, the `Placement`/`Radio` entries of
   `src/app/fields.js`, and the parameter reading in `src/main.js`.
2. Presets: their site positions, heights and `maxRangeM` values were chosen for a
   2400 m map. Re-choose them for 5200 m so each scenario still tells its story: the
   sector preset still covers its neighbourhood, "Reach down the valley" still has its
   beam *inside* the map with room to show where it dies (that is the point of the
   preset now - it must not be clipped by the study range or the map edge), the mountain
   shadow still has a shadow to show. Express the numbers relative to
   `WORLD.worldSize` where the intent is "a side of the map" rather than an absolute
   distance.
3. Fields: the "Evaluation range" slider now means "study range limit, maximum = the
   whole map". Update its label/hint accordingly (say what happens at the maximum, and
   that lowering it draws a ring and can cut off links). Check the min still leaves a
   useful zoom-in. Confirm `ANTENNA.siteLimitsM` changes flow into the two placement
   sliders (they read from config already).
4. URL parameters: `?range=` still works; make sure a value above the new maximum is
   clamped and reported, and that `?siteX=&siteZ=` accept the wider limits. Add nothing
   new unless a test in step-011 asks for it.
5. Verify: `npm run lint`; `timeout 300 npm run test:unit` (panel/state tests); then
   live, timeboxed: load `?preset=valley-reach` and `?preset=site-sector`, read
   `coverage()` and `stats()` for each and confirm no preset reports
   `limitingFactor: 'study-range'` or `'map-edge'` - if one does, that preset is
   clipped and needs re-choosing; screenshot each to `.tmp/reach-preset-*.png`, look,
   then stop browser and server.

## Expected result

Every scenario shows its own link maximum, and the slider that can reintroduce a cap
says so.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- All five presets were clipped: on the 5.2 km map their old `maxRangeM` values (900 to
  2200 m) and their LoRa-class sensitivities (-85 to -105 dBm) gave free-space budgets of
  2.9 km to 36 km, so every scenario reported `study-range` and 2-5 directions carried a
  `>=`. Retuned so each scenario shows *its own* limit:
  - every preset now pins `txPowerDbm` (7-10 dBm, a node rather than a base station) and
    `rxSensitivityDbm` (-80/-85), putting the free-space budget between 1.9 km and 3.0 km -
    inside the map in every direction, so `limitingFactor: 'budget'` for all five and zero
    clipped directions;
  - `maxRangeM` is `RF.defaultMaxRangeM` (the whole map, no ring) everywhere except where
    a small work area is the point of the scenario - which, after measuring, none is: a
    1.4 km study area still cut the downtilted panel sector, so that preset lost its cap
    too. A preset must never demonstrate our cap as if it were the antenna's; the slider
    is there for anyone who wants to see the cap.
  - `flat-field` and `bumps-hills` moved from 10 m / 14 m to a 25 m mast: at 10 m the ray
    to a receiver on the ground runs along the surface, the whole picture died at 837 m,
    and the preset's claim about the budget was simply false. At 25 m `flat-field` reaches
    1913 m against a 1913 m budget with 92 % of linked points zone-clear - the honest
    version of "the range limit is the link budget, not the ground" - while `bumps-hills`
    still dies at 1298 m against 3049 m of budget, which is the story it was written to tell.
  - `site-sector`'s description said "the flattened area around the mast": the pad is gone,
    so it now describes the depressed lobe.
- `tests/unit/coverage.test.js` gained `coverage: no preset is cut off by our own limits`:
  for every preset it asserts `limitingFactor === 'budget'`, no clipped sector, zero linked
  cells sitting on a border (`clippedByRangeCells + clippedByMapCells === 0`) and enough
  linked points for a picture. This is the test that keeps the presets honest when the map
  or the budgets move again.
- "Evaluation range" is now **Study range**, with a hint that says what the maximum means
  (whole map, so every edge you see is the link), and that lowering it draws a ring, stops
  measuring beyond it, and marks still-alive directions `>=`. The minimum, 100 m, is about
  three coverage cells: a real zoom-in, and the ring plus `>=` make the cut visible.
- `?range=` and `?siteX=` go through the reducer, so they are clamped - but the clamp was
  invisible. `createInitialStateWithReport()` in `src/app/state.js` now keeps the reducer's
  verdict, and `src/main.js` publishes it as `window.__simBoot.overrides.clamped / .rejected`
  (also on `__sim.boot`). Measured: `?range=99999&siteX=99999&frequency=none` reports
  `{site.x: 99999 -> 2500}`, `{maxRangeM: 99999 -> 3800}` and
  `{frequencyKey: invalid value}`, while applying 3800 / 2500 / the default band.
- **A real bug, found by this step's live check and not by any test.** `TERRAIN.seed` is
  20251105 and the seed slider's ceiling was 999999. A range input sanitises an
  out-of-range value to its nearest bound, and Blink reports that as an `input` event - so
  at boot the panel wrote 999999 into the model and the app simulated a *different map*
  from the one the configuration asked for. `window.__sim.state().seed` said 999999 while
  `createInitialState().seed` in the same page said 20251105. This is why the live app and
  a Node probe of the same preset disagreed (bumps-hills: 460 linked cells live, 248 in
  Node). Fixed at the root: `TERRAIN.seedMin` / `TERRAIN.seedMax` (1 .. 99 999 999) are now
  the slider bounds and the "New terrain" roll, and
  `tests/unit/state.test.js: panel: no default sits outside the bounds of its own control`
  checks every numeric control of every design. After the fix the live terrain stats are
  bit-identical to `generateTerrain()` (min -76.0704 m, max 576.3363 m, mean 112.6939 m)
  and the live preset numbers match Node exactly for all five scenarios.
- The `budget` sentence lost its unit mix: `the link: budget 1.91 km, last link 1.91 km`.
  Reading the three sentences out of the live HUD: `the link: budget 1.67 km, last link
  1.67 km`, `our study range 1.40 km - the link would reach 1.67 km`,
  `edge of the map 0.30 km - the link would reach 11.82 km`.
- Note for later steps: reading compass direction off a top-down *screenshot* is easy to
  get wrong (with azimuth 0 and a high elevation the camera looks from the north, so north
  is at the bottom of the frame and east is to the left). The direction table and the
  sector tests are the authority on direction, not the picture.
- `npm run lint` ok, `npm run test:unit` all 12 files pass, live checks (5 presets,
  clamping report, seed, HUD rows) with no page errors; browser and server stopped
  afterwards. Screenshots in `.tmp/artifacts/reach-preset-*.png` and
  `reach-top-*.png`.
