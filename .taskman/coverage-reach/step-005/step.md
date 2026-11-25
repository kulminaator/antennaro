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
