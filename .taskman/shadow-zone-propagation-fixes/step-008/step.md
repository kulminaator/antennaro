# step-008: prove the onset change did not move the pre-filter or the zone verdicts

## How to perform this step

The onset change makes near-grazing cells slightly weaker. Two invariants must survive.

1. Run the coverage and Fresnel unit files separately under timeboxes
   (`tests/unit/coverage.test.js`, `tests/unit/coveragebehaviour.test.js`,
   `tests/unit/fresnel.test.js`). Fix any expectation that assumed the step, never by
   loosening an invariant: the pre-filter test compares the walk against the free-space
   upper bound and must stay exact.
2. Confirm - and add if missing, or record that it is already there - that the pre-filter
   still cannot drop a linked point with the onset loss in place: the free-space value
   used to exclude is still an upper bound now that small positive losses exist for clear
   rays. If `src/propagation/coverage.js` (348 lines) argues that in a comment, update
   the comment, not the logic.
3. Confirm the receiver-height invariant: coverage RSSI must not move when
   `RF.fresnelRxHeightM` changes.
4. Record here how far the default map's numbers moved (linked cells, median RSSI) so
   step-013 can tell a real change from rounding.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

1. `tests/unit/coverage.test.js`, `coveragebehaviour.test.js` and `fresnel.test.js` run
   together: 28 tests, all green. No expectation had to be loosened - the onset change had
   already been absorbed by the three test files rewritten in step-007.
2. The pre-filter's argument in the `coverage.js` header ("diffraction and clutter only
   subtract, so such a point cannot link and the stored value is the upper bound it failed to
   beat") survives verbatim, so the comment stays as it is: `diffractionLossDb` returns
   `Math.max(0, ...)`, so a signed input still cannot produce a negative loss. What was
   missing was a *per-cell* proof. `coverage.test.js` only compared the bound for points the
   filter had already dismissed, and `coveragebehaviour.test.js` only compared the two maps
   by sums. New test in `tests/unit/diffraction.test.js`:
   `diffraction: on the map the app ships, ground only ever subtracts` - every walked,
   non-dismissed cell is checked for `obstructionDb >= 0`, for `rssi <= free-space rssi`, and
   for the shadowing-off sweep carrying no loss at all; and it requires **both regimes to be
   present** (some cells charged, some not) so the loop cannot pass by being empty. With the
   continuous onset that last part matters: a map where nothing is charged would now be a
   silent model failure rather than a suspicious result.
3. Receiver-height invariant already pinned at unit level, and it still holds exactly -
   `tests/unit/fresnel.test.js` asserts every RSSI value and every `obstructionDb` value is
   identical when `rxHeightM` moves, plus the browser test
   `the receiver assumption moves the verdict and never the decibels`. Nothing added.
4. Movement of the default configuration, from the step-007 measurements, for step-013:

   | | before onset change | after |
   | --- | --- | --- |
   | linked cells | 844 | 842 |
   | last linked range | 936 m | 936 m |
   | walked cells | 2828 | 2828 |
   | median RSSI | -90.3 dBm | -90.3 dBm |
   | best RSSI | -52.1 dBm | **-50.1 dBm** |
   | worst RSSI | -117.1 dBm | -117.1 dBm |
   | zone-clear | 86.1 % | **87.2 %** |
   | `limitingFactor` | budget | budget |

   The best path *improving* by 2 dB is the receiver-footing artefact going away, not the
   onset: the old model charged the deepest burial (usually next to the receiver) rather than
   the crest that blocks.
