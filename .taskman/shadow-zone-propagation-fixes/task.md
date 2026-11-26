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
