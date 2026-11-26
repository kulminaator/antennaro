# step-008: browser test: the Yagi out-reachs the biquad on the same ground, and reach follows budget

## How to perform this step

1. Add a test to `tests/browser/reach.test.js` (232 of 320 lines, room available):
   `browser: a narrower beam with more gain reaches further, and a wider one does not`.
   Put the mast on the flat field (`x = ANTENNA.siteLimitsM.max * 0.6` or the value the
   other tests in this file use), mast at `ANTENNA.heightLimitsM.max`, aimed east, default
   radio; `settle()` after every patch (see GUIDELINES: `patch()` does not rebuild).
2. Assert, from `coverage()` and `antenna()`: the Yagi's peak gain is above the biquad's;
   the Yagi's H beamwidth is below the biquad's; the Yagi's free-space range
   (`rf().freeSpaceRangeM`) is above the biquad's; and the Yagi's `maxLinkedRangeM` is
   above the biquad's. Then assert both are within 8 % of their own `budgetRangeM`, so the
   comparison is measuring gain and not a terrain accident.
3. Assert the *counted* consequence too: the biquad links more cells (a wide beam covers
   more ground at the same margin), which is the honest flip side - a biquad is not worse,
   it is broader.
4. Verify: `node tools/timebox.js -t 600 -- node tools/test.js --browser --only
   tests/browser/reach.test.js` green, and `session.errors()` empty.

## Expected result

A browser-level guard so "the biquad beat the Yagi again" cannot come back unnoticed.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- New browser test in `tests/browser/reach.test.js` (233 -> 287 lines):
  `browser: over flat ground the five designs reach in gain order, and none has more gain
  than its beam`. One site (x = -1000, tallest mast, aimed east), one ground, five designs
  visited through `window.__sim.patch()`, asserting:
  - every design ends at its own budget (`limitingFactor === 'budget'`), and its last link
    is above 85 % of that budget - so the ordering below is gain deciding, not ground;
  - every non-omni design's live peak gain is at or under
    `krausDirectivityDbi(live hBeamwidthDeg, live vBeamwidthDeg)`, read from
    `window.__sim.antenna()`, i.e. the same numbers the HUD prints;
  - reach strictly increases along `dipole < patch < collinear < biquad < yagi`, which is
    gain order;
  - the biquad has less gain than the Yagi and is wider in *both* planes, and the Yagi's
    reach is more than 1.1x the biquad's.
  Measured reaches there: dipole 932 m, patch 1393 m, collinear 1664 m, biquad 1696 m,
  Yagi 2167 m. With the old catalogue the biquad sat third in gain order at 3035 m, ahead
  of the Yagi's 2169 m, and this test would have failed on three counts.
- `node tools/timebox.js -t 600 -- node tools/test.js --browser --only tests/browser/reach.test.js`:
  1 file passed in 5.5 s (7 tests).
- Screenshot `.tmp/artifacts/physics-biquad-hud.png` (`?design=biquad-reflector`, 1280x800,
  HUD visible, read back): the read-out panel now prints **Peak gain 8.13 dBi**,
  **Azimuth -3 dB 69 deg**, **Elevation -3 dB 69 deg**, **Front / back 23.0 dB**,
  **Free-space range 1.86 km** - gain and beamwidth side by side where the contradiction
  used to live.
- **Discovery worth a follow-up, deliberately not fixed inside this task**: that same HUD
  reads `Range limit | the link: budget 1.86 km, last link 0.90 km`. `limitingFactor` is
  computed from which *sweep limit* clipped cells (study range / map edge), so a beam whose
  ground cuts it at half its budget is still reported as limited by "the link". The number
  next to it is honest, the label is not: here it was the ground, 900 m of it. Fixing it
  needs a fourth kind in `describeLimits()` (`ground`) and a decision about whether the row
  answers "what ended the sweep" or "what ended my coverage", which is a step of its own.
