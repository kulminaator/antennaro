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

- `src/antenna/catalogue.js` now declares, per directional design, a `beamwidths(params)`
  local (`yagiBeamwidths`, `biquadBeamwidths`, `patchBeamwidths`) used by **both**
  `pattern(params)` and `gainDbi(params)`, the latter through a module-level
  `beamGainDbi(entryId, beamwidth)` = `krausDirectivityDbi(...) + 10*log10(efficiency)`.
  One declaration of the beam, so the lobe and the link budget cannot disagree.
- The biquad's `+ 8 dB per lambda of reflector spacing` is gone, and the comment says what
  replaced the reasoning: a bigger plate buys front-to-back ratio, which the `pattern()`
  still models (`backToFrontDb: 13 + 40 * spacing`), not gain a 62-76 degree beam cannot hold.
- New exported helper `beamwidthSpec(id, params)`, returning `null` for the omni designs
  rather than inventing a 360 degree "beamwidth" that Kraus would then misread.
- New test `antenna physics: every directional design says what its build is worth`:
  every directional entry declares `beamwidths`, has its own efficiency entry (so a new
  design cannot silently inherit the default), the efficiency lies in `(0, 1]`, and the
  declared widths are sane. All five physics tests green.
- New peak gains (defaults): dipole 2.15, collinear 7.17, **yagi 9.56 (was 9.58)**,
  **biquad 8.11 (was 12.40)**, **patch 6.66 (was 6.60)**. Across the parameter space the
  Yagi runs 7.39-12.63 dBi, the biquad 7.10-9.06, the patch 3.72-10.20 - each inside the
  beam it draws, each inside the published window.
- `npm run lint` ok; `antenna`, `catalogue`, `antennaphysics` green.
- **One deferred failure, and it is step-007's assigned work, not a new defect**:
  `coverage: no preset is cut off by our own limits` fails with
  `bumps-hills: too few linked points to show a story`. Measured just now: the biquad
  preset links 83 points with a last link of 705 m against an 1864 m budget - 4.3 dB less
  gain, and the bumpy ground does the rest. Every other preset is healthy:
  site-sector 3838 linked / 3008 of 3079 m, valley-reach 2024 / 2481 of 2502,
  flat-field 2057 / 2004 of 2018, mountain-shadow unchanged (it is an omni).
