# step-014: browser test: the app's own horizon number and the measured edge of coverage agree

## How to perform this step

1. Add to `tests/browser/reach.test.js`:
   `browser: the horizon the app quotes is where the coverage actually stops`. Use a low
   mast (`ANTENNA.heightLimitsM.min` rounded up a little) on the flat field, sensitivity
   pushed so the budget is comfortably beyond the horizon (so the horizon, not the budget,
   is the binding limit for the *terrain-aware* walk), and shadowing on.
2. Assert: `coverage().radioHorizonM` is finite and inside the map for those heights, the
   furthest linked point east is not beyond it, and there are linked points well inside it -
   i.e. coverage ends near the horizon rather than at the map edge or the study range.
   Compare with `budgetRangeM` and state in the assertion message which of the two is
   smaller, so a future failure says what broke.
3. Also assert the HUD's `Curvature` row exists in `scene()`/HUD data (whatever
   `reports.js` exposes) with a bulge number that matches `earthBulgeM` for the reported
   last-link distance.
4. Verify: `node tools/timebox.js -t 600 -- node tools/test.js --browser --only
   tests/browser/reach.test.js` green, no page errors.

## Expected result

The number the app prints about the earth is the number the map obeys.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
