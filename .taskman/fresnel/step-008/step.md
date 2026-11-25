# step-008: `display.showFresnel`: state field, slider row, controller wiring

## How to perform this step

1. `src/app/fields.js`: a `kind: 'toggle'` field
   `display.showFresnel`, label "Fresnel zone", group `display`, impact `display`
   (the same impact `display.showPattern` uses - check `src/app/state.js` for how the
   display group is declared and mirrored).
2. `src/app/state.js`: default `false` next to the other display flags so `reset-all`
   clears it. `src/ui/schema.js`: add it to the Display group widgets.
   `src/main.js`: if the URL plumbing enumerates display flags, add it there too
   (grep `show` in `src/main.js` and follow the existing pattern; do not invent a new
   parameter style).
3. Controller: create the volume once (step-006's factory), update it whenever the
   antenna/site/frequency/range change (the same stage that updates the rig), and set
   `visible` from `state.display.showFresnel` in the display stage - the same way
   `showPattern` gates the lobe. Reference target: the aim direction at
   `state.maxRangeM` from the site, at the phase centre height (document that choice
   in the code comment: the far end of the study range is the largest zone the
   antenna has to keep clear).
4. Verify: `npm run lint`; `npm run test:unit` (the completeness invariant - every
   `STATE_FIELDS` key has a widget - must be green, which also proves the schema row
   landed); live: `window.__sim.patch({ display: { showFresnel: true } })` then
   `settle()` and screenshot: the volume appears; patch false: it disappears. Also
   check `?preset=valley-reach` (tilted beam) so the volume visibly tilts with it.
5. Take a screenshot for the README (`.tmp/artifacts/` for now; docs/ is step-011).

## Expected result

A Display toggle shows and hides the semi-transparent first-Fresnel-zone volume, and it
rides the aim, height, frequency, range and site position like every other antenna
object.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Wiring lives in `reports.js`, not the controller: `fresnelLink()` walks the boresight
  in `FRESNEL.groundSearchStepM` steps until the ray reaches the ground and puts the
  far end one receiver-height above it (or at `maxRangeM` if the beam never lands, e.g.
  uptilt). That is the biggest zone the antenna has to keep clear, and it is the same
  link the per-cell criterion uses, so the volume and the map cannot disagree.
- The volume is rebuilt in `onCoverage`, the same callback that repaints the drape:
  every input that moves the zone (site, aim, tilt, height, frequency, range, receiver
  assumption) already dirties coverage, so there is nothing else to track.
- The zone *shares* the coverage drape instead of adding a second one, so
  `applyVisibility()` keeps a `lastZoneView` flag and repaints the drape when the mode
  flips - a display-only change does not recompute 25k cells.
- `?fresnel=1` was added to the URL parameters (next to `siteX`/`range`/...), because
  `tools/browser.js shot --url` can only shoot a freshly loaded page: without a URL
  switch there is no way to screenshot a toggle from the CLI. `createInitialState` runs
  `applyPatch`, so `{ display: { showFresnel: true } }` merges instead of wiping the
  other display flags.
- Live, default map: `distinctColours` 51 (RSSI view) -> 82 (zone view) -> 51, and the
  third pixel histogram is *identical* to the first, so the mode switch is reversible
  and does not drift. Zone stats: 24.96 % of evaluated cells clear, 1018 of 5816 linked
  cells have the zone cut, worst clearance -21.6 r1.
- Screenshots `.tmp/artifacts/fz-*.png`: the omni at the centre shows a stubby lens
  (the boresight hits rising ground a couple of hundred metres out), the `valley-reach`
  yagi shows a long slim lens. Orientation is asserted numerically in step-010, not by
  squinting at a picture.
- Seen and to fix in step-009: the legend still lists dBm bands while the drape is
  painted in zone colours, and the HUD has no zone row. A legend that does not describe
  the pixels below it is a bug.
