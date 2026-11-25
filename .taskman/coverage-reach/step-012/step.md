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
