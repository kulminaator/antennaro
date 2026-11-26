# step-018: presets and the Fresnel browser test move to the new mode field

## How to perform this step

1. `src/app/presets.js`: give each preset an explicit `display.coverageView` (the Fresnel
   demo scenario stays `zone`, everything else is `gradient`), and check every preset's
   `description` still matches the colours it now loads.
2. `tests/browser/fresnel.test.js` (198 lines) patches `display: { showFresnel: true }` to
   get the zone colours; make it patch the view for the colour assertions and the volume
   flag for the tube assertions, so each assertion tests the thing it names. Keep the
   existing invariant (RSSI and obstruction dB do not move when the *view* changes) and add
   to it: switching between all three views must leave `coverage().stats` identical - the
   view is presentation, not physics.
3. Verify: `node tools/timebox.js -t 800 -- node tools/test.js --browser` fully green
   (this is the step that could break other browser tests - fix causes, do not relax
   assertions), then `npm run test:unit`.

## Expected result

The whole browser suite agrees with the new mode field, and one assertion now proves the
view cannot change a decibel.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- **Deliberate deviation from the step text:** presets were *not* given an explicit
  `display.coverageView`. `src/main.js` applies `?preset=` *after* the boot state, so a
  preset carrying a view would silently overrule `?view=` and `?fresnel=1` - and
  `?preset=valley-reach&fresnel=1` is exactly the documented way the Fresnel picture in
  `docs/` was taken. The plan's "the Fresnel demo scenario stays `zone`" also has no subject:
  none of the five presets is a Fresnel scenario. A scenario is ground, antenna and aim; the
  view is the reader's. `src/app/presets.js` now says so in its header, and
  `tests/unit/display.test.js` fails if any preset grows a `display` block or if applying one
  moves `state.display` at all.
- Preset descriptions re-read against the gradient: all five are colour-neutral and still
  true ("the served ring sits under the mast", "the range limit is the link budget, not the
  ground", "gain helps, grazing rays do not") - none needed a word changed.
- `tests/browser/fresnel.test.js` (198 -> 238 lines): the old "the zone view repaints the
  drape" test asked `display.showFresnel` for a colour change, which is precisely the
  coupling that has now been removed - it failed for the right reason. It became
  **`browser: the coverage view repaints the drape, and no view changes a decibel`**:
  patches `gradient -> bands -> zone -> gradient`, asserts `scene().coverageView` every hop,
  that bands and zone do not paint the same map, that returning to `gradient` restores the
  frame exactly (the four readings are kept as four entries - a `Map` keyed by view would
  have made that comparison compare an object with itself), and that
  `coverage()` - the whole stats object - is `deepEqual` across all three views. A mode that
  moved a linked cell or a percentage would be a second model wearing a colour scheme.
- New **`browser: the zone volume switch no longer chooses the colours`**: in the bands view,
  turning the volume on puts the tube in the scene and leaves `scene().coverageView` on
  `bands`. Pixels are deliberately not compared here, because the tube itself is geometry
  and would move `pixelStats` for a reason that has nothing to do with the claim.
- Live composition probe (`.tmp/preset-view.js`), the combination the docs screenshot uses:
  - `?preset=valley-reach&fresnel=1` -> `design=yagi view=zone volume=true legend="Fresnel zone legend"`
  - `?preset=bumps-hills` -> `view=gradient legend="Range gradient legend"`
  - `?preset=site-sector&view=bands` -> `view=bands legend="Coverage legend"`
  - no page errors in any of them.
- `node --test tests/browser/fresnel.test.js` 7 pass; `npm run test:browser` **all 6 files,
  40 tests, 0 failures**; `npm run test:unit` all 15 files pass; `npm run lint` ok.
