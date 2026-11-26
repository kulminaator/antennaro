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

- `GUIDELINES.md` §4 now lists `RF.gradientMaxMarginDb` (with the measurement that fixed it),
  `COLOURS.gradientStops`, `RF.defaultCoverageView` and `ANTENNA.apertureEfficiency` /
  `apertureEfficiencyDefault`, saying plainly that the last two *are* the gain of every
  directional design and that an efficiency above 1 would be a design with more gain than its
  beam can hold.
- §7 gained three bullets - **One drape, three readings** (mode not marking, alpha contract,
  legend follows the view, switching may not move a decibel, presets never pick a view),
  **The gradient is keyed to margin, and its scale is absolute** (dB over the receiver, never
  normalised to the screen), and **The earth is round and the app says so** (`earthBulgeM`,
  `radioHorizonM` = `Infinity` on a flat earth, the measured "never horizon-limited here"
  finding, neither-end-of-a-ray-may-be-the-obstacle, and shadowing-off as a *named* flat-earth
  mode). The stale bullet that said the drape was switched by `display.showFresnel` was
  rewritten rather than left to rot, and the reference-link sentence became its own bullet.
- Process table cleaned before the run: `browser.js status --all` and
  `staticserver.js status` both empty, and `pgrep` turned up one orphaned static server on
  port 8133 from a previous session, which was killed.
- `node tools/timebox.js -t 900 -- npm run verify`:
  `vendor ok - three 0.187.0, three.module.min.js 732 KiB, license + notice present`,
  `lint ok - 43 src, 15 tools, 23 tests file(s)`, **16 unit + 6 browser = 22 test files,
  all passed in 56.8 s**, `timebox: npm exited 0 in 59.5s`.
- Closing measurements.
  - Gains, beams and budgets (`.tmp/readme-numbers.mjs`, 10 dBm / -80 dBm / 868 MHz):
    dipole 2.15 dBi 360x78 0.94 km; collinear 7.17 360x45 1.67 km; Yagi 9.56 42x66 F/B 23.6
    2.20 km; biquad 8.13 69x69 F/B 23.0 1.86 km; patch 6.66 72x68 F/B 15.0 1.57 km.
  - Biquad can no longer beat a Yagi, on one piece of ground, over flat ground, live
    (`browser: over flat ground the five designs reach in gain order...`): 932, 1393, 1664,
    1696 and **2167 m** for dipole, patch, collinear, biquad and Yagi - each within 15 % of
    its own budget, every one `limitingFactor: budget`, and every directional peak gain at or
    under its Kraus ceiling in the same test. Before this task the same pair reported a
    biquad at 12.40 dBi outranging a 9.58 dBi Yagi.
  - Curvature row, verbatim from the live HUD: default `k 1.41 - the ray bows 0.012 m over
    the last 0.93 km link; the earth curves away long before this map ends`; loudest
    configuration `... bows 0.19 m over the last 3.68 km link ...`; nothing linked
    `k 1.41 - nothing linked, so nothing curved over`.
  - Presets (all `limitingFactor: budget`): site-sector 3838 / 3008 of 3079 m / 54 % clear;
    valley-reach 2024 / 2481 of 2502 / 99 %; flat-field 2057 / 2004 of 2018 / 91 %;
    mountain-shadow 7064 / 2044 of 2045 / 95 %; bumps-hills 517 / 1363 of 3315 / 96 %.
  - Sweep cost, against the `coverage-reach` figures. Typical, strided and pre-filtered:
    22-76 ms per design (their recorded band was 16-47 ms with the same stride, and the
    biquad-at-20-dBm case that walks 22 158 points is the one that leaves the band). Worst
    case measured head to head against a worktree at the task's own starting commit
    (`git worktree add .tmp/baseline 9f40e58`, same probe, three runs each):
    **137.5 / 141.9 / 146.7 ms at the baseline against 150.1 / 150.5 / 151.9 ms now**, on an
    identical linked set (30 624 walked, last link 3677 m in both). So about +5 %, and it is
    the ray walk - the endpoint exclusion and `worstExcess` of step-009, the `earthBulgeM`
    call of step-010 - not the view mode: the sweep never reads `coverageView`, and the only
    thing the gradient adds anywhere is a 0.93 ms legend scan that runs when the gradient
    legend is drawn (`coverageLegendItems` for comparison: 0.01 ms, it reads tallies).
    The worktree was removed after the measurement.
- `git status --short`: `GUIDELINES.md` and the task files only; `git diff --stat vendor/`
  empty.
