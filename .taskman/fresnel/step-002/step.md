# step-002: los.js: the ray profile reports first-zone clearance

## How to perform this step

`rayProfile` already walks the ray and knows `d1`, `d2` and the earth bulge; make it
also report the first Fresnel zone along the same walk. Do not change the dB maths.

1. Give `rayProfile` a `freqHz` option (default `undefined` -> `r1` reported as 0 and
   `clearance` as `Infinity`, so existing callers keep working and stay cheap).
2. Per sample add `fresnelRadiusM` (import `fresnelRadiusM` from `./rf.js`) and
   `clearance = (rayY - terrainY) / r1` in units of the zone radius (positive = the
   ground is below the ray; negative = buried in the zone). Endpoints (i === 0,
   i === n) are not obstacles: keep their clearance at `Infinity`.
3. Report `minClearance` and `minClearanceDistance` beside `maxExcess`. Note the
   relationship the module comment must state: `v = sqrt(2) * excess / r1`, so the
   existing `diffractionLossDb` and the new clearance measure are the same physics
   viewed two ways - loss (dB) and zone occupancy (fraction of r1).
4. Add `fresnelClearanceDb`-free helpers:
   - `fresnelStatus(field, from, to, freqHz, options)` returning
     `{ clearanceRatio, distanceM, radiusM, clear }` where `clear` is
     `clearanceRatio >= (options.clearFraction ?? RF.fresnelClearFraction)`;
   - `firstFresnelEnvelope({ distanceM, freqHz, steps })` -> array of
     `{ distance, radiusM }` for a link of `distanceM` (radius 0 at both ends, maximum
     at the middle). This is what the volume mesh will extrude, and it must be pure.
5. Keep `hasLineOfSight`, `obstructionLossDb`, `requiredHeightForClearance` behaving
   exactly as before (the propagation unit tests must pass untouched).
6. Verify: `npm run lint`; `npm run test:unit` (propagation suite green); a bare-Node
   probe printing `fresnelStatus` for a flat path (clear) and for the `wall` fixture
   used in `tests/unit/propagation.test.js` (not clear).

## Expected result

`los.js` answers "how much of the first zone is buried, and where", in units of r1,
from the same walk that produces the diffraction loss - and a pure envelope sampler
the renderer can use.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
