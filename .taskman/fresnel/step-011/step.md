# step-011: documentation + full `npm run verify` + closing commit

## How to perform this step

1. `README.md`:
   - **What the numbers mean**: state that the loss model is single-edge diffraction
     over the sampled ground profile, and that a *link* needs the budget while a
     *reliable* link also needs the first Fresnel zone clear (60 % of r1 by
     convention) - the app now says which cells have the budget but not the zone.
   - **Coverage legend**: document the obstructed-zone colour as a marker, not a level.
   - **Controls**: the new Display toggle in the group row.
   - **Move the camera / what you see**: the semi-transparent zone volume, and that it
     is drawn for a reference link to the edge of the study range (the biggest zone the
     antenna has to keep clear), so it moves with aim, tilt, height, frequency, range
     and site.
   - Be honest about what is *not* modelled (the existing "deliberately left out"
     list): multi-path/multipoint diffraction, reflections, vegetation.
   - Regenerate `docs/screenshot.png` if the default view now reads better with the
     legend row; regenerate `docs/screenshot-valley.png` with the volume on if that is
     the better illustration (update the caption to match the picture).
2. `GUIDELINES.md`:
   - §3 layer table: `fresnelmesh.js` (L4) and the module carved out of the controller
     (step-007) in the right rows; `los.js` gains "first-zone clearance" wording.
   - §4 config: `RF.fresnelClearFraction`, `RENDER.fresnel*`, `COLOURS.fresnel*`.
   - §7 domain notes: the criterion is a *flag*, the loss stays Kirchhoff/Lee, and why
     (double counting) - with the `v = sqrt(2) * h / r1` relationship written once.
   - §9: add `fresnel()` and the new `scene()` keys to the `window.__sim` list.
   - §3 line budget: record where the controller was split and what room is left.
3. Re-read both files against the code: no claim that is not true of the code (e.g. do
   not claim the zone volume is per-cell, or that obstructed cells are excluded from
   the coverage statistics - they are not).
4. `node tools/browser.js status --all` / `node tools/staticserver.js status` clean,
   then `node tools/timebox.js -t 800 -- npm run verify`; fix causes, not assertions.
5. `git status --short` should show only the modules this task touched plus
   `.taskman/fresnel/**`; `vendor/` untouched. Commit the lot.

## Expected result

Docs explain the criterion and the visuals in the same voice as the rest of the repo,
`npm run verify` is green, the tree is clean and the feature is committed.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
