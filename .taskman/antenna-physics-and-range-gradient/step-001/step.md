# step-001: record the physics audit: claimed gain against beamwidth-implied directivity, all designs, all corners

## How to perform this step

1. Run `node tools/timebox.js -t 60 -- node .tmp/antenna-audit.mjs` (the probe already
   exists from planning; it calls `createAntennaModel(...).summary()` for every design at
   default, at every parameter min and max, and at extra Yagi/biquad points, and prints
   peak gain, H/V beamwidths, `kraus = 10*log10(41253/(H*V))` and `peak - kraus`).
2. If the probe is missing, rewrite it: import `ANTENNA_CATALOGUE`,
   `createDefaultParams` from `src/antenna/catalogue.js`, `createAntennaModel` from
   `src/antenna/model.js`, `wavelengthM` from `src/propagation/rf.js`; aim
   `{azimuthDeg: 0, tiltDeg: 0, beamTiltDeg: 0}`; print the table.
3. Write the whole table into this step's comments, and next to every row mark whether the
   design is over or under its beam-implied directivity.
4. Decide (and write down) the per-design aperture efficiency to be used in step-004:
   the target is that the derived gain lands on the published typical figure for each
   design - biquad ~8-9 dBi, Yagi ~9-12 dBi across its director range, patch ~6-7 dBi -
   while never exceeding the beam-implied directivity.
5. Verify: the table and the chosen efficiencies are in the step comments; no source file
   changed (`git status --short` shows only `.taskman/`).

## Expected result

The audit numbers are on paper, so step-002 can be written against facts and step-005 has
a target to hit. Nothing in `src/` has changed.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Audit command: `node tools/timebox.js -t 60 -- node .tmp/antenna-audit.mjs`. It builds
  every catalogue design through `createAntennaModel(...).summary()` (so the beamwidths are
  the ones the model *measures off its own pattern*, not the ones the spec claims) at
  default params, at each parameter's min and max, and at extra Yagi/biquad points.
  `Kraus` is `10*log10(41253 / (H*V))`; `peak-Kraus` > 0 means the design claims more gain
  than its own beam can physically hold.

  | design | params | peak dBi | H deg | V deg | Kraus | peak-Kraus | verdict |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | omni-dipole | default | 2.15 | 360.0 | 78.0 | 1.67 | +0.48 | Kraus invalid for an omni plane |
  | omni-collinear | default | 7.17 | 360.0 | 44.6 | 4.10 | +3.07 | Kraus invalid for an omni plane |
  | omni-collinear | min | 4.16 | 360.0 | 76.4 | 1.76 | +2.40 | ditto |
  | omni-collinear | max | 10.18 | 360.0 | 6.4 | 12.53 | -2.35 | fine |
  | yagi | default (7 dir) | 9.58 | 41.6 | 66.0 | 11.77 | **-2.18** | plausible, pessimistic |
  | yagi | min (2 dir) | 5.42 | 68.6 | 66.0 | 9.60 | **-4.17** | far under its own beam |
  | yagi | max (14 dir) | 12.29 | 20.6 | 66.0 | 14.82 | -2.54 | plausible, pessimistic |
  | yagi | dir=10 | 10.95 | 31.8 | 66.0 | 12.93 | -1.98 | ok |
  | biquad-reflector | default | 12.40 | 69.0 | 69.0 | 9.38 | **+3.02** | IMPOSSIBLE |
  | biquad-reflector | min (1 turn) | 8.60 | 76.0 | 76.0 | 8.54 | **+0.06** | at the limit already |
  | biquad-reflector | max (3 turns) | 16.20 | 62.0 | 62.0 | 10.31 | **+5.89** | IMPOSSIBLE |
  | patch | default | 6.60 | 72.0 | 68.0 | 9.26 | -2.66 | plausible |
  | patch | max | 8.36 | 48.0 | 45.4 | 12.77 | -4.41 | plausible, pessimistic |

- The user's complaint is visible in two rows at once: the biquad's default gain is
  **3.0 dB above what a 69 x 69 degree beam can hold**, and the Yagi sits 2-4 dB *below*
  what its narrower beam implies. The biquad's parameter model is the main offender:
  `8.6 + 2.6*(turns-1) + 8*(spacing-0.1)` reaches **16.2 dBi** at max parameters, which is
  5.9 dB over the physical ceiling for the beam it draws - it is not a strong antenna, it
  is an arithmetic that stops being an antenna.
- `turns` moves the beamwidth by only 7 degrees per turn while adding 2.6 dB of gain, which
  is the wrong direction of causality: for a loop in front of a plate, more turns raise the
  gain *because* the beam tightens. Deriving gain from the beam fixes the causality for
  free.
- Omnis are exempt from the Kraus invariant, and must be labelled as exempt in the test:
  `D = 41253/(H*V)` assumes a single main lobe in both planes, and an omni's 360 degree
  azimuth plane is not one. The collinear's `+3.07` is an artefact of the formula, not a
  defect - its gain comes from the array factor of N in-phase half-wave sections
  (`2.15 + 10*log10(N) - 1.0`), which is already pinned in `tests/unit/antenna.test.js`.
- Chosen aperture efficiencies for step-004/005 (`gain = Kraus + 10*log10(efficiency)`):
  - `yagi: 0.60` (-2.22 dB) -> 7.60 dBi at 2 directors, 9.55 at 7 (today 9.58, so the Yagi
    effectively does not move), 12.28 at 14. Against published single-row Yagis
    (~7-8 dBi for 3 elements, ~12-13 for a 15-element boom) this is honest.
  - `biquad-reflector: 0.75` (-1.25 dB) -> 7.29 at 1 turn, **8.13 at the default 2 turns**
    against the 8-10 dBi measured builds give, 9.06 at 3 turns. This is the -4.3 dB that
    makes the biquad a biquad again.
  - `patch: 0.55` (-2.60 dB) -> 3.55 / 6.66 / 10.17 dBi across its size range against the
    4-10 dBi a microstrip panel of that aperture gives. Barely moves from today's 6.60.
  - Default for an unknown design: `0.55`, so a new catalogue entry cannot be lossless by
    forgetting to say it is not.
- Resulting ordering at defaults: Yagi 9.55 dBi / 41.6 x 66 versus biquad 8.13 dBi /
  69 x 69 - the Yagi wins on gain and is narrower in both planes, which is what step-002
  will assert and step-008 will assert again in the browser.
- Preset fallout to expect in step-007: the biquad loses 4.3 dB of budget (the
  `bumps-hills` preset quoted 3.05 km), the Yagi loses 0.03 dB and the patch gains 0.06 dB
  - i.e. one preset needs retuning and two need re-measuring, not retuning.
