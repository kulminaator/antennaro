# step-013: re-measure the five presets and the default scene

## How to perform this step

Every number the documentation quotes came from the model, so every one is now suspect.
Measure, do not adjust.

1. Extend or reuse `.tmp/readme-numbers.mjs` to print, per preset: linked cells, last
   linked range, budget range, `limitingFactor`, zone-clear percentage, and the band and
   gradient legend counts; and for the default configuration: linked cells, evaluated
   cells, both percentages, the curvature facts (`kFactor`, `earthBulgeUnderMaxLinkM`,
   `radioHorizonM`, `worldSizeM`), median/best/worst RSSI, and the HUD's own range-limit
   and curvature lines.
2. Re-measure the README claims in "What the numbers mean" and "The earth is round" that
   quote per-design free-space ranges and the ground-limited reaches. Free-space cannot
   move (no change to the budget maths in `rf.js`); the ground-limited ones can.
3. If a preset now breaks `coverage: no preset is cut off by our own limits`, retune it
   (height or sensitivity) the way the coverage-reach task did, and note old and new
   values.
4. Append every measured number to this step's comments, and those README/GUIDELINES will
   quote to `task.md`'s comments.

## Expected result

The table of numbers steps 014-016 copy, plus a recorded decision for any preset that
needed retuning.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
