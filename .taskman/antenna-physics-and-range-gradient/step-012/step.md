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
