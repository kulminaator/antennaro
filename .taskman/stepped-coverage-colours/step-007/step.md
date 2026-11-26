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

- Legend rendered in the live app, read from the DOM (presentation, not state), with
  `.tmp/legend-check.mjs` over the real harness. Default map, all seven URL cases:
  - `comfortable >= -72 dBm` `rgb(255,240,70)` **105** cells
  - `good >= -77 dBm` `rgb(246,166,0)` **300**
  - `marginal >= -79 dBm` `rgb(211,89,0)` **253**
  - `at the limit >= -80 dBm` `rgb(152,0,17)` **178**
  - faint `1992`, out of budget `27796` - the six counts sum to 30624, the whole grid.
  So the default map really does spread 105/300/253/178 across four colours, where the old
  bands gave 0/0/20/816 and the gradient left an eye with 5 distinguishable colours.
- `?view=zone` and `?fresnel=1` both show "Fresnel zone legend" with `rgb(102,63,129)` /
  `rgb(190,119,226)` / `rgb(62,255,183)` and 1159 / 589 / 1080 paths, which sum to 2828 - the
  walked-path count the HUD has always reported. Same denominators as before, so the palette
  change moved no physics.
- Legacy `?view=bands` and `?view=gradient` land on the steps with an empty rejected list;
  `?view=nonsense` is refused and reported in `boot.overrides.rejected`, as URL junk should be.
- Correction to the plan: **the legend has no click handler at all** - `hud.js` builds rows and
  nothing listens, and `controller.js` has no isolate/mute path. There was no browser-harness
  click key to keep aligned; that item in the plan was wrong and is dropped.
- No existing browser test reads the legend DOM, so step-011 adds one. `app-boot` and
  `interaction` pass (8 and 10 tests), which is what proves the rewritten `renderLegend` runs.
