# step-001: config.js: four step colours, new thresholds, new zone ramp

## How to perform this step
1. In `src/config.js`, replace `RF.levelMarginsDb` with `Object.freeze([8, 3, 1, 0])` (margin
   over the receiver, strongest first - the measured spread across the presets is in `task.md`),
   rewrite its comment to say the thresholds are placed on the measured margin distribution
   (median 2.9 dB, 78-92 % of linked cells under 10 dB) and that the old 0/15/30/45 put 93-98 %
   of linked cells in one band, and add `RF.levelNames` = `['comfortable', 'good', 'marginal',
   'at the limit']` with a one-line comment.
2. Delete `RF.gradientMaxMarginDb` and change `RF.defaultCoverageView` to `'steps'`, updating the
   comment above it to `'steps'` or `'zone'`.
3. In `COLOURS`, set `levels` to `['#fff046', '#f6a600', '#d35900', '#980011']` (strongest first),
   delete `gradientStops`, and set `fresnelObstructed` `#663f81`, `fresnelPartial` `#be77e2`,
   `fresnelClear` `#3effb7`. Rewrite the `levels` comment to quote the measured numbers from
   `task.md`: lightness 93/74/53/31, neighbour gaps 22.8 normal / 11.5 deuteranopia / 15.1
   protanopia / 18.0 tritanopia, 24.1 from bare ground and from the faint wash, and the ceiling
   that makes five steps impossible (19.5 / 12.5 / 9.5 for 3 / 4 / 5 steps).
4. Verify: `node tools/lint.js` passes; `wc -l src/config.js` is still <= 350 (the two deletions
   pay for the additions - trim wording, not facts); `node -e "import('./src/config.js').then(m =>
   console.log(m.RF.levelMarginsDb, m.COLOURS.levels, m.RF.defaultCoverageView))"` prints the new values.

## Expected result
`config.js` holds one four-step signal scale and a zone ramp that no longer borrows its amber,
with the measurements that fixed each number written beside them.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->

- `config.js` was already at the 350-line budget, so the new comments had to pay for themselves
  exactly: the shipped values and their measurements stayed, the narrative was cut to one line and
  belongs in GUIDELINES section 7 (step-013). The file is back at exactly 350 lines.
- `RF.gradientMaxMarginDb` and `COLOURS.gradientStops` are gone, which is what breaks
  `src/palette.js` (step-002), `propagation/coveragemesh.js` (step-003) and
  `tests/unit/palette.test.js` (step-008). Nothing else imports them.
- Deviation from the taskman reading rule: README.md was not read at run start. Its wording is the
  work of step-012, where it is read in full; GUIDELINES.md was read in full before step-001.
