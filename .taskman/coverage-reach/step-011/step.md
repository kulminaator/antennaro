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

- `tests/browser/reach.test.js`, six tests, all through `window.__sim`. Each asserts
  `session.errors()` is empty.
  1. *the far edge of the drape is the link, not the map or our cap* - centre, collinear:
     `limitingFactor === 'budget'`, zero clipped cells by range or map, no clipped sector,
     last link within 85-100 % of the free-space budget, under half the study range and
     under 70 % of the nearest map edge (measured 1668 m of a 1670 m budget, against a
     3800 m work area and a 2600 m edge).
  2. *with the ground out of the way, gain becomes range as the budget says* - the answer
     to the original complaint. Mast at `ANTENNA.heightLimitsM.max` on the western edge of
     the flat field, aimed east; dipole, collinear, Yagi each reach 95-100 % of the
     free-space range `rf().freeSpaceRangeM` reports, and the *ratios* of reach match the
     ratios of free-space range within 5 % (measured collinear/dipole 1.79 against 1.79,
     Yagi/dipole 2.33 against 2.35). The expected ratios come from `rf()` rather than from
     constants, so the test cannot drift away from the model.
  3. *a low mast puts the ground between gain and range, and says which won* - same place,
     default height: the Yagi's budget is more than 20 % larger than the collinear's and
     its reach is smaller (1479 m against 1668 m), while both still report `budget` as the
     limiting factor. The invariant that survives is that the beam falls at least 20
     points further short of its own budget than the omni does - which is what "a terminal
     on the ground has a radio horizon that extra decibels cannot buy back" looks like in
     numbers. This is also the honest explanation of why several designs can look similar:
     on grazing paths the ground, not the antenna, sets the reach.
  4. *our study range binds only when somebody asks for it* - at the default the sweep
     reports no range clipping and `scene().rangeRing.visible === false`; patched to
     1400 m it reports `study-range`, `clippedByRangeCells > 0`, the ring visible and
     `canBind`, at least one sector marked `clippedBy === 'study-range'`, and a shorter
     picture than the honest one.
  5. *ground we never asked about is not painted as a link* - walks `rssiAt()` east: every
     `budgetExcluded` sample is below sensitivity (its stored value is an upper bound, so
     this can only hold if the pre-filter is honest), the walk crosses the budget edge in
     both classes (non-vacuous), once dismissed it stays dismissed, and beyond the budget
     radius no sample claims a link or carries a Fresnel verdict.
  6. *the sweep looks at the whole map, not a plate on top of it* - at the centre
     `evaluatedCells >= cells - 4` (30624 of 30625: the mast's own point), the grid is a
     decimation (`cells < 349^2`, `coverageStride === RF.coverageStride`, cell size
     `stride * worldSize/(gridSize-1)`), and a mast in a corner still gets an answer at the
     map centre 3536 m away while reporting `limitingFactor === 'map-edge'` with at least
     one direction marked as cut by it.
- Two assertions from the step plan could not hold as written, and the reason is worth
  keeping:
  - the plan's site (`x = 0.6 * siteLimitsM.min`, i.e. in the western bump field) gives a
    Yagi reach of 410 m against a 2204 m budget - a ratio of 0.19, far outside the plan's
    0.5-1.0 band - because the beam's first kilometres are the bumps themselves. Moved to
    `x = -1000`, the western edge of the flat field, where a clear run east exists.
  - "pairwise different by a margin that tracks their gain order" is false at a low mast:
    the Yagi reaches *less* than the collinear there. Rather than weaken the test until it
    says nothing, step 2 measures it with the mast at its maximum (where the order and the
    ratios do follow the budget) and step 3 pins the low-mast inversion as its own test.
  - `blockedPct` was going to carry "the beam's paths are shadowed more often" - measured,
    the beam's walked cells are shadowed *less* often (71.3 % against the omni's 74.9 %),
    because the beam only asks about the flat direction east. Replaced by the
    budget-fraction comparison above.
- Note: `ANTENNA.heightLimitsM.max` is 40 m, so a request for 60 m arrives as 40; the test
  asserts the height it asked for is the height in use, instead of assuming it.
- Verified with `node tools/timebox.js -t 600 -- node tools/test.js --browser --only
  tests/browser/reach.test.js`: 6/6 pass in 4.6 s, browser stopped afterwards.
