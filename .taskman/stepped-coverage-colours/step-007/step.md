# step-007: hud: wording that still names the gradient

## How to perform this step
1. In `src/ui/hud.js`, `renderLegend` selects `rangeGradientLegendItems` for the gradient view;
   reduce it to the two legends (`steps` -> `coverageLegendItems`, `zone` -> `fresnelZoneLegendItems`)
   and update the comment at line ~172 that says one entry per value of `display.coverageView`.
2. Grep the HUD for sentences that describe colours (`gradient`, `pink`, `yellow`, `warm`) and
   re-word them to the stepped scale. Do not change any number or any other behaviour here.
3. Verify: `node tools/lint.js`; `grep -n gradient src/ui/hud.js` empty.

## Expected result
The HUD legend for the signal view is the four named steps, plus faint and not-measured rows.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->
