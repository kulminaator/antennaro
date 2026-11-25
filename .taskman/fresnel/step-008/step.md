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
