# step-002: palette.js: retire the continuous gradient helpers

## How to perform this step
1. In `src/palette.js` delete `rangeGradientRgb`, `gradientLegendStops`, `gradientCounts` and
   `rangeGradientLegendItems`, plus the `GRADIENT_*` module constants and the `COLOURS.gradientStops`
   import. Keep `coverageRgb`, `coverageLegendItems`, `fresnelZoneRgb`, `fresnelZoneLegendItems`,
   `terrainRgb`, `patternRgb`, `hexToRgb`, `rgbToHex`, `mixRgb`.
2. In `coverageLegendItems`, name the step: label becomes
   `` `${RF.levelNames[band]}: >= ${sensitivity + margin} dBm` `` so the legend says which word and
   which threshold a colour is, and keep the faint and not-measured rows exactly as they are.
3. Rewrite the module docstring's colour paragraph: one stepped scale (red at the limit, yellow
   where the link has room), keyed to margin over the receiver, absolute, and the zone ramp is a
   different question with its own three colours.
4. Verify: `grep -rn "rangeGradientRgb\|gradientLegendStops\|rangeGradientLegendItems" src/` finds
   only `propagation/coveragemesh.js` and `ui/hud.js` (fixed in the next two steps);
   `node -e` a call to `coverageLegendItems` on a small coverage fixture and print the labels.

## Expected result
The palette exposes one signal scale and one zone scale, and the legend rows carry the step names.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->
