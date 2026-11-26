# Task: antenna-physics-and-range-gradient

## Description

Three user-reported problems, in the order the user gave them.

**1. "It seems that biquad is beating the hell out of a Yagi in both range and beam
width. Physically this sounds impossible."** It is impossible, and the app is claiming
it. Measured from the catalogue (`.tmp/antenna-audit.mjs`, step-001): the biquad claims
**12.40 dBi at 69° x 69°**, while those beamwidths imply at most **9.38 dBi** of
directivity (Kraus, `D = 41253/(theta_H theta_V)`) - it is **3.0 dB over its own physical
limit** at defaults and **5.9 dB over** at max parameters. The Yagi sits 2-4 dB *under*
its limit, so the two errors point at each other: the biquad is inflated and the Yagi is
pessimistic, and the result is exactly what the user saw. Fix: for the three directional
designs the gain is *derived from the beam it draws* -
`gain = 10*log10(eta * 41253/(theta_H*theta_V))` with a per-design aperture efficiency in
config (Yagi 0.55, biquad 0.75, patch 0.55, which puts the biquad at ~8.1 dBi - the
published figure for a 2-turn biquad with a plate reflector - and leaves the Yagi close to
where it is). Then a wide beam cannot claim high gain ever again, and the ordering
test ("a Yagi beats a biquad in gain and in reach, and is narrower in both planes") is a
unit and browser test, not a hope.

**2. "It would be helpful for the users to see range in gradients - yellow for strong
range, light yellow for weaker, pink for very weak range."** Add a third coverage view: a
**continuous range gradient** keyed to link margin over receiver sensitivity, saturated
yellow at `RF.gradientMaxMarginDb` and running through light yellow to pink at the limit,
with the two existing meanings untouched (faint wash = asked and lost, bare = never
measured). The three ways of painting one drape become a single mutually exclusive
`display.coverageView` select (`bands | gradient | zone`, default `gradient`) instead of
two booleans that can contradict each other; `display.showFresnel` goes back to being only
the zone *volume*.

**3. "Our earth should have a very small curvature even for the valley."** The bulge
*is* in the ray maths (`d1*d2/(2 k R)` in `rayProfile`) but nothing about it is visible or
tested, and while measuring it two real defects showed up: **(a)** `rayProfile` excludes
the transmitter end from `excess` but not the receiver end, contradicting its own comment
- so the receiver's own float dust (`from.y + dy` is not exactly `to.y`) can make a
perfectly clear path read as obstructed, e.g. `hasLineOfSight` returns false at every
distance for a 0.5 m/0.1 m pair over a flat plain where the textbook horizon is 4.3 km;
**(b)** the flat-ground radio horizon that follows from curvature
(`sqrt(2 k R) (sqrt(h1) + sqrt(h2))`) is computed nowhere, so the app never tells the user
why a low mast dies in an apparently empty valley. Fix both, and make the curvature
something the user can see: a HUD row naming k, the bulge actually under the longest link,
and the flat-ground horizon for this mast and terminal height.

Finished means: `npm run verify` green; no design anywhere in the parameter space claims
more gain than its beamwidths allow; the coverage can be read as a gradient; the earth is
round in every walk and says so in the read-out; README and GUIDELINES rewritten with
numbers re-measured from the running app.

## Steps

1. step-001 — record the physics audit: claimed gain against beamwidth-implied directivity, all designs, all corners
2. step-002 — failing tests first: `tests/unit/antennaphysics.test.js` (Kraus bound, Yagi-vs-biquad ordering, monotonicity)
3. step-003 — `pattern.js`: `krausDirectivityDbi()` and its own unit test
4. step-004 — `config.js`: per-design aperture efficiencies, documented
5. step-005 — `catalogue.js`: directional gain derived from the beam the design draws; green the new tests
6. step-006 — re-audit and confirm the ordering; refresh the recorded table
7. step-007 — `presets.js`: retune so every preset still ends at its own link
8. step-008 — browser test: the Yagi out-reachs the biquad on the same ground, and reach follows budget
9. step-009 — `los.js`: the ray's own receiver end is not an obstacle; pin it with tests
10. step-010 — `rf.js`: `earthBulgeM()` and `radioHorizonM()`, used by `los.js`, tested against the textbook
11. step-011 — coverage stats carry the bulge under the longest link and the flat-ground horizon
12. step-012 — HUD: a `Curvature` row that names k, the bulge and the horizon
13. step-013 — name what "terrain shadowing off" really means, and prove the zone walk still bows
14. step-014 — browser test: the app's own horizon number and the measured edge of coverage agree
15. step-015 — `config.js` + `palette.js`: the range gradient ramp and legend, with `tests/unit/palette.test.js`
16. step-016 — `display.coverageView` select: fields, state default, URL parameters
17. step-017 — paint the three views from one mode: drape, controller, HUD legend, `scene()`
18. step-018 — presets and the Fresnel browser test move to the new mode field
19. step-019 — README rewritten: gains and beamwidths, the three coverage views, the round earth
20. step-020 — screenshots regenerated and read back
21. step-021 — GUIDELINES updated, `npm run verify` green, closing measurements

