# step-015: `config.js` + `palette.js`: the range gradient ramp and legend, with `tests/unit/palette.test.js`

## How to perform this step

1. In `src/config.js`: `RF.gradientMaxMarginDb: 45` (the same top of scale as
   `levelMarginsDb`'s largest margin, so the two views disagree about sharpness and not
   about meaning) and in `COLOURS` a `gradientStops` triple: strong `#e8b32a` (yellow),
   mid `#f4e08e` (light yellow), weak `#f0a8bf` (pink), each commented with the user
   request it answers and the fact that these hues belong to no other view.
2. In `src/palette.js` add `rangeGradientRgb(marginDb, out = null)` mapping margin
   `0..RF.gradientMaxMarginDb` through the three stops (piecewise linear, clamped,
   `out`-writing like `fresnelZoneRgb` because the drape loops over 30k cells), and
   `rangeGradientLegendItems(coverage)` which returns rows whose `colour` is the ramp
   sampled at each `RF.levelMarginsDb` boundary, whose `label` names the dBm and the
   words (`strong: 45 dB or more over the receiver`, `... at the limit (pink)`), whose
   `count` reuses the band counts the sweep already computes, and whose `alpha` is 1 - plus
   the two unchanged tail rows (`below sensitivity`, faint with `RF.noLinkAlpha`; and `out
   of budget - not measured, not painted` with alpha 0).
3. Create `tests/unit/palette.test.js`: the ramp is monotone in the *yellow-to-pink*
   direction as margin falls (compare luminance and the red/blue balance, not golden RGB),
   the endpoints return the stop colours exactly, an out-of-range margin clamps, `out`
   argument is written and returned, the legend's row counts sum to
   `walkedCells + budgetExcludedCells`, every legend row has a `colour` that appears in
   `gradientStops` or in the no-link colour, and the gradient stop colours differ from the
   `fresnelZone*` colours (two views must not share a hue).
4. Verify: `node tools/timebox.js -t 120 -- node --test tests/unit/palette.test.js` green
   and `npm run lint`.

## Expected result

A continuous yellow-through-pink scale keyed to link margin, with a legend that names the
dBm at each stop and counts that add up.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
