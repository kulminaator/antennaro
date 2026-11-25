# step-003: coverage.js: per-cell Fresnel flag, clearance ratio and stats

## How to perform this step

1. In `computeCoverage`, reuse the single ray walk per cell: compute the profile once
   (`rayProfile(field, from, to, { freqHz, samples })`), then take
   `obstruction = useDiffraction ? diffractionLossDb(profile.maxExcess, profile.d1, profile.d2, freqHz) : 0`
   and the Fresnel numbers from the *same* profile. Do not walk the path twice: this
   is the hot loop (GUIDELINES.md §7: keep it allocation-free per cell).
2. New typed arrays alongside `obstructionDb`:
   - `fresnelClearance` (Float32Array, worst clearance ratio in units of r1),
   - `fresnelClear` (Uint8Array, 1 = at least `RF.fresnelClearFraction` of the first
     zone is clear).
   Only meaningful where `evaluated[i] === 1`.
3. `stats`: add `fresnelClearCells`, `fresnelObstructedCells`, `fresnelClearPct`,
   and `fresnelObstructedLinkedCells` (a link that is not zone-clear: the number the
   user is really buying). Keep the existing keys and their meaning untouched.
4. `sampleCoverage` returns `fresnelClear` and `fresnelClearanceRatio` too.
5. Note in the module header that the criterion is a *reliability flag*, not a second
   loss term, and why (the dB already come from the Fresnel/Kirchhoff parameter;
   adding a penalty on top would count the same obstruction twice).
6. Verify: `npm run lint`; `npm run test:unit` (the coverage tests must stay green -
   RSSI values must not move at all); bare Node: `computeCoverage` on the default map
   reports `fresnelObstructedCells > 0` behind the mountain and `fresnelClearCells > 0`
   over the flat field, `evaluatedCells === linkedCells + ...` bookkeeping consistent.

## Expected result

Every evaluated cell knows whether its first Fresnel zone is clear, the aggregate
stats summarise it, and the RSSI numbers are bit-for-bit what they were.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
