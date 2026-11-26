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
