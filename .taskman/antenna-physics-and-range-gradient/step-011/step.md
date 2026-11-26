# step-011: coverage stats carry the bulge under the longest link and the flat-ground horizon

## How to perform this step

1. In `src/propagation/coverage.js` (347 lines - if adding pushes it past 350, put the two
   numbers' computation in `coveragestats.js` as `describeEarth({ site, maxLinkedRangeM,
   rxHeightM })` and call that, which is where the limit report already lives), add to
   `stats`: `earthBulgeUnderMaxLinkM` (the bulge at the midpoint of `maxLinkedRangeM`) and
   `radioHorizonM` (`radioHorizonM(site.heightM, RF.fresnelRxHeightM)`), plus
   `kFactor: RF.kFactor` so a reader can check the arithmetic from the stats alone.
2. Comment each field with what question it answers: how much of the world the longest link
   had to curve over, and how far a link of these two antenna heights gets on a perfectly
   smooth earth.
3. Test in `tests/unit/coverage.test.js`: the two fields are present and finite for the
   default map; `radioHorizonM` equals the helper's answer for the same inputs (so the
   stats cannot drift from the maths); and the bulge grows when the study range is widened
   on a configuration whose last link grows.
4. Verify: `node tools/timebox.js -t 300 -- node --test tests/unit/coverage.test.js` green
   and `node tools/timebox.js -t 600 -- node tools/test.js --browser --only
   tests/browser/app-boot.test.js` green (stats shape is asserted there).

## Expected result

The roundness of the world is now part of what the sweep reports, not just of how it
computes.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Took the branch this step planned for the line-budget case: `coverage.js` is at 347 of
  350 lines, so the two numbers are computed by **`describeEarth({ siteHeightM,
  maxLinkedRangeM, rxHeightM, kFactor })`** in `coveragestats.js`, spread into `stats` with
  one line in the sweep (`...describeEarth({ siteHeightM: site.heightM, maxLinkedRangeM,
  rxHeightM })`). New fields: `kFactor`, `earthBulgeUnderMaxLinkM`, `radioHorizonM`, each
  with a comment saying which question it answers.
- Measured on the default map, 10 m omni, 10 dBm / -80 dBm: `kFactor 1.413`, bulge under
  the 936 m last link **0.012 m**, smooth-earth horizon for a 10 m mast and a 4 m receiver
  **21.9 km**, against a 5.2 km map. Those are the numbers the HUD has to explain, and they
  say the curvature is not what is hiding anything on this map.
- New test `coverage: the sweep says how much round earth was involved`, in
  `tests/unit/coveragebehaviour.test.js` (243 -> 288 lines) rather than the planned
  `coverage.test.js`, which sits at 316 of its 320 line budget and would not have taken it.
  It pins: the factor is the config factor; the bulge is `earthBulgeM` of *the reported
  last link* and nothing else; the horizon is `radioHorizonM` for *this mast* and the
  stated receiver height; the horizon is beyond `WORLD.worldSize`; the bulge under the
  longest default link is under 0.2 m; a louder link reaches further and curves over more
  world; and a sweep that links nothing reports a bulge of 0 rather than a NaN.
- `npm run test:unit` all 13 files pass; `node tools/timebox.js -t 600 -- node tools/test.js
  --browser --only tests/browser/app-boot.test.js` passes (it asserts the stats shape);
  `npm run lint` ok. `coverage.js` is now 348 of 350 lines - flagged for whatever step next
  wants to touch the sweep.
