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
