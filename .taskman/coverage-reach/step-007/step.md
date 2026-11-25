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

- Most of the geography damage had to be repaired in step-006 to get a green gate at
  all; this step is the audit the plan asked for: what is left that encodes the old map.
- `tests/unit/terrain.test.js` gained an `at(fractionX, fractionZ)` helper that turns a
  fraction of the map's half-extent into a probe, and every geography probe went
  through it: the four-zone quadrant test (`0.3 x half`), the zone-weight blend
  (`0.4 x half`), the mast-foot spots (centre, ridge shoulder `0.30,-0.33`, mountain
  `0,-0.35`, valley floor `0,0.35`, far corner `-0.67`, east edge `0.92`), the relief
  pair, the ridge-cliff probe and the "zones do not move with the mast" anchors.
  Heights, slopes and the 40 m cliff threshold stay in metres - those are the physical
  promises the README makes, and they are what a resize must not silently break.
- Re-measured at the new probes: the ridge shoulder is (780, -858) at 332 m and the
  ground 130 m east is 150 m, so the cliff is 182 m of drop - steeper than the probe it
  replaced, so the ridge test got stronger rather than looser. Mountain probe (0, -910)
  is 455 m; valley floor (0, 910) is -70 m.
- One magic number left the reducer: `state.js` clamped `worldSize` to a literal
  `{ min: 400, max: 8000 }`. Now `WORLD.minWorldSize` / `WORLD.maxWorldSize` in config,
  with the reason for each bound, and `tests/unit/state.test.js` asserts against those
  keys - so the slider limit *is* the reducer limit, as it already was for site
  placement.
- `tests/unit/fresnel.test.js` needed no geography work: its fixtures are their own
  `HeightField`s (2000 m, 81 vertices) built in the file, so its 900 m paths and
  1200 m envelopes are statements about the fixture, not about the application map.
- No test was deleted. The only assertion removed outright was the hard-coded "north is
  obstructed" claim, replaced in step-006 by best/worst sector comparison plus a
  flat-ground pattern test - see that step's notes for what it was protecting.
- `npm run lint` ok, `npm run test:unit` green: all 12 files, 2.8 s.
