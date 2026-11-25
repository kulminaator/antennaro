# step-007: unit tests: the geography tests survive the bigger map

## How to perform this step

1. Run `timeout 300 npm run test:unit` and collect every failure caused by the bigger
   world. Expect `tests/unit/terrain.test.js` (probes at 700 m, valley at +/-900 m, the
   "mountain dominates" thresholds), `tests/unit/fresnel.test.js` (path lengths like 405
   m and 705 m were chosen for the old map) and `tests/unit/state.test.js` (range slider
   limits).
2. Fix them by **expressing the invariant in terms of the config, not in metres**:
   probe at `field.half * 0.55` instead of `700`, use `ctx.half` fractions for the
   valley assertions, and take the study-range slider bounds from
   `RF.maxRangeLimitsM`. Where a test genuinely depends on relief (zone-clear shares,
   worst clearance), re-measure it and assert the *relationship* (higher band -> more
   clear cells) instead of the old number.
3. Do not delete a test to make the suite pass. If one cannot be expressed any more,
   write here why, and replace it with what it was protecting.
4. Verify: `npm run lint`, `timeout 300 npm run test:unit` fully green, including the
   architecture tests.

## Expected result

The unit suite describes the landscape as a shape relative to the map, so the next
resize does not cost a day.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
