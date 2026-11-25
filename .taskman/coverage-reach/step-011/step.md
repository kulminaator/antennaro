# step-011: browser tests: the edge of the drape is the link, not the cap

## How to perform this step

1. Create `tests/browser/reach.test.js` driving only `window.__sim` (GUIDELINES.md §9),
   with `session.errors()` asserted in each test.
2. The tests, in this order:
   - **the maximum you see is the link's**: site at one side of the map (`x` near
     `-ANTENNA.siteLimitsM.min * 0.6`, `z` 0), Yagi aimed east along the map,
     `useDiffraction` left on, default study range. Assert `coverage().maxLinkedRangeM`
     is well inside the distance to the map edge (so the map is not the limit), that it
     is at least 5 % away from `stats().studyRangeM` (so the cap is not the limit), and
     that it is within a sane fraction (say 0.5-1.0) of `coverage().budgetRangeM` - a
     terrain-shadowed link is shorter than the free-space figure, but never equal to a
     circle we chose.
   - **gain moves the reach**: with the same site and the radio unchanged, compare
     `maxLinkedRangeM` for the omni dipole, the collinear and the Yagi: they must be
     pairwise different by a margin that tracks their gain order
     (dipole < collinear < Yagi), and the ratio between the collinear and the dipole
     must be within a factor of the free-space ratio (about 10^(dG/20), with slack for
     terrain). This is the user's complaint written as a test.
   - **the cap is only there when asked for**: at the default study range
     `limitingFactor` is not `'study-range'` and `clippedByRangeCells` is 0; patch
     `maxRangeM` down to 1400 m and assert it flips to `'study-range'`, that
     `clippedByRangeCells > 0`, and that `scene()` reports the range ring visible.
   - **no painted lie beyond the budget**: walk `rssiAt()` outward along the aim and
     assert no cell with `budgetExcluded` reports a linked RSSI, and that past the
     budget radius every sample is either null or below sensitivity.
   - **the whole map is looked at**: `coverage().evaluatedCells` is within a few percent
     of the coverage grid size (report `coverageStride` in the assertion message), and
     `rssiAt()` answers at a point 3 km from the mast when the mast sits at a map corner
     and the study range is the default.
3. Verify: `node tools/browser.js stop --all`;
   `node tools/timebox.js -t 600 -- node tools/test.js --browser --only
   tests/browser/reach.test.js`; `node tools/browser.js status --all`. Fix causes, not
   assertions; if an assertion cannot hold, write why in this step's comments before
   changing it.

## Expected result

A named browser test fails if the app ever again draws its own work area and calls it
the antenna's range.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
