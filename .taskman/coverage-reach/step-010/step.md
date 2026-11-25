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
