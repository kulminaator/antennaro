# step-009: `los.js`: the ray's own receiver end is not an obstacle; pin it with tests

## How to perform this step

1. In `src/propagation/los.js`, `rayProfile` currently writes
   `const excess = i === 0 ? -Infinity : terrainY - rayY;` while its own comment says
   "Neither end is an obstacle". Change it so the last sample is excluded the same way
   (`i === 0 || i === n ? -Infinity : ...`) and make the comment say what is excluded and
   why: `from.y + (to.y - from.y)` is not exactly `to.y` in floating point, so the
   receiver's own sample can carry a +-1e-17 excess that reads as an obstruction.
2. Prove the defect first if you want to see it: on a flat `HeightField`,
   `hasLineOfSight(field, {x: -500, y: 0.5, z: 0}, {x: 500, y: 0.1, z: 0})` returns false
   today, while the textbook horizon for those heights is 4.3 km.
3. Add to `tests/unit/propagation.test.js` (178 lines, room): a test
   `los: a flat plain never obstructs a path between two points above it`, sweeping
   `h1` over `[0.5, 0.7, 1, 1.7, 2, 5, 10, 10.3, 21.5]` and distances over 0.2..3 km
   (well inside the horizon), asserting `maxExcess <= 0`, `hasLineOfSight` true and
   `obstructionLossDb === 0` everywhere; and a second test
   `los: clearing an obstacle does not depend on floating-point dust`, where a path that is
   1e-9 m clear of a wall must report 0 dB and LOS, and the same path 1e-9 m into it must
   report a positive excess.
4. Re-check the callers: `grep -rn "maxExcess\|hasLineOfSight" src` - `pathtrace.js` uses
   `maxExcess` with `d1`/`d2` from `maxExcessDistance`, and the endpoint exclusion cannot
   hide a real obstacle because the endpoints are not obstacles by definition.
5. Verify: `node tools/timebox.js -t 200 -- node --test tests/unit/propagation.test.js
   tests/unit/fresnel.test.js tests/unit/coveragebehaviour.test.js` green.

## Expected result

A clear path reads as clear for every pair of numbers, not for the ones that happen to
round the right way.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
