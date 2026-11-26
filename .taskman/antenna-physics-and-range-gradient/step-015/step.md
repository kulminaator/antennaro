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

- `RF.gradientMaxMarginDb: 45` (same top of scale as `levelMarginsDb[0]`, so the two views
  can disagree about where the edges are but not about what "strong" means) and
  `COLOURS.gradientStops = { strong: '#e8b32a', mid: '#f4e08e', weak: '#f0a8bf' }`, commented
  with the user's own words and the rule that these hues belong to this view alone.
- `src/palette.js` gains `rangeGradientRgb(marginDb, out)` (piecewise linear through the
  three stops, clamped, `out`-writing for the 30k-cell drape loop) and
  `rangeGradientLegendItems(coverage)` (swatch = the ramp sampled *at* each band boundary,
  counts from the same `levelCounts` the banded legend uses, and the two unchanged tail rows
  keeping the alpha contract: `RF.noLinkAlpha` for asked-and-lost, `0` for never-asked).
  The first row reads `strong: 45 dB or more over the receiver`, the last `>= 0 dB
  over (pink: at the limit)`.
- Exact-at-the-ends shortcut in `rangeGradientRgb`: `a + (b - a) * 1` is not always `b` in
  floating point, which would have made the legend's swatch differ from the map's own
  colour by an increment nobody can see and a test can fail on.
- New `tests/unit/palette.test.js`, 4 tests, all green: endpoint stops exact, clamping at
  both ends (`+10x` the scale and `-999`, and `NaN` treated as no margin), `out` written and
  returned while a fresh call never hands out a shared array, legend swatches equal to the
  ramp at their own boundary, legend counts summing to `walkedCells + budgetExcludedCells`
  (and equal to the banded legend's total), the faint row at `RF.noLinkAlpha`, the
  never-asked row at alpha 0, and no hue shared with any Fresnel-zone colour - checked both
  by name and by a minimum perceptual gap at five points along both ramps, plus every zone
  legend colour against every gradient legend colour.
- **A wrong guess about my own colours, caught by the test.** The first draft asserted that
  saturation falls monotonically towards pink. It does not: the ramp's *middle* (pale
  yellow, max-min 0.25) is less saturated than either end, because the pure pink stop
  (240, 168, 191) is more colourful than the washed-out yellow it fades through. The
  invariants that actually express "yellow to pink" are the two channel relationships that
  define the hue - red-over-blue falling 5.52 to 1.26, and green-minus-blue falling 0.537
  to 0.090, both monotone - and the test now says that, with a comment recording the dead
  assertion so nobody reinstates it.
- Verified: `node tools/timebox.js -t 200 -- node --test tests/unit/palette.test.js` 4 pass
  / 0 fail; `npm run test:unit` all 14 files pass; `npm run lint` ok (43 src, 15 tools,
  21 tests). Nothing paints from the gradient yet - that is step-017 - so no existing
  behaviour moved.
