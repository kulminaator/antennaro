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
