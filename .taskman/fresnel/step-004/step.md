# step-004: unit tests: first-zone clearance maths and the buried-zone case

## How to perform this step

New file `tests/unit/fresnel.test.js` (keep `tests/unit/propagation.test.js` as the
home of the loss tests). Assert invariants, not golden numbers (GUIDELINES.md §9).

1. Envelope: `firstFresnelEnvelope` has `radiusM === 0` at both ends, its maximum at
   the middle, is symmetric about the middle, and the middle radius equals
   `fresnelRadiusM(D/2, D/2, f)`; the middle radius grows when the frequency drops.
2. Clearance units: build a flat synthetic field and a low ray; `minClearance` equals
   `(ray height above ground) / r1` at the worst sample within a tolerance; raising
   the antenna raises `minClearance` monotonically.
3. **The case the user is complaining about**: a path that clears the ray geometrically
   (`hasLineOfSight === true`, `maxExcess <= 0`) but whose ground sits inside r1 ->
   `fresnelStatus().clear === false`. Use the ridge/wall fixture style already in
   `tests/unit/propagation.test.js`, but make the ridge *lower* than the ray.
4. Criterion monotonicity: `clearFraction` 0 (anything not buried) is easier than 0.6,
   which is easier than 1.0 (fully unobstructed); and for a fixed geometry a higher
   band (smaller r1) is *clearer* than a lower band.
5. Coverage integration: from `computeCoverage` with the default map, assert
   `fresnelClearCells + fresnelObstructedCells === stats.evaluatedCells`, that a cell
   far north (mountain shadow) is not clear while a flat-field cell east of the site
   is, and that `fresnelObstructedLinkedCells <= linkedCells`.
6. Verify: `node --test tests/unit/fresnel.test.js`, then `npm run test:unit`, then
   `npm run lint` (test-layout rules: file under the tests/ line budget).

## Expected result

The Fresnel criterion is pinned by tests, including the "geometrically clear but zone
buried" case that motivated the task.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Three assertions were wrong about the physics before they were wrong about the
  code, all worth remembering:
  - comparing a 41-cell flat field against an 81-cell ridged field did not compare
    anything: `fresnelStatus` picks its sample count from `field.cellSize`, so the two
    minima come from different sample sets. Baselines must share a grid.
  - a low ridge does *not* lower the worst clearance: on a 900 m path from a 20 m mast
    the worst point is near the far guard edge (~1.0 r1), so ridges only become the
    worst point once they approach the ray (~12 m up here). The ladder now starts
    where the ridge starts biting.
  - a 9 m ridge "inside the zone" was still 3 m below the ray, i.e. ratio 0.34, not
    negative. Negative clearance means the ground is above the ray, full stop.
- The threshold test is written around the *measured* ratio (`ratio +/- 0.01`) rather
  than fixed fractions, so it tests the threshold and not a golden number.
