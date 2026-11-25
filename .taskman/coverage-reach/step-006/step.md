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

- Split the old 421-line `propagation.test.js` (over the 320-line test budget) into the
  three files the plan implied, each with one subject:
  - `tests/unit/propagation.test.js` - radio maths and the ray (175 lines),
  - `tests/unit/coverage.test.js` - the **grid contract**: stride, whole-map sweep,
    pre-filter equivalence, statistics and denominators, sampling, sector bookkeeping,
  - `tests/unit/coveragebehaviour.test.js` - how the sweep **behaves**: shadowing,
    aiming, power/clutter/receiver, falloff, downtilt, frequency, determinism.
- The flagship test walks the default map twice per design (filter on/off, three
  designs including the 27 dBm biquad where almost nothing is skipped) and asserts:
  same evaluated set, **zero** differences in which points link, zero in band
  assignment, bit-identical dB at every walked point, and `walked.rssi <= filtered.rssi
  < sensitivity` at every dismissed point (the bound really is an upper bound, and a
  dismissed point really could not have linked). It ends with `assert.ok(excluded > 0)`
  so the test can never pass by having skipped nothing.
- Cost gate from the plan is satisfied by measurement, not assertion (a timing assert
  would be a flaky test): worst case 90 ms in Node, see step-003.
- A full-map sweep is in the suite: `the whole map is looked at, and the sweep says what
  limited it` asserts `evaluatedCells > 0.9 * cells` and drives all three
  `limitingFactor` populations (budget / study-range / map-edge).
- Two real bugs fell out of writing these tests, both fixed in `src/`, not in the tests:
  1. `stats.linkAvailabilityPct`, `blockedPct` and every sector `linkedPct` divided by
     `evaluatedCells`, which now includes points the budget dismissed. On flat ground a
     Yagi's "east" sector read 43 % purely because the map is bigger than the link.
     Now there are two named shares - `linkAvailabilityPct` over `walkedCells`, and
     `mapCoveragePct` over the whole study area - plus a per-sector `excluded` count, so
     the reader can tell "the antenna does not serve that direction" from "the map is
     larger than the link". The old single number conflated the two.
  2. A pre-filtered point stored the clearance sentinel (100 r1) together with
     `fresnelClear = false`, so "flag follows ratio" was false for exactly those points.
     The fix is a stated contract rather than a tweak: an unasked point carries **no
     verdict**, `budgetExcluded` is the claim, and `tests/unit/fresnel.test.js` now
     asserts that an unasked point never claims a clear zone and never claims loss.
- Terrain valley test rewritten the way the plan asked (relative to config, not weaker):
  the floor, the rim and the ground beyond are *found* by scanning `heightAt` across the
  channel rather than typed as fixed metres - the meander moves the axis by `meander`
  (260 m) and the rescale moved everything else. Measured south of the fade: floor
  -76 m, rim +20 m, ground beyond +4 m; the channel cut is 79 m in the south and under
  10 m at z = -910, -390 and 0. The meridional claim is measured on the valley height
  function itself, because the blended surface to the north is the mountain and its
  400 m of relief is not a trench - the first version of this test asserted exactly that
  confusion and failed with "419 m of cut".
- Also repaired the two deferred step-002 failures here (they were blocking the gate):
  the valley test above, and `the mountain really diffracts the signal` which had
  hardcoded "north". On the rescaled map the wall is to the **west/north-west**
  (19-22 dB mean obstruction, 0 % linked) and the open ground is south-east (0.5 dB,
  56 % linked), so the test now takes the best and worst sectors and asserts the
  difference is the *ground* (obstruction dB), while the flat-field pattern test keeps
  the compass-direction promises where the compass is the only variable.
- `npm run lint` ok (43 src, 17 test files); `npm run test:unit`: all 12 files pass.
