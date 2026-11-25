# step-002: terrain: rescale the landscape so a 5.2 km map still has mountains in it

## How to perform this step

1. Read `src/terrain/generators.js` and the `TERRAIN` block of `src/config.js`. Note
   which parameters are fractions of `ctx.half` (so they scaled automatically with the
   bigger map: the valley's `northLimit`/`southLimit`, the distant range's
   `centreZ`, blend fractions) and which are **absolute metres** (so they are now
   relatively smaller: `regionalAmplitude`, each zone's `roughness`, `relief`,
   `peak`, `depth`, `rimHeight`, `halfWidth`, `bumpScale`, `meanderAmplitude`,
   `wavelengthM`).
2. Raise the absolute amplitudes by roughly the world factor (about 2.2x, tune by
   measurement, not by taste) so the map keeps the README's character: a mountain with
   a taller range behind it to the north, a valley with raised rims to the south,
   bumps to the west that actually graze a ray, and an east field that stays walkable.
   Do not change the shape logic, only the numbers, and keep the odd-cell-count and
   C0-continuity invariants intact.
3. Measure, do not eyeball. In bare Node, print per azimuth (N/E/S/W): the maximum
   height within the first 2600 m, and the mean |step| of `profileAlong` (the existing
   roughness proxy). Compare against the values the old 2400 m map produced (they are in
   `tests/unit/terrain.test.js` assertions and can be recovered with `git show
   HEAD~N:src/config.js` if needed). Target: the same *ratios* - mountain is still the
   dominant feature, relief still above 150 m scaled, the east still smooth.
4. Screenshot check (server backgrounded, everything timeboxed, stop browser and
   server afterwards): default view and `?preset=valley-reach`, into
   `.tmp/reach-terrain-*.png`, then read both images. The ridges must still cast
   coverage-scale shadows and the valley must read as a channel, not a dent.
5. Expect `tests/unit/terrain.test.js` to fail on absolute coordinates and heights -
   that is step-007's job. Do not weaken those assertions here; note the failures in
   this step's comments so step-007 knows what to fix.

## Expected result

The 5.2 km map is the same landscape, bigger: relief, shadow-casting ridges and a real
valley, verified by numbers and by two screenshots.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Rule that made this measurable: **landforms scale, texture does not**. Peaks, the
  valley and the bump field had amplitude *and* width scaled by 2.17, so slopes are
  preserved; `regionalFrequency`, `flat.roughness`, `fineNoise` and the per-metre noise
  frequencies are untouched so detail stays the physical size the 15 m cells resolve.
  Written into the `TERRAIN` header and into `regional()`, so nobody "fixes" it later.
- Character before (2400 m, half 1200) vs after (5200 m, half 2600), all ratios against
  the half-extent: relief 0.252 -> 0.251; north top 0.219 -> 0.217 (mean step 11.17 ->
  11.26 m per 25 m); west top 0.050 -> 0.048 (step 4.70 -> 4.73); valley floor -34 m ->
  -76 m (0.028 -> 0.029 x half); east mean step 0.14 -> 0.13 m (texture unchanged, as
  intended). Absolute relief 302 -> 652 m, max height 576 m.
- Four magic numbers that this step had to touch were hard-coded in `generators.js`
  (`meanderAmp: 110/70`, `rock: 22/30`); they are now `mountain.meanderM`,
  `distantMeanderM`, `rockM`, `distantRockM` in config.
- Known red tests, owned by step-007 (recorded, not weakened here):
  - `terrain: the valley channel stays south of the site...` - "the rim (-10 m) should
    stand above the ground beyond it (14 m)": probed at fixed metres that are no longer
    on the rim.
  - `propagation: aiming a beam east moves the coverage, and power extends it` - "and
    pointing north links more northern cells": the north is now a taller ridge, so the
    shadowed area grew; the test needs to be expressed relative to the map or with
    shadowing off.
- Screenshots `.tmp/reach-terrain-default.png` (drape ends in terrain, 936 m) and
  `.tmp/reach-terrain-valley.png`. The valley preset still shows a hard arc: it carries
  `maxRangeM: 1600` of its own, so it re-introduces the cap - step-010 owns that.
- Second screenshot took 8.2 s to settle vs 4.5 s: whole-map coverage on the 15 m grid is
  exactly the cost step-003 must fix.
