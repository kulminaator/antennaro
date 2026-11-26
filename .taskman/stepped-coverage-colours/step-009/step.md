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

- `tests/unit/display.test.js`: the select now offers two values, and the test asserts the option
  *labels* too, because "signal steps (red to yellow)" is the sentence that tells a user the scale
  changed and the value `steps` does not.
- Added the guard step-006 promised: every preset must resolve to a view the panel offers. The
  existing preset test already asserted a preset may not write `display` at all; this one names the
  failure mode that mattered - a preset hard-coding a retired view would be refused at boot in
  silence, since `applyPatch` keeps the old value and reports the rejection in a list nobody reads
  unless it is asked.
- `tests/unit/propagation.test.js`: the band/threshold test is renamed to say *steps*, and its
  failure messages with it. The maths it guards (`levelIndexFor`, thresholds from config) is
  unchanged by this task, which is why the assertions did not need touching.
- Full unit suite: 20/20 files, 6.8 s.
