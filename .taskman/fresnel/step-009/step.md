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

- `window.__sim.fresnel()` and the HUD row read the same stats object; verified live:
  `clearCells + partialCells + cutCells === evaluatedCells`, `f.clearCells ===
  coverage().fresnelClearCells`, HUD text
  `25.0 % clear - 1018 linked with the zone cut - worst -21.6 r1 @ 627 m`.
- Coverage stats gained `fresnelPartialCells` / `fresnelCutCells` (the three buckets the
  ramp paints) so the legend can print counts, and `fresnelZoneLegendItems(stats)` now
  prints the receiver height **from the stats**, not from config - the slider can move
  it, and a legend that quotes the default while the grid used something else lies.
- `rssiAt(x, z)` also returns `fresnelClearanceRatio` / `fresnelClear`, so a browser
  test can ask one cell instead of the aggregate.
- Orientation of the volume, asserted numerically rather than by eye: azimuth 180 /
  tilt -6 from a site at ground y=1 puts the far end at dz=+358 (south is +z), dy=-34
  (descending); azimuth 0 / tilt +6 gives dz=-80, dy=+12. Ground contact is searched
  with `rayY - rxHeight <= ground`, i.e. the link ends where the *receiver* would touch
  the ground, which is why an omni at the centre draws a short 60 m lens - its
  boresight runs into the north-facing slope almost immediately.
- `volume: {visible, vertices}` from the controller: 1421 vertices = (steps+1)*(rings+1)
  = 49*29, identical across toggles, `visible` follows the flag.
- Two bugs the unit suite cannot see, both caught by browser checks:
  - `new THREE.MeshBasicMaterial({ colour })` - three.js spells material properties
    `color`; it warned once and the boot test fails on any console warning. The app's
    own `COLOURS` spelling does not transfer to library options.
  - turning `let legendList = null` into an eager `const` left the later assignment in
    place: a TypeError at HUD construction, so the page never booted, and only the
    browser showed it. Grep for assignments when tightening a declaration.
- Also: with a stale browser still rendering in the background, boot took >25 s and the
  eval probes timed out. `browser.js stop --all` before timing anything.
