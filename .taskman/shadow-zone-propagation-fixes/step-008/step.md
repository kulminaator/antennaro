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
