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
