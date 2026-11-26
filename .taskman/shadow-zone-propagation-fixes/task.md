# Task: shadow-zone-propagation-fixes

## Description

Four defects in the terrain-diffraction model were found while answering "do we model
the shadow zone behind an obstacle?". We do model knife-edge diffraction (ITU-R P.526
form, `src/propagation/los.js`), but:

1. **The earth's curvature enters with the wrong sign.** `rayProfile()` adds the
   effective-earth bulge to the ray height (`rayY = from.y + dy * t + bulge`), which
   lifts the ray over obstacles. In the equivalent-earth model the terrain bows up
   toward the chord, so the correction must come off the ray. Measured: a 30 km link
   with a 21.90 km radio horizon is reported `clear` (worst excess -4.58 m where the
   geometry wants +5.50 m), and on this map every distant obstruction is under-predicted
   by up to 2x the bulge (0.75 m over the longest legal link). No test pins the sign.
2. **The shadow onset is a 6 dB step.** `profileObstructionDb()` returns 0 dB for any
   ray that misses the ground everywhere, so the physically lossy region
   v in (-0.78, 0) - 0 to 6 dB - is reported as 0 dB and the shadow line itself jumps
   from 0 to 6.03 dB in one centimetre.
3. **Narrow crests are missed by the sample grid.** Ray samples are 54 m apart across
   the map, so a crest that falls between two samples is invisible: measured for a 20 m
   ridge of sigma 20 m, 0.0 dB reported against 11.2 dB for the same path sampled fine.
4. **Obstructions do not accumulate.** The worst single sample dominates, so a second
   ridge behind the first costs nothing: one 10 m ridge and two 10 m ridges both give
   10.90 dB. A Deygout-style multi-edge sum over the sampled profile is the standard
   cheap fix.

