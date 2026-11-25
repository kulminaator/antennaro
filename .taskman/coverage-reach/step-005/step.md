# step-005: coveragemesh: drape the strided grid, stop washing the whole map

## How to perform this step

1. Read `src/propagation/coveragemesh.js` in full. It currently builds one quad per
   terrain cell and paints every evaluated cell, using `NO_LINK_ALPHA` for cells below
   sensitivity. With whole-map evaluation that would varnish the entire map in "no
   link" - the opposite of informative.
2. Make the drape follow the coverage grid: one quad per `coverage.stride` terrain
   cells, vertices sampled from the terrain field at those positions, sized from
   `coverage.size`/`coverage.stride` rather than `sourceField.size`. Keep the
   "coverage is a decoration above the terrain, not geometry of its own" rule: same
   `coverageOffsetM`, no new shader.
3. Painting rules, in this order:
   - `budgetExcluded` cells: transparent. The pre-filter already said "no link, and the
     ground was never consulted"; do not paint a guess.
   - linked cells: as today (RSSI bands, or the zone ramp in `zoneView`).
   - below sensitivity but within `RF.noLinkHaloDb` of it: the faint halo alpha, so a
     near-miss is still visible.
   - weaker than that: transparent, the terrain speaks for itself.
   Say in a comment why the halo exists (it is the difference between "the map ends" and
   "the link ends") and why the rest is blank.
4. Verify:
   - `npm run lint`.
   - Live, timeboxed (server backgrounded, browser stopped afterwards): with the mast on
     the west side and a Yagi aimed east across the map, take
     `.tmp/reach-drape.png` at the default study range and at 1400 m. In the first
     picture the painted area must end in terrain, not in a straight arc at the map
     edge; in the second the arc is still there (it is a real limit now) - which step-008
     will mark with a ring.
   - Also check `pixelStats()` distinct colours before/after the `zoneView` toggle is
     still reversible, as the Fresnel work established.

## Expected result

The painted region is the link's own footprint on a 30 m drape, with a small honest halo
around it and nothing else.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Implemented in `src/propagation/coveragemesh.js`: three alphas, each with a meaning -
  `1` linked, `RF.noLinkAlpha` (0.22) walked-but-beaten-by-terrain, `0` never asked
  (outside the study area, or `budgetExcluded`). The pre-filtered points are excluded
  before the band lookup, which also removed a latent lie: their clearance is stored
  capped at 100 r1, so the zone view would have painted the whole far map "clear".
- Dropped `RF.noLinkHaloDb` (added in step-001, never used). The plan asked for a halo
  *distance*; it turns out not to need one. The pre-filter's test is the free-space
  bound, so the points that get walked and still miss the budget are exactly the points
  the terrain defeated. The halo is a property of the method, not a number to type in,
  and a knob for it would have invited someone to widen a rim that means "the ground
  stopped this link". `RF.noLinkAlpha` replaces it.
- Legend (`coverageLegendItems`) now describes the pixels actually drawn, and the last
  band's count is the *painted* ones (`levelCounts[last] - budgetExcludedCells`) with
  `alpha` per row so the swatch is as faint as the drape; a further row names the bare
  area. Measured, centre, collinear, 10 dBm:
  `2 + 51 + 1898` solid, `7208` faint, `21465` not painted - and the row counts sum to
  30 624, the whole grid minus the one skipped near-field point. `painted-by-rules`
  computed independently from the arrays equals `walked` exactly: 9159.
- Visual check (`/project/.tmp/artifacts/halo-*.png`, live browser):
  - default dipole: budget 937 m, max linked 936 m, `limiting budget`.
  - Yagi at (-2100, 0) aimed east: the drape is a ragged, terrain-shaped hand with the
    far ridge in shadow; no circular cut anywhere. 459 linked, 1797 faint, `budget`.
  - same Yagi at 27 dBm: coverage crosses the whole map, 3385 linked, 14 658 faint,
    5310 bare, `limiting map-edge` - which is the case step-009 must name in the HUD.
- Also fixed in passing: `hud.js` legend swatches now honour `item.alpha` (they were
  full-strength regardless, which would have made the rim's colour a lie).
