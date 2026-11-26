# step-012: HUD: a `Curvature` row that names k, the bulge and the horizon

## How to perform this step

1. In `src/ui/hud.js` add a row named `Curvature` after the `Free-space range` /
   `Range limit` rows, reading from `coverage.stats` only (the HUD formats; it must not do
   geometry): `k 1.41 - the ray bows 0.28 m over the last 2.1 km link; smooth-earth horizon
   14.6 km at these heights`.
2. When the horizon is beyond the map (`radioHorizonM > WORLD.worldSize`) say so in words
   instead of quoting a number nobody can see: `the earth curves away long before this map
   ends`. When it is *inside* the last link's distance, say that the horizon, not the
   budget, is what ends the link there.
3. Keep the sentence in a `LIMIT_SENTENCES`-style constant so the wording is testable and
   not scattered through the DOM code.
4. Live check: start the static server detached on port 8080, run a short `withApp` probe
   that reads the rendered HUD text for the default scene and for a 40 m mast, print both
   sentences, and take `.tmp/artifacts/physics-curvature.png`; assert
   `session.errors()` is empty; stop server and browser afterwards.
5. Verify: the two sentences recorded in the step comments, screenshot read back, no page
   errors.

## Expected result

A user can read, in the app, that the earth is round - and how much that roundness is
worth on the link they are looking at.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- HUD gains a `Curvature` row directly under `Range limit`, fed only by `coverage.stats`
  (`kFactor`, `earthBulgeUnderMaxLinkM`, `radioHorizonM`, `worldSizeM`) - the HUD formats, it
  does no geometry. Sentences live in a `CURVATURE_SENTENCES` constant beside
  `LIMIT_SENTENCES`, with a `shortMetres()` helper that keeps three decimals below 0.1 m
  because at this scale the number *is* the point.
- `describeEarth` had to grow one field to make the wording honest without the HUD reading
  `WORLD` (which a user can change): `worldSizeM`, taken from `field.worldSize`, so the row
  compares the horizon against the map actually drawn, not the default map.
- Four branches, chosen by which number is bigger:
  `beyondMap` (horizon beyond the map - the only one this app can currently show),
  `horizonBeyondLink` (horizon inside the map but beyond the last link), `horizonBinding`
  (horizon *inside* the last link: "the curve, not the budget, ends it"), and `noLink`.
- Live probe `.tmp/curvature-hud.js` (port 8080, `session.evaluate` on `.stat-curvature`),
  the two sentences step-012 asked for plus the two corner cases:
  - default 10 m dipole, 844 linked points:
    `k 1.41 - the ray bows 0.012 m over the last 0.94 km link; the earth curves away long
    before this map ends`
  - 24 m Yagi (screenshot): `k 1.41 - the ray bows 0.018 m over the last 1.14 km link; ...`
  - 40 m mast: identical wording, bulge 0.012 m.
  - 43 dBm / -124 dBm collinear, the loudest link the panel allows (3.68 km, `map-edge`
    limited): `k 1.41 - the ray bows 0.19 m over the last 3.68 km link; ...` - the largest
    bulge this map can produce for a working link, reached by shouting at it.
  - nothing linking (0.5 m mast, -10 dBm, 25 dB clutter, 100 m study range, -70 dBm
    receiver - all inside the panel's own bounds): `k 1.41 - nothing linked, so nothing
    curved over`, with `earthBulgeUnderMaxLinkM: 0` and `radioHorizonM: 11.5 km`.
  `session.errors()` empty throughout.
- Screenshot `.tmp/artifacts/physics-curvature.png` (`?height=24&design=yagi`, 1280x800),
  read back: the row sits between `Range limit` and `Cells with link`, and the same panel
  shows the step-005 gain (9.56 dBi, 42 x 66 deg) - the two new honesty rows in one picture.
- First attempt at the "nothing links" case patched `rxSensitivityDbm: -10`, which the
  reducer clamps to the field's own maximum of -70 dBm; the row then still quoted the old
  sentence, because the sweep was still linking. Worth remembering: the panel's bounds are
  the model's bounds, so "impossible" configurations have to be built out of legal ones.
