# step-006: unit tests: the pre-filter cannot change the answer

## How to perform this step

1. Read `tests/unit/coverage.test.js` (and any other coverage-adjacent unit file) to
   match the house style: invariants and relationships, no golden values.
2. New tests, in the coverage test file:
   - **the pre-filter is provably free**: run `computeCoverage` twice over the same
     field and site, once with `budgetPrefilter: false` and once with it on; assert the
     linked set is identical (compare the `level` arrays cell by cell for cells that are
     linked in either run) and that every linked cell has the same RSSI to within
     1e-3 dB. This is the test that protects the shortcut; name it so.
   - **nothing linked is excluded**: no cell has `budgetExcluded === 1` and a linked
     band.
   - **excluded cells are the far tail**: for every excluded cell, its stored RSSI is
     below sensitivity, and the *nearest* excluded cell is farther from the site than
     the *farthest* linked cell (the hopeless region is outside the live one; if this
     fails, the pre-filter is wrong somewhere).
   - **stride is a sampling choice, not a physics change**: with stride 1 and stride 2
     over the same field, the farthest linked distance agrees within a few coverage
     cells (say 3), and neither run links a cell the other says is below sensitivity by
     more than a small tolerance.
   - **no linked cell beyond the study range**, and `clippedByRangeCells` > 0 exactly
     when the study range is the binding limit (pair this with the step-004 stats).
   - **the whole map is in play**: with the default study range, `evaluatedCells` equals
     the coverage grid's cell count (minus the near-field skip), i.e. there is no hidden
     disc any more.
3. Fix any production bug these tests find - they exist to find one, most likely in the
   index mapping between the terrain grid and the strided grid.
4. Verify: `npm run lint` and `timeout 300 npm run test:unit`, green for this file.

## Expected result

A test in the suite says, in its own name, that skipping the ray walk cannot move the
answer.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
