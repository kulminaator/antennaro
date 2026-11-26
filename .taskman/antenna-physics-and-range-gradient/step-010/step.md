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
