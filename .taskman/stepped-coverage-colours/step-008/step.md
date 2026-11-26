# step-008: palette.test.js: the stepped scale's invariants

## How to perform this step
1. Rewrite `tests/unit/palette.test.js`: delete the gradient tests, keep the helpers
   (`coverageFixture`) and the coverage-legend accounting tests, and assert the new invariants,
   computing reference answers inside the test rather than quoting golden values:
   - `COLOURS.levels` lightness is strictly monotone strongest-to-weakest, and every neighbour
     differs by at least the shipped scale's measured gaps (a local sRGB-to-CIE-L* helper, ~15 lines,
     is enough for lightness; do not import colour science from `.tmp/`).
   - every step is at least 12 CIEDE2000-from... (keep this honest: a full CIEDE2000 in a test is
     too much; instead assert lightness monotonicity, hue ordering red->yellow, a minimum lightness
     gap of 12 between neighbours, and a minimum channel-distance floor of 60/255 between neighbours)
   - no step colour equals a zone colour, and every step is at least 40/255 away from every zone colour
     in at least one channel;
   - `RF.levelMarginsDb` descends, ends at 0, and has one entry per colour and per name;
   - `coverageLegendItems` swatches are distinct, are exactly `COLOURS.levels`, name their step, and
     the counts still add to `walkedCells + budgetExcludedCells` against the banded counts;
   - a cell exactly at a threshold gets the stronger step (`coverageRgb` band from a margin of
     `levelMarginsDb[i]` is band `i`).
2. Verify: `node --test tests/unit/palette.test.js` passes.

## Expected result
The colour scale is guarded by invariants about order, separation and legend honesty.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->
