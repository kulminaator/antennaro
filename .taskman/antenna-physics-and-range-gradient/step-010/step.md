# step-010: `rf.js`: `earthBulgeM()` and `radioHorizonM()`, used by `los.js`, tested against the textbook

## How to perform this step

1. In `src/propagation/rf.js` add two pure helpers:
   `earthBulgeM(d1M, d2M, kFactor = RF.kFactor)` = `(d1 * d2) / (2 * kFactor *
   RF.earthRadiusM)`, and
   `radioHorizonM(h1M, h2M, kFactor = RF.kFactor)` =
   `sqrt(2 * kFactor * RF.earthRadiusM) * (sqrt(max(0, h1)) + sqrt(max(0, h2)))`, each with
   a comment deriving it (the equivalent-radius earth model; the horizon formula is the
   tangent-length sum and is a *smooth-earth* number, valid where there is no obstacle).
2. Replace the inline bulge expression in `los.js` with `earthBulgeM(...)` and import it -
   one definition of the geometry, used by both the loss walk and the zone walk.
3. Guard the flat-earth case: if `kFactor <= 0`, `earthBulgeM` returns 0 and
   `radioHorizonM` returns `Infinity`, and say in the comment that `kFactor <= 0` means
   "flat earth" and is only meaningful for tests.
4. Test in `tests/unit/propagation.test.js`: `earthBulgeM` against the hand-worked
   midpoint of a 2.6 km path (`(1300*1300)/(2*k*R)` to 3 decimals) and the fact that it is
   0 at both ends and maximal at the middle; `radioHorizonM(2, 1)` within 1 % of the
   textbook 10.2 km at `k = 1.413`, monotone in both heights, `Infinity` for a flat earth.
5. Verify: `node tools/timebox.js -t 200 -- node --test tests/unit/propagation.test.js`
   green, and `npm run lint`.

## Expected result

The earth's shape is one named piece of maths in one place, with the horizon it implies
computable by anything that needs to say it out loud.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- `src/propagation/rf.js` gains `earthBulgeM(d1M, d2M, kFactor = RF.kFactor, earthRadiusM
  = RF.earthRadiusM)` and `radioHorizonM(h1M, h2M, ...)` (157 lines, still small), and
  `los.js` now calls `earthBulgeM(d1, d2, kFactor, earthRadiusM)` instead of carrying its
  own `(d1 * d2) / (2 * kFactor * earthRadiusM)`: one definition of the geometry, used by
  the loss walk and the zone walk alike.
- Flat-earth guard as specified: `earthBulgeM` returns 0 for `kFactor <= 0`, `radioHorizonM`
  returns `Infinity`, and both comments say this is a test-only setting rather than a
  physical atmosphere.
- New tests, green: `rf: the earth bulges under a ray, exactly as much as the geometry says`
  (hand-worked 2.6 km midpoint 0.094 m, 0 at both ends, negative distances cannot buy
  negative ground, quadratic in path length - 5.2 km of path is 4x the 2.6 km bulge -
  symmetric in the split, smaller nearer an end, smaller with more refraction, 0 with the
  flat-earth switch) and `rf: the radio horizon is the textbook tangent sum, and beyond
  this map` (`radioHorizonM(2, 1)` within 1 % of `sqrt(2kR)(sqrt h1 + sqrt h2)` = 10.24 km,
  monotone in both heights, symmetric, 0 for two antennas lying on the ground, `Infinity`
  for a flat earth, and greater than `WORLD.worldSize` for the app's own defaults).
- **Numbers that matter for steps 011-014, and they change what those steps can claim.**
  The bulge is quadratic in path length, so at this map's scale it is tiny: 0.014 m at
  1 km, 0.06 m at 2 km, 0.13 m at 3 km; centre to corner (3.68 km) is **0.19 m**, and the
  corner-to-corner diagonal, the longest path the map contains, is **0.75 m**. Meanwhile
  `radioHorizonM(10, 2)` is 19.4 km and even `radioHorizonM(0.5, 4)` is 11.5 km, against a
  5.2 km map. So on flat ground neither the bulge nor the horizon can end a link anywhere
  inside this world - step-014's premise that a horizon can be "inside the map" does not
  survive measurement, and step-012's fallback wording ("the earth curves away long before
  this map ends") is going to be the sentence that actually shows, always. Recorded in
  task.md; will be written into the HUD as the honest answer instead of staged as a
  demonstration.
- First draft of the `earthBulgeM` comment quoted "2.2 m at 1 km, 8.8 m at 2 km, 20 m at
  3 km", which is about 100x too big (it came from mis-applying the classic per-km rule of
  thumb). Corrected against the function itself before committing, and the test pins the
  corrected scale so a future doc edit cannot re-inflate it.
