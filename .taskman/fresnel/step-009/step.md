# step-009: HUD read-out + test API surface for the zone

## How to perform this step

1. `src/ui/hud.js`: add a `STAT_ROWS` entry for the zone, e.g. key `fresnel`,
   label "First Fresnel zone", rendering something like
   `62 % of linked cells clear` plus the worst offender (`worst 0.2 r1 at 340 m`),
   computed from the coverage stats the controller already assembles. Keep the HUD
   read-only: it formats numbers it is given (GUIDELINES.md §6).
2. `src/app/testapi.js`: expose `fresnel()` (the zone summary: criterion, clear and
   obstructed counts, obstructed-linked count, worst clearance and its distance) and
   extend `scene()`/`coverage()` info with the volume's visibility and vertex count so
   browser tests can assert on them without scraping the DOM.
3. If the controller's report module (step-007) is the natural home for the summary,
   put it there and have `testapi`/HUD both read it - one implementation, two consumers.
4. Verify: `npm run lint`; `npm run test:unit`; live:
   `window.__sim.fresnel()` reports the same numbers as the HUD line and as
   `window.__sim.coverage().stats`; toggling `display.showFresnel` changes what
   `scene()` says about the volume; zero page errors.

## Expected result

The HUD and `window.__sim` agree on the zone state, and a browser test can see whether
the volume is in the scene.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
