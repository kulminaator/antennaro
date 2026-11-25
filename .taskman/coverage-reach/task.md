# Task: coverage-reach

## Description

The coverage map currently draws **the study range, not the link**. Reproduced from
the user's two screenshots (mast at 835 m E / 560 m N, 868 MHz, 10 dBm, sensitivity
−80 dBm, evaluation range 1400 m): the drape ends in a clean arc, `Max linked range
1399 m @ 166 deg` - i.e. the outermost linked cell sits 1 m inside the evaluation
cap - while the free-space range is 2.20 km for the 7-element Yagi and 1.67 km for the
collinear. Both designs are cut to the same 1400 m circle, which is exactly why they
look identical: the user reads a fake antenna limit where the app drew its own
work-area boundary, and the map edge at 1200 m from the centre does the same thing in
the cardinal directions.

So the promise of this task: **the edge of the painted coverage is the link's own
maximum, or the app says out loud which other limit bit.** Concretely:

- The map is big enough that real links fit inside it: `WORLD.worldSize` 2400 -> 5200 m
  (terrain grid 349, so cells stay about 15 m), `ANTENNA.siteLimitsM` to about
  +/-2500 m, terrain feature amplitudes scaled with it so the landscape keeps its
  character instead of becoming a wrinkle sheet, and the camera/fog framing scaled.
- Coverage is evaluated over the **whole map**, not a disc: a hard `maxRangeM` circle
  no longer bounds the painted result by default. To keep the cost bounded, coverage
  runs on a strided grid (`WORLD.coverageStride`, about 30 m cells) and a cell whose
  free-space loss alone already breaks the budget is flagged `budgetExcluded` instead
  of walking a ray. Measured on this machine: 349^2 terrain 63 ms one-off, whole-map
  coverage on a 15 m grid 734 ms (unacceptable), so stride 2 plus the pre-filter has to
  land near 100-200 ms; that is the gate for step-003.
- When a limit *is* binding it is drawn and named, never mistaken for reach: a ring at
  the study radius, a HUD "Range limit" row that says which of {link budget, study
  range, map edge} binds and by how much, and `>=` marks on per-direction ranges that
  touch a boundary. Cells that are merely below sensitivity stop being painted at all
  beyond a small halo (`RF.noLinkHaloDb`), so no faint wash pretends to be a map.
- Fresnel statistics get an honest denominator: percentages of **linked** cells, since
  with whole-map evaluation "of everything on the map" would be meaningless.
- Presets, sliders, URL parameters, tests, README and GUIDELINES follow the new world;
  every quoted number is re-measured; `npm run verify` green.

Constraints: zero dependencies; pure core runs in bare Node; `three` stays behind L4
adapters; tunables in `src/config.js`; UI dispatches patches; browser tests drive
`window.__sim`; `src/` files under 350 lines (`controller.js` 295, `coverage.js` is the
file most at risk - split it rather than squeeze it); `npm run lint`, unit and browser
suites green at every step boundary.

## Steps

1. step-001 — config: a 5200 m world, a strided coverage grid, whole-map study range, limit colours
2. step-002 — terrain: rescale the landscape so a 5.2 km map still has mountains in it
3. step-003 — coverage: strided evaluation plus a free-space budget pre-filter
4. step-004 — coverage stats: honest denominators and the binding-limit report
5. step-005 — coveragemesh: drape the strided grid, stop washing the whole map
6. step-006 — unit tests: the pre-filter cannot change the answer
7. step-007 — unit tests: the geography tests survive the bigger map
8. step-008 — the study-range ring (L4 adapter + wiring)
9. step-009 — HUD: name the binding limit, mark clipped directions
10. step-010 — presets, sliders and URL parameters for the bigger world
11. step-011 — browser tests: the edge of the drape is the link, not the cap
12. step-012 — browser tests: the rest of the suite survives the bigger map
13. step-013 — documentation and screenshots, every number re-measured
14. step-014 — full `npm run verify` and closing commit

## Comments

- Execution note from step-001: `evaluatedCells` with whole-map evaluation is 121 800
  on the 349^2 grid, so every "cells with link / % clear" denominator in the HUD and the
  docs is a different quantity than before - it must be re-expressed (linked cells as a
  count, zone percentages of linked cells), not just re-measured.
- Closed by step-014. `npm run verify` green (17 test files, 48.5 s). The measurement that
  the task was opened for: five designs on the same ground now report last-link distances
  of 932, 1664, 1393, 2169 and 3035 m against free-space budgets of 937, 1670, 1563, 2204
  and 3049 m - each ending at its own link, none clipped by the study range or the map,
  and the live app agreeing with Node cell for cell. The old complaint (everything cut to
  the same 1400 m circle) is impossible now: the study range defaults to the whole 5.2 km
  map, a range that cannot bind draws no ring, and the one configuration that does run off
  a limit (43 dBm, -124 dBm, whole map linked) reports `limitingFactor: map-edge` and says
  what the link would have reached.
