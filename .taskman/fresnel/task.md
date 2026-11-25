# Task: fresnel

## Description

Surface the first Fresnel zone. Today `fresnelRadiusM()` in `src/propagation/rf.js`
is exported, tested - and used by nothing. The loss model is a Kirchhoff/Lee
single-edge diffraction (`los.js`), which is already Fresnel-parameterised, so the
decibels are not wrong and must not be padded with a second, double-counting term.
What the user cannot see or get told is the thing they actually ask about: *is the
first Fresnel zone clear?* A path that geometrically grazes a ridge reports a clean
link even when the zone is buried in it.

Finished means:

- The ray profile reports the first-zone clearance along the path: the radius r1 at
  each sample and the clearance in units of r1, plus the worst (minimum) clearance
  and where it happens.
- Coverage carries, per evaluated cell, whether the first Fresnel zone meets the
  clearance criterion (`RF.fresnelClearFraction`, the conventional 60 % of the first
  zone) and the worst clearance ratio. Loss stays the existing diffraction loss.
- Cells whose zone is obstructed are painted in their own colour (a linked cell with
  a buried zone must not look identical to a clean one), with a legend row.
- A display toggle shows a semi-transparent first-Fresnel-zone volume of the
  antenna: the ellipsoid of revolution of the reference link (phase centre to the
  study-range limit along the aim), which updates with frequency, aim, site and range.
- The HUD reports the zone state; `window.__sim` exposes it; README and GUIDELINES
  say what is modelled and what is a flag rather than a loss; `npm run verify` green.

Constraints that shape every step: zero dependencies; the pure core keeps running in
bare Node; `three` stays behind L4 `*mesh.js` adapters; new user fields go through
`STATE_FIELDS` + the panel schema; new tunables into `src/config.js`; new modules
into `LAYER_TABLE` (note `/mesh\.js$/` is already L4 and THREE-allowed); `src/`
files stay under 350 lines - **`src/app/controller.js` is at 349/350, so it must be
split before anything new is wired into it**.

## Steps

1. step-001 — config + palette: the clearance criterion, the obstructed colour, the volume knobs
2. step-002 — los.js: the ray profile reports first-zone clearance
3. step-003 — coverage.js: per-cell Fresnel flag, clearance ratio and stats
4. step-004 — unit tests: first-zone clearance maths and the buried-zone case
5. step-005 — overlay colouring + legend: linked but zone-obstructed
6. step-006 — `src/app/fresnelmesh.js`: the semi-transparent zone volume
7. step-007 — split the controller: carve out the coverage/RF seam (no behaviour change)
8. step-008 — `display.showFresnel`: state field, slider row, controller wiring
9. step-009 — HUD read-out + test API surface for the zone
10. step-010 — browser tests: toggle, colouring, and obstruction where it belongs
11. step-011 — documentation + full `npm run verify` + closing commit

*(Step statuses are tracked only in each `step-NNN/status` file, never here.)*

## Comments

<!-- Globally important findings discovered during execution are appended here
     as bullet points. This section starts empty and is append-only. -->

- `GUIDELINES.md` §4 lists config blocks that `src/config.js` does not export
  (`RENDER.*`, `COVERAGE.*`, `ANALYSIS.*`, `UI.*`). Anything written against that
  prose lands in the wrong place; the real exports are `APP, WORLD, TERRAIN, RF,
  ANTENNA, VIEW, TIMEOUTS, PATHS, COLOURS` (+ `FRESNEL` from step-001). Corrected in
  step-011.

- **The textbook 60 %-of-r1 criterion is degenerate against a ground-level
  receiver**, so it cannot be painted over the default coverage map as the task
  description assumed. The zone radius collapses to 0 at the receiver, so the flat
  earth is always inside the zone: the Fresnel radio horizon `d = 2.2*(h1+h2)/lambda`
  for a 10 m mast is 32 m at 433 MHz and 89 m at 868 MHz even *with* a 4 m receiver,
  426–596 m at 5.8 GHz. Painting "not zone-clear" in the RSSI overlay would colour
  95 %+ of the map one hue and read as a bug.
  Two consequences, both implemented: (a) clearance is judged for a link to a
  receiver at a stated height (`RF.fresnelRxHeightM`, default 4 m, documented
  everywhere it appears, because the answer depends on it) and excludes a guard
  neighbourhood of each end (`RF.fresnelEndpointGuard`); (b) the zone gets **its own
  colour view**, switched on by the same `display.showFresnel` toggle that shows the
  volume - the RSSI overlay keeps its colours when the toggle is off.
- Do not add a "Fresnel loss" term: the dB already come from the Kirchhoff/Lee
  parameter `v = sqrt(2) * h / r1`. A second penalty for the same ground is double
  counting; the criterion is a reliability flag next to the dB.
