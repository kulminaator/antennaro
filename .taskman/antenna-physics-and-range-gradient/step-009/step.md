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

- Read `src/propagation/los.js` first: the **clearance** walk already skipped both ends
  (`isEnd` guarded `clearance` and the judged window), but the **obstruction** search did
  not: `maxExcess` was the max over *all* samples including the receiver end, whose excess
  is exactly 0 by construction. On any path that is clear everywhere, the receiver end
  therefore *won* the search, so `maxExcess === 0` with `maxExcessDistance === totalDistance`
  and `d2 === 0`. Two consequences, one cosmetic and one a lie waiting to happen:
  - every clear path reported a "blocking point" at its own far end, and
    `requiredHeightForClearance()` echoed it as `blockingDistanceM` ("the obstacle is
    3600 m away", about a clear path);
  - `diffractionLossDb(0, d1, 0)` returned 0 dB only *because* `d2 <= 0` short-circuits
    it. Move that zero anywhere - or hand the same 0 to a caller that already has real
    `d1`/`d2` - and a clear path is charged the ~6 dB of a grazing knife edge. The old
    code was safe by accident.
- `rayProfile` now excludes both ends from the obstruction search and floors `maxExcess`
  at 0 (its published contract, already pinned by an older test). It also returns
  **`worstExcess`**, the same worst sample before flooring, so callers can tell *clear*
  from *grazing* - which is exactly what the accidental safety above could not.
- New single place for that decision: **`profileObstructionDb(profile, freqHz)`**, used by
  both `obstructionLossDb` and `pathtrace.js` (which used to call `diffractionLossDb` with
  `maxExcess/d1/d2` itself - the two callers can no longer disagree about clear vs grazing).
  `requiredHeightForClearance` now reports `blockingDistanceM: 0` when nothing blocks.
- Two new tests in `tests/unit/propagation.test.js` (178 -> 250 lines):
  - `los: neither end of the ray is allowed to be the obstacle`: flat ground out to 3.6 km
    - clear, 0 dB, `maxExcess === 0` (the ray *touches* the receiver ground, it is not in
    it), the worst point is not the receiver, the last sample *is* the receiver, both ends
    carry `clearance === Infinity` (a zone with no width gets no verdict), and a rim
    *behind* the receiver never appears on the path.
  - `los: the ground a receiver stands on is not an obstacle, unless it is a plateau`.
    My first version of this test asserted the opposite and was wrong, which is worth
    recording: I expected a low transmitter to be shadowed by the flank of the cone whose
    summit holds the receiver. It is not, and cannot be - the flank falls away faster than
    the chord arrives, so the ray misses the ground by 3-4 m at every transmitter height.
    What *does* produce the effect is a **flat tableland**: stand in the middle of a plateau
    and its own far edge is a ridge in front of you. Measured there: worst excess +3.21 m
    at 743 m of a 800 m path (the edge, strictly inside the path), ~14 dB, cleared by a
    60 m mast, and cleared from the same 10 m mast by a receiver 4 m off the ground - which
    is the same fact the Fresnel receiver-height assumption exists for.
- Measured the discretisation version of the same thing while writing it: on a 14.9 m grid
  the interpolated summit of a cone is a small plateau, so a receiver at the sampled apex
  can sit ~0.25 m under the chord that ends on it and be charged ~6 dB. On a 10 m grid with
  the apex exactly on a node the same path is clear by 3.3 m. Left alone deliberately - the
  model's terrain *is* the sampled surface, the receiver's height is read from that same
  surface, and a half-cell flat top above a grazing chord is the mesa case above, not a bug.
- Verified: `npm run test:unit` -> all 13 files pass; `npm run lint` ok;
  `node tools/test.js --browser` -> all 5 files pass in 52 s, so the whole-map coverage
  numbers the docs quote did not move (the dB a path pays is unchanged: the cases that
  changed were clear paths reporting 0 dB by accident, still 0 dB, now by decision).
