# step-004: `config.js`: per-design aperture efficiencies, documented

## How to perform this step

1. In `src/config.js`, inside `ANTENNA`, add
   `apertureEfficiency: Object.freeze({ yagi: 0.55, 'biquad-reflector': 0.75, patch: 0.55 })`
   with a comment block that says: peak gain is *derived* from the beamwidths the design
   draws (see `krausDirectivityDbi`); the efficiency is what a real build loses to taper,
   feed, mismatch and edge diffraction; and it must stay <= 1 because a gain above the
   beam-implied directivity is not a design, it is an error. Quote the audit numbers it was
   chosen against (biquad 69x69 -> 8.1 dBi against the 8-10 dBi a measured 2-turn biquad
   with a plate reflector gives; Yagi 41.6x66 -> 9.2 dBi; patch 72x68 -> 6.7 dBi).
2. Also add `apertureEfficiencyDefault: 0.55` for a design that has no entry, so a new
   catalogue entry cannot silently become lossless.
3. Note in the comment that the omni designs are exempt: their gain is the array factor of
   `N` in-phase half-wave sections (`2.15 + 10*log10(N) - 1.0`), where Kraus's single-lobe
   arithmetic does not apply.
4. Verify: `npm run lint` (config is L0 and must stay dependency-free) and
   `node tools/timebox.js -t 120 -- node --test tests/unit/state.test.js` still green - no
   control reads these numbers yet, so nothing else may move.

## Expected result

The one knob that decides how much of the beam-implied directivity a real antenna keeps,
with the measurements it was chosen against written next to it.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- `ANTENNA.apertureEfficiency` (`yagi 0.60`, `biquad-reflector 0.75`, `patch 0.55`) plus
  `ANTENNA.apertureEfficiencyDefault: 0.55`, with a comment block that states the derived-gain
  formula, why efficiency may never exceed 1, the published figures each number was chosen
  against, and that the omni designs are exempt because Kraus has no 360-degree plane.
- **Deviation from this step's text, on purpose:** the step said `yagi: 0.55`, step-001's
  audit chose 0.60. 0.60 puts the default Yagi at 9.55 dBi against the 9.58 dBi it has
  today - so the Yagi does not move, and neither do the valley/flat-field presets or the
  README's Yagi numbers. 0.55 would have knocked 0.45 dB off every Yagi figure in the docs
  to fix a design that was not the complaint. Recorded in step-001's comments; the
  biquad (the actual defect) still drops 4.27 dB.
- `grep` confirms nothing else reads these keys yet (`catalogue.js` picks them up in
  step-005), so no other behaviour moved: `npm run lint` ok,
  `state.test.js` + `architecture.test.js` 42 pass / 0 fail.
- Deliberately not a `config.js` top-level block: efficiency belongs with the antenna
  limits the panel and the catalogue already share, so a new design cannot forget it while
  still finding its beamwidths.
