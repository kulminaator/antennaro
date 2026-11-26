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