Finished means: all four fixed in `src/propagation/los.js` (with whatever constants
they need in `src/config.js`), each pinned by an invariant test that states the maths,
the consequences re-measured rather than assumed (the "curvature never ends coverage on
this map" claim is now false for low masts and must be re-derived honestly), presets and
the default scene re-measured, README + GUIDELINES rewritten from those measurements, the
four docs screenshots regenerated and their captions rewritten from the pixels, and
`npm run verify` green.

## Steps

1. step-001 - red unit tests for the direction the earth bulge moves a ray
2. step-002 - flip the bulge sign in rayProfile and get the unit suite green
3. step-003 - pin the convention against the radio horizon, not against a metre reading
4. step-004 - measure what curvature actually does on this map now, no code
5. step-005 - rewrite the curvature unit tests to the honest finding
6. step-006 - rewrite the curvature browser tests to the honest finding
7. step-007 - charge diffraction from the signed obstruction, so the shadow starts at 0 dB
8. step-008 - prove the onset change did not move the pre-filter or the zone verdicts
9. step-009 - refine the ray around its worst sample so narrow crests are found
10. step-010 - measure the cost of refinement and put its size in config
11. step-011 - Deygout multi-edge loss, as a pure function with its own tests
12. step-012 - use the multi-edge sum in the sweep, single edge must not change
13. step-013 - re-measure the five presets and the default scene
14. step-014 - README: the corrected curvature story and the new model notes
15. step-015 - GUIDELINES: the chord convention, the onset, multi-edge, refinement
16. step-016 - screenshots from the new numbers, full verify, closing measurements

*(Step statuses are tracked only in each `step-NNN/status` file, never here.)*

## Comments

- `radioHorizonM()` and `rayProfile()` are one geometry seen two ways, and the identity
  is exact when the two ends are at the same height: mid-path bulge `D^2 / (8 k R)`
  equals the ray height `h` at `D = 2 sqrt(2 k R h)`, which is what
  `radioHorizonM(h, h)` returns. Use that shape for curvature tests; with a receiver at
  ground level (`h2 = 0`) the dip is only a centimetre near the horizon and makes a weak
  assertion. (found in step-001)
- The bulge bug shows up as an error of exactly **twice** the bulge, which makes it easy
  to recognise in a failure message: the ray sits at `chord + bulge` instead of
  `chord - bulge`. (found in step-001)

- step-004 measurements (probe `.tmp/curvature-truth.mjs`): the earth begins to hide a
  ground-level terminal at 3008 m with the panel's lowest 0.5 m mast, 4254 m at 1 m,
  6016 m at 2 m, 9513 m at 5 m - so curvature obstructs **inside** this map for masts at
  or below 2 m and for nothing taller. The default 10 m configuration is numerically
  identical to before the fix (844 linked, 936 m, median -90.3 dBm, 86.1 % zone-clear);
  113 of its 844 linked paths change in dB, none by more than 0.01 dB, while all 844
  change in zone clearance. On the loudest configuration curvature is worth up to
  **6.12 dB** on a grazing path at 3141 m. Keep the "curvature never ends coverage here"
  test - it is still true - and add the obstruction fact next to it.
- `computeCoverage` needs `site` from `resolveSite(field, {...})`, not a bare
  `{x, z, heightM}`: without `groundY`/`y` the antenna ends up underground and every
  number the probe prints is nonsense (it looked plausible, which is the dangerous part).
- `computeCoverage` does not accept a `kFactor`, so "curved versus flat" comparisons have
  to re-walk paths with `rayProfile(..., { kFactor: 0 })` beside the sweep rather than
  running the sweep twice.

- `window.__sim.rayTo(x, z, { kFactor })` exists now (`src/app/testapi.js`): the app's own
  ray to a ground point, with the curvature optionally switched off. It is how curvature
  gets attributed to a specific path over real terrain, and GUIDELINES section 9 still
  needs it added to the method list. (step-006)

- The 6 dB cliff was not the only thing the floored excess was hiding. Charging the signed
  worst sample made every path over flat ground cost 4.5-6 dB, because the decibels belong
  to a terminal *on the ground* and the ray therefore always ends in the ground: the worst
  "obstruction" was the receiver's own footing, winning against a zone that collapses to
  nothing at an antenna. `worstScreen()` now charges a crest (continuous onset) or any
  burial beyond `RF.diffractionNearEndM` of the receiver. The floor had also been
  *inflating* deep shadow - the default map's best path got 2 dB better.
- Do not exclude the transmitter end by distance. The western wall is 16 m from the mast and
  the northern lip 17 m; both are real obstacles (`rayTo` charged 40.8 dB and 10.8 dB). The
  metre guard is receiving-end only.
- A band is also a budget: comparing `clearPct` across bands on the default budget compares
  2271 linked cells with 14. Band tests must open the budget until the linked set is fixed.
- `-1000, 0` looking east is not a free-space corridor (it costs 3.2 dB); the middle of the
  map looking east is (0.994 of budget). Rank antennas on the latter, and pin ground cost in
  dB explicitly wherever it is nonzero.

## Task comments

### Numbers steps 014-016 quote (all re-measured in step-013, nothing adjusted to fit)

- Default scene: **836 linked of 30624** (2.7 % of the map, 29.6 % of reachable ground), last
  link **936 m @ 153 deg** against a **937 m** budget, `limit: budget`; RSSI **-50.1 / -90.2 /
  -116.7 dBm** (best / median / worst); zone **87.9 %** clear, **101** linked cells cut
  (**12.1 %**), worst clearance **-19.9 r1 at 90 m**; curvature **k 1.413**, ray bows **0.0122 m**
  over the longest link, radio horizon **21.90 km**; bands `[0,0,20,816,29788]`, gradient thirds
  **8 / 58 / 770**, faint **1992**, never measured **27796**; HUD **73.7 %** of walked cells
  diffracted by more than 6 dB.
- Presets all still end at their own link (`limit: budget`), none retuned. Last link / budget:
  site-sector 2.20 / 3.08 km, valley-reach 2.48 / 2.50 km, flat-field 2.00 / 2.02 km,
  mountain-shadow 2.04 / 2.04 km, bumps-hills 1.42 / 3.32 km.
- Design reaches up the east corridor at 40 m: **0.93, 1.56, 1.67, 1.86, 2.18 km** for dipole,
  patch, collinear, biquad, Yagi - 99-100 % of their own free space, exactly in gain order.
  At the centre on the default 10 m mast, aimed east: Yagi **0.81** of 2.20 km, patch **0.93** of
  1.57, biquad **0.97** of 1.86 - gain ordered, range not.
- Band sweep at the default budget: **77.1 %** of 2165 clear at 433 MHz, **87.9 %** of 836 at
  868, **92.9 %** of 84 at 2.4 GHz, **93.3 %** of 15 at 5.8 GHz.
- Flat-field preset as a horizon demonstration: **273** cells / **0.81 km** of 2.20 km / **19 %**
  clear at 10 m, **1770** cells / **2.18 km** / **93 %** at 25 m.
- What the four fixes were worth, in one line each: the earth now hides what is behind it
  (step-002); the shadow begins at 0 dB instead of leaping to 6 (step-007); the ray walks the
  mesh instead of stepping over it, 6.5 dB -> 1.9 dB worst case (step-009); and ridges
  accumulate, moving **22.1 %** of cells by up to **15.7 dB**, because **72 %** of paths from the
  default mast cross two or more screens (step-012).

### Correction to the step-012 note (measured in step-014)

The "72 % of paths cross two or more screens" above is the **loudest** configuration (43 dBm
into -124 dBm, 22117 of 30624 walked paths = 72.2 %). For the **default** mast and budget it is
844 of 2828 walked paths = **29.8 %**. The "22.1 % of cells moved, up to 15.74 dB" figure is the
default configuration and stands.

And the `diffractionEdgeLimit: 3` cap keeps the **three tallest** screens, not the first three:
against summing the eight tallest it costs 0.6 dB of mean but up to 29.1 dB on individual
paths (7.3 % of paths lose >1 dB, 2.1 % lose >10 dB, all on cells already far past dead). No
cell crosses the sensitivity line at either configuration, so 3 stands - as a stated model
choice, now asserted: `edgeLimit: 1` must equal the tallest screen alone.

## Task closed

`npm run verify`: `vendor ok - three 0.187.0, three.module.min.js 732 KiB, license + notice
present`, `lint ok - 45 src, 15 tools, 27 tests file(s)`, `all 26 test file(s) passed in
71422 ms`.

Sweep cost over the whole task, median of three on one probe: default configuration
57 ms -> 46 ms (mesh sampling, which over-sampled short paths less) -> 49 ms (multi-edge);
the loudest whole-map sweep 172 ms -> 226 ms -> 270 ms.

One sentence each, defect -> fix -> test:
1. The earth bulged the wrong way into the ray, so curvature helped links instead of hiding
   ground - subtract it, anchor both ray ends, and tie the quoted horizon to the grazing ray;
   `tests/unit/raycurvature.test.js`.
2. A shadow began at 6 dB - charge the loss from the signed screen parameter so it grows out of
   0 dB and crosses ~6 dB at the shadow line; `diffraction: the loss climbs through the shadow
   line instead of stepping over it`.
3. Narrow crests were invisible to a 54 m sample grid, and no refinement pass can find a crest
   no sample lands on - walk at one sample per terrain cell through one shared `pathSamples()`;
   `diffraction: the ray walk is dense enough to see the mesh it walks over`.
4. Ridges behind ridges were free - sum screens Deygout-style in the new
   `src/propagation/diffraction.js`, floored at the most significant screen alone, wired through
   `profileObstructionDb` so the map and `__sim.rayTo` cannot disagree;
   `tests/unit/multiedge.test.js`.
5. The curvature row said "the earth curves away long before this map ends" at a 0.5 m mast
   where 2232 cells are earth-obstructed - it now also quotes the horizon of a terminal lying on
   the ground when that is inside the map;
   `browser: at a low mast the curvature row says what the earth is hiding`.
