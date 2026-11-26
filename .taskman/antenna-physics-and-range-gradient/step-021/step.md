# step-021: GUIDELINES updated, `npm run verify` green, closing measurements

## How to perform this step

1. `GUIDELINES.md` §4: add `ANTENNA.apertureEfficiency`, `RF.gradientMaxMarginDb`,
   `RF.defaultCoverageView`, `COLOURS.gradientStops` to the list of config-owned numbers,
   and state the rule they serve: **a directional design's gain is derived from the beam it
   draws, so pattern and gain cannot disagree**.
2. §7: extend the antenna-pattern bullet with the derived-gain model; add a bullet
   **one drape, three readings** for `display.coverageView` (bands / gradient / zone, alpha
   contract unchanged, switching views may not move a decibel - pinned by a browser test);
   extend the propagation bullet with the earth (`earthBulgeM`, `radioHorizonM`, the
   endpoint-is-not-an-obstacle rule, and that shadowing-off is a *named* flat-earth mode
   rather than a silent one); update the "every percentage names its denominator" neighbour
   if the new stats fields need it.
3. Clean the process table (`node tools/browser.js status --all`,
   `node tools/staticserver.js status`), then
   `node tools/timebox.js -t 900 -- npm run verify`.
4. Record the closing measurements in the step comments: the per-design gain/beamwidth/
   budget table, the biquad-versus-Yagi reach comparison on one piece of ground, the
   curvature row's text, the per-preset table, and the whole-map sweep cost (the view mode
   must not have made the sweep slower - compare with the 16-47 ms / 133 ms figures from
   `coverage-reach`).
5. `git status --short`: only task files, source, tests and docs; `git diff --stat vendor/`
   empty. Commit and report.

## Expected result

`npm run verify` green, docs current, and a measurement table that shows a biquad can no
longer beat a Yagi and the earth cannot be forgotten.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
