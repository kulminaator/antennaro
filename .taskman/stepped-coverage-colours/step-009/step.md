# step-009: unit test fallout, plus a legacy-alias test

## How to perform this step
1. Run `npm run test:unit`; fix the failures caused by the removed gradient - expected in
   `tests/unit/display.test.js` and `tests/unit/terrain.test.js`, anywhere `gradientMaxMarginDb` or
   `rangeGradientRgb` is imported, and in any test that counts `levelCounts` entries or quotes the
   old `levelMarginsDb` thresholds. Do not weaken an assertion to make it pass: re-derive it.
2. Add a state test asserting `coverageViewOf` maps `bands` and `gradient` to `steps`, keeps `zone`,
   and maps garbage to the default; and that a patch carrying `coverageView: 'gradient'` leaves the
   state holding `steps`.
3. Verify: `npm run test:unit` fully green.

## Expected result
Every unit test passes against the new scale, with the alias behaviour pinned.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->
