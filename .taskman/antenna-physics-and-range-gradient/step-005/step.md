# step-005: `catalogue.js`: directional gain derived from the beam the design draws; green the new tests

## How to perform this step

1. In `src/antenna/catalogue.js`, for `yagi`, `biquad-reflector` and `patch`: move the
   beamwidth arithmetic out of `pattern(params)` into a per-entry
   `beamwidths(params)` returning `{ azimuthDeg, elevationDeg }` (the same numbers
   `pattern(params)` already computes - cut them out of `pattern` and have `pattern` call
   `beamwidths`, so there is still exactly one source of beamwidth truth), then define
   `gainDbi: (p) => { const w = beamwidths(p); return beamGainDbi(w); }` where a local
   helper `beamGainDbi(w)` is
   `krausDirectivityDbi(w.azimuthDeg, w.elevationDeg) + 10*log10(efficiency(entry.id))`
   with `efficiency` reading `ANTENNA.apertureEfficiency[id] ??
   ANTENNA.apertureEfficiencyDefault`.
2. Import `krausDirectivityDbi` from `./pattern.js` (same layer, no new module, so
   `tools/lib/arch.js` needs no change).
3. Leave `omni-dipole` and `omni-collinear` gains exactly as they are and add a comment at
   the top of the catalogue explaining the two-model split, so nobody "unifies" them later.
4. Check nothing else hard-codes the old gains: `grep -rn "12.4\|9.58\|8.6 +" src tests`.
5. Verify: `node tools/timebox.js -t 200 -- node --test tests/unit/antennaphysics.test.js`
   fully green, then `node tools/timebox.js -t 200 -- node --test tests/unit/antenna.test.js
   tests/unit/catalogue.test.js` green, then `npm run test:unit` green. Record the new peak
   gains for all five designs in the step comments.

## Expected result

Directional gain is a consequence of the drawn beam. The biquad lands near 8 dBi, the
Yagi keeps roughly what it had, and the two suites that pin antenna physics agree.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