*(Step statuses are tracked only in each `step-NNN/status` file, never here.)*

## Comments

<!-- Globally important findings discovered during execution are appended here
     as bullet points. This section starts empty and is append-only. -->

- **Antenna gains were not reconciled with beamwidths** (step-001 audit, fixed in
  step-005): the biquad claimed 12.40 dBi from a 69 x 69 degree beam, whose Kraus ceiling
  is 9.38 dBi, while the Yagi sat 2-4 dB *under* what its narrower beam implies. Directional
  gain is now `krausDirectivityDbi(H, V) + 10*log10(ANTENNA.apertureEfficiency[id])`, with
  `beamwidths(params)` shared by the pattern and the gain, so the lobe and the link budget
  are one decision. The omni designs keep an array-factor gain - Kraus has no 360 degree
  plane - and that split is now written down in `GUIDELINES.md §7` so nobody "unifies" it.
- **`limitingFactor` answers "what ended the sweep", not "what ended my coverage"**
  (discovered in step-008, not fixed here): a biquad at the map centre reports
  `Range limit | the link: budget 1.86 km, last link 0.90 km`, where the thing that ended
  the coverage was 900 m of rising ground. `describeLimits()` only inspects cells clipped by
  study range or map edge, so a ground-limited picture still says "the link". A fourth kind
  (`ground`) plus a decision about what that row is for is a step of its own - raising it
  with the user rather than smuggling it into a curvature step.
- **Curvature at 5.2 km is worth 0.19 m, not a story** (measured in step-010): the bulge is
  `d1*d2/(2kR)` = 0.014 m at 1 km, 0.19 m centre-to-corner, 0.75 m on the 7.35 km diagonal;
  `radioHorizonM` is 19.4 km for 10 m/2 m and 11.5 km even for 0.5 m/4 m, against a 5.2 km
  map. So no configuration of this app can have its coverage ended by the radio horizon, and
  step-014's premise ("horizon inside the map") is refuted by the maths it asked us to test.
  The honest deliverable for the user's "make the curvature relevant even in the valley" is
  the app *saying* how much curvature is worth on the link being looked at - and saying that
  here it is centimetres, so the ridge is what is hiding the signal, not the planet.

## Closing notes

- **Curvature never binds here, and `radioHorizonM` is quoted at the terminal height you
  set** (sharpened in step-019): `radioHorizonM(0.5, 0)` is 3.0 km, which *is* inside a
  5.2 km map, so "the horizon is always off the map" is only true of the horizon the app
  quotes (its receiver is 4 m up by default, 11.5 km even at a 0.5 m mast). The claim that
  survives measurement is the model-level one - a flat plane, the lowest mast and an absurd
  budget still links every point of the map and ends `map-edge` - and that is what
  `tests/unit/curvature.test.js` pins, so the HUD cannot start implying the planet ended
  somebody's coverage.
- **`gradientMaxMarginDb: 45` was wrong and the fix was a measurement** (step-017): margin
  falls 20 dB per decade of distance, so the linked disc spans 0-28 dB (default dipole),
  0-55 (flat-field) or 18-112 (loudest link); at 45 dB almost every map came out pink. 30 dB
  is a decade and a half inside the link's own edge, absolute, never normalised per picture.
  The legend rows moved to thirds of the ramp for the same reason: sampling the ramp at RSSI
  band boundaries with a lower top gave two rows in one colour.
- **Presets carry no `display` block, deliberately** (step-018): `?preset=` is applied after
  the boot state, so a preset that chose a view would silently overrule `?view=` and
  `?fresnel=1` - the exact combination the docs screenshot is taken from.
- Closed by step-021. `npm run verify` green (vendor ok, lint ok on 43 src / 15 tools /
  23 tests files, **22 test files** in 56.8 s). What the task was opened for: the biquad's
  12.40 dBi came from a 69 x 69 degree beam that can hold 9.4, so a wide antenna outranged a
  long Yagi; gain is now derived from the beam the design draws
  (`krausDirectivityDbi(H, V) + 10*log10(efficiency)`), and the five designs reach 932 /
  1393 / 1664 / 1696 / 2167 m in gain order, live, each at its own budget. The user's
  "yellow for strong, light yellow for weaker, pink at the limit" is one of three values of
  `display.coverageView` - bands, gradient, zone - painted from one field, each with a legend
  that counts exactly the pixels it describes (6 / 56 / 782 / 1984 faint / 27 796 unmeasured
  on the default map), and switching between them moves not one decibel. The curvature is
  reported instead of dramatised: `k 1.41 - the ray bows 0.012 m over the last 0.93 km link`.
