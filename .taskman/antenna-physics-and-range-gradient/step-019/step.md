# step-019: README rewritten: gains and beamwidths, the three coverage views, the round earth

## How to perform this step

1. Re-measure everything the README will quote: peak gain, H/V beamwidths, front-to-back
   and free-space range per design (`.tmp/antenna-audit.mjs` plus a `withApp` probe reading
   `antenna()` and `rf()`), the default-scene coverage numbers, the preset table, and the
   curvature numbers from `coverage().stats` (`kFactor`, `earthBulgeUnderMaxLinkM`,
   `radioHorizonM`).
2. Update: the **five designs** table to carry gain and beamwidth per design plus a
   paragraph telling the user's story - a biquad's 69-degree beam cannot hold 12 dBi, the
   app now derives gain from the beam, and the ordering test exists; the **What you see**
   and **Controls** sections for the three coverage views and the renamed
   *Fresnel zone volume* / *Terrain shadowing* controls; a new **What the colours can
   mean** subsection listing bands / gradient / zone and stating that switching between them
   changes not one decibel; a **The earth is round, and now it says so** paragraph (k,
   bulge over the last link, smooth-earth horizon, why a low mast dies in an empty valley);
   the URL table (`view`, and `fresnel=1`'s expanded meaning); and the Fresnel/legend
   paragraphs where the numbers moved.
3. Fix anything the change made stale: the 3.05 km biquad budget sentence, the "2.20 km
   Yagi" comparisons, the preset bullets, the coverage-view sentences.
4. Verify: `grep -n "3.05\|12.4 dBi\|bands and a faint row" README.md` finds nothing
   stale; every number in the file traces to a measurement recorded in this step's
   comments.

## Expected result

The README tells the truth about what the app now claims, including the story of the
antenna that could not exist.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- One measurement script for every figure the README may quote,
  `.tmp/readme-numbers.mjs`, run once: `node tools/timebox.js -t 500 -- node
  .tmp/readme-numbers.mjs`. Output copied into the prose, not rounded by hand.
  - designs (default params, 10 dBm / -80 dBm / 868 MHz): dipole 2.15 dBi 360x78 0.94 km;
    collinear 7.17 dBi 360x45 1.67 km; Yagi 9.56 dBi 42x66, F/B 23.6 dB, 2.20 km; biquad
    8.13 dBi 69x69, F/B 23.0 dB, 1.86 km; patch 6.66 dBi 72x68, F/B 15.0 dB, 1.57 km.
  - default scene: 844 linked of 30 624 evaluated (2.8 % of the map, 29.8 % of the 2828
    walked), last link 936 m at 153 deg against a 937 m budget, `limitingFactor: budget`,
    median -90.3 / best -52.1 / worst -117.1 dBm, 73.9 % shadowed, 86.1 % of linked points
    zone-clear; `kFactor 1.413`, bulge under the last link 0.0122 m, horizon 21.90 km,
    worldSize 5200 m.
  - loudest configuration (43 dBm, -124 dBm, 40 m mast): last link 3677 m, `map-edge`,
    bulge 0.188 m, horizon 35.3 km.
  - presets unchanged from step-007, re-measured here (3838/3008/3079/54 %,
    2024/2481/2502/99 %, 2057/2004/2018/91 %, 7064/2044/2045/95 %, 517/1363/3315/96 %), and
    every one still `limitingFactor: budget`.
- **New section `What the colours can mean`**: the three views in one table, what question
  each cell answers, what scale each uses, and the measured argument for the gradient -
  the banded view puts 828 of the 844 linked cells in one colour; the gradient splits them
  6 / 56 / 782 - plus why the ramp top is absolute (`RF.gradientMaxMarginDb: 30`) and the
  pointer to `browser: the coverage view repaints the drape, and no view changes a decibel`.
- **New section `The earth is round, and now it says so`**: the `k 1.41` row quoted verbatim
  from the HUD, the loudest-configuration numbers, the grazing-geometry argument, the
  0.228-vs-0.156 zone radii, and the flat-field 10 m / 25 m pair (314 points / 897 m / 21 %
  against 2057 / 2004 m / 91 %) as the honest way to show what height really buys.
- **A claim caught before it was published.** The first draft said the horizon "is always
  over 11 km, so no configuration can be horizon-limited on this map" - which leaned on the
  4 m terminal assumption and did not say so. Measured instead
  (`.tmp/horizon-binds.mjs`, a HeightField with `heights.fill(0)`, 0.5 m mast, 43 dBm,
  -124 dBm, study range = whole map): every one of the 30 624 points links, the sweep ends
  `map-edge`, and the bulge under the longest 3677 m path is 0.19 m. That is now the basis
  of the paragraph, and it is pinned by a **new unit file `tests/unit/curvature.test.js`**:
  - `coverage: the earth is never what ends the coverage inside this map`
  - `coverage: the curvature facts it reports are the ones rf.js computes` (the stats'
    horizon and bulge must be exactly `radioHorizonM()` / `earthBulgeM()`, and
    `radioHorizonM(2, 1, 0)` must be `Infinity` - a flat earth has no horizon at all).
  Worth recording: `radioHorizonM(0.5, 0)` is 3.0 km, inside this map, so the honest claim
  is *the app's own ray model does not end coverage on the curve here* - measured - and not
  *the horizon is always off the map*, which is only true of the horizon quoted at the
  terminal height the panel sets.
- Other staleness fixed: the Fresnel bullet in *What you see* no longer says one switch does
  two things; *Controls* names the coverage view, the *Fresnel zone volume* and what
  *Terrain shadowing (diffraction loss)* actually switches off; the URL table gained `view`
  and `fresnel=1`'s widened meaning; the five-designs table now carries gain and beamwidth
  (which let the duplicate table in *Antenna physics* go away, replaced by a pointer -
  two tables of the same numbers is two chances to be wrong); the legend paragraph describes
  all three legends and their counts; the presets section says scenarios never pick a view.
- `grep -n "3.05|12.4 dBi|bands and a faint row"` still finds two `12.4 dBi` lines and both
  are deliberate history - "the biquad cannot keep the 12.4 dBi it used to carry" and the
  physics section's opening example - not leftover claims. No `3.05` and no old legend
  sentence anywhere.
- `npm run lint` ok; `npm run test:unit` all **16** files pass (the new curvature file).
