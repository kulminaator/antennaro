# step-012: browser tests: the rest of the suite survives the bigger map

## How to perform this step

1. Run the whole browser suite: `node tools/browser.js stop --all` first (orphans look
   exactly like hangs), then
   `node tools/timebox.js -t 800 -- node tools/test.js --browser`.
2. Fix the fallout in `tests/browser/relocate.test.js`, `fresnel.test.js`,
   `interaction.test.js`, `app-boot.test.js` and `coverage.test.js` if it exists. The
   usual causes after a world resize: absolute probe points that are now mid-map rather
   than at a feature, "the mast is not on the ground" tolerances that assume 15 m cells
   while the coverage grid is now 30 m, Fresnel probes at distances chosen for the old
   map, and pixel-count thresholds measured on a differently-framed scene.
   Re-express probes through config (`WORLD.worldSize`, `field.half` from
   `terrain()`, `ANTENNA.siteLimitsM`) so the next resize is cheap. Keep the intent of
   every test - especially the relocation ones (moving the mast must not move the
   ground) and the Fresnel ones (zone verdict moves, decibels do not).
3. If a test needs a *long* link now, prefer moving the mast toward a corner over
   inflating the study range: the point of the new world is that reach is visible.
4. Verify: the full browser suite green, `node tools/browser.js status --all` clean at
   the end, `npm run lint` still green.

## Expected result

Every browser test passes on the 5.2 km map for the same reason it passed before.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Full browser suite on the 5.2 km map: three tests needed re-expression, all for the same
  underlying reason - the landforms grew with the map, so probe points and sector claims
  written against the old ground stopped referring to the features they were about. None
  of the intents were weakened.
- `interaction.test.js` *a taller mast buys clearance*: due west of the map centre the
  bump field now rises to 87-100 m within a few hundred metres, so the W sector links
  **nothing** at any mast height (measured: W max range 0 m at 2, 10, 20, 30 and 40 m).
  The claim is now made over the three westerly sectors together (0 m at 2 m mast,
  1849 m at 30 m, all in SW/NW), plus a new assertion that no westerly sector ever *loses*
  reach when the mast grows - which is the part that could silently rot.
- `interaction.test.js` *azimuth reaches the model, the grid and the pixels*: from the
  centre a westward beam has no reachable ground at all, so the sector comparison was
  comparing 0 with 0. The mast now goes to `ANTENNA.siteLimitsM.max * 0.6` (1500 m east),
  where both compass directions have ground to serve, and the two sample points are placed
  at `siteX +/- 700` so they are equidistant by construction. Measured swing effect: W
  sector 22 linked cells aimed east against 825 aimed west, E sector 25 against 577.
- `fresnel.test.js` *the zone is cut where the ground says so*: the old probe set assumed
  "flat ground = clear zone, mountain = cut". On this map that is backwards, and the
  physics is the interesting part - a receiver a few metres above a field that runs to the
  horizon has its first zone in the dirt everywhere (east 200 m: -76.9 dBm, a strong link,
  clearance -0.10 r1), while a receiver standing high on the flank keeps its zone open
  (north 700 m, ground at 328 m: +5.19 r1). Probes are now fractions of the map half-extent
  (0.08 east, -0.27 north, -0.15 west) since the landforms scale with the map; the
  sensitivity is pinned to -124 dBm so the probes are about the ground and not about the
  budget; every probe asserts `budgetExcluded === false` so a probe that drifts out of the
  walked set fails instead of quietly reading a sentinel. The "two measures are not the
  same measure" case got sharper rather than softer: the northern ridge sample is asserted
  to cost more than 6 dB *and* keep its zone flag true.
- `fresnel.test.js` *the zone report agrees with the grid*: the buckets no longer partition
  the study area, they partition the **walked** ground - points the budget dismissed carry
  no zone verdict (step-005). `__sim.fresnel()` now says so itself: it carries
  `walkedCells` and `denominatorCells` next to `evaluatedCells`, and the test asserts
  buckets === walked === coverage's walked, that some cells are excluded, that buckets are
  fewer than evaluated, and that the clear share's denominator is the linked set.
- `tests/browser/relocate.test.js`, `app-boot.test.js` and the remaining reach tests needed
  nothing: the relocation ones already compare the ground before and after a move (which is
  the point: moving the mast must not move the ground), and the boot ones do not probe
  geography.
- Observation, not fixed here: the receiver-sensitivity slider bounds (-124 .. -70) live in
  `src/app/fields.js` while the other radio limits live in `src/config.js`. The seed bounds
  moved to config in step-010; the sensitivity bounds deserve the same treatment in a step
  that is about configuration rather than test fallout.
- Verified: `node tools/timebox.js -t 800 -- node tools/test.js --browser` - 5/5 files,
  40 browser tests, 47 s. `npm run lint` ok, `npm run test:unit` all 12 files pass,
  `node tools/browser.js status --all` clean afterwards.
