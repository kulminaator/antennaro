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

- 119 lines of gradient machinery went (three stops, `rangeGradientRgb`, `gradientLegendStops`,
  `gradientCounts`, `rangeGradientLegendItems`); `palette.js` is 208 lines.
- Legend labels now read `comfortable: >= -72 dBm` and so on. `RF.levelNames` is indexed by band
  with a `step N` fallback, so a future length mismatch cannot print `undefined`.
- The legend of the small test fixture (2.4 km, collinear, 10 dBm, -80 dBm) reads
  181 / 376 / 63 / 3 linked cells across the four steps, then 2190 faint and 907 out of budget:
  the steps are populated top to bottom, which is the whole point of the change.
- `src/propagation/coveragemesh.js` and `src/ui/hud.js` still import the deleted functions, so the
  app would throw at boot until steps 003 and 007. Lint cannot see that (it is a named-import
  error at runtime), so do not gate on lint alone between these steps.
