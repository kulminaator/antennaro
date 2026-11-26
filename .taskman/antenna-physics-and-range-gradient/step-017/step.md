# step-017: paint the three views from one mode: drape, controller, HUD legend, `scene()`

## How to perform this step

1. In `src/propagation/coveragemesh.js` change `update(field, coverage, options)` to read
   `options.view` (`'bands' | 'gradient' | 'zone'`, default `'bands'`) instead of
   `zoneView`; keep the alpha contract byte for byte (`1` linked, `RF.noLinkAlpha` asked and
   failed, `0` never asked / `budgetExcluded`) and select the colour with a small
   `paint(view, coverage, i, rgb)` switch calling `coverageRgb`, `rangeGradientRgb` on
   `rssi[i] - coverage.sensitivityDbm`, or `fresnelZoneRgb`. Update the doc comment: it is a
   mode, not a marking, and now there are three of them.
2. `src/app/controller.js`: pass `{ view: state.display.coverageView }`; the visibility
   rules stay on `display.showCoverage`.
3. `src/ui/hud.js`: `renderLegend(coverage, view)` picks
   `coverageLegendItems` / `rangeGradientLegendItems` / `fresnelZoneLegendItems` and titles
   the card `Coverage legend` / `Range gradient legend` / `Fresnel zone legend`.
4. `src/app/reports.js`: add `coverageView` to `sceneInfo()` so a test can assert which
   colours are on screen; extend `src/app/testapi.js` docs if it lists `scene()` fields.
5. Verify: `npm run lint`; `node tools/timebox.js -t 200 -- node --test
   tests/unit/palette.test.js tests/unit/state.test.js`; a detached server plus a short
   `withApp` probe that patches each view in turn and prints `scene().coverageView` and
   `pixelStats().distinctColours`, showing three different pictures, `errors()` empty; stop
   server and browser.

## Expected result

`display.coverageView` alone decides what the drape means, and the legend changes with it.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- `coveragemesh.update(field, coverage, { view })` with `view: 'bands' | 'gradient' | 'zone'`
  (anything else falls back to `bands`), and a small if/else chain in the loop that picks
  `coverageRgb(band)`, `rangeGradientRgb(rssi[i] - sensitivityDbm)` or
  `fresnelZoneRgb(fresnelClearance[i])`. The alpha contract is untouched: `1` linked,
  `RF.noLinkAlpha` asked-and-lost, `0` never asked, and the module's header now says the
  colour is a mode and the alpha is the part of the message that is not a matter of taste.
  Band colours are looked up from a per-repaint table instead of calling `hexToRgb` 30 000
  times.
- Controller passes `{ view: state.display.coverageView }` on both repaint paths
  (`onCoverage` and the view-change branch of `applyVisibility`, whose `lastZoneView`
  boolean became `lastPaintedView`). `display.showCoverage` still owns visibility,
  `display.showFresnel` now only owns the volume.
- HUD: `renderLegend(coverage, view)` picks `coverageLegendItems` /
  `rangeGradientLegendItems` / `fresnelZoneLegendItems`, titles the card from `LEGEND_TITLES`
  (`Coverage legend` / `Range gradient legend` / `Fresnel zone legend`) and adds a
  `LEGEND_NOTES` line where the rows cannot say everything. `reports.sceneInfo()` gained
  `coverageView` (asked of the state, normalised to the three names) so a test can assert
  which colours are on screen.
- **The step-015 ramp top was wrong and measurement caught it.** `gradientMaxMarginDb: 45`
  painted nearly every map pink, because margin only falls 20 dB per decade of distance:
  `.tmp/margin-dist.mjs` measured the linked cells of three real sweeps -
  - default dipole (budget-limited, last link 936 m): margins **0-28 dB**, mean 15.8 dB in
    the innermost tenth of the reach falling to 0.4 dB at the rim;
  - `flat-field` preset (study-range-limited at 3677 m against a 16.7 km budget):
    **0-55 dB**;
  - the loudest link the panel allows (43 dBm / -124 dBm collinear, map-edge-limited):
    **18-112 dB**.
  So the top is now `gradientMaxMarginDb: 30` - a decade and a half inside the link's own
  edge - and it stays an *absolute* figure: the ramp is never normalised to the picture in
  front of you, or two screenshots of different links would stop being comparable.
- `rangeGradientLegendItems` therefore stopped borrowing the RSSI bands. Its rows are now
  `gradientLegendStops()`, thirds of its own ramp (`strong >= 20`, `weaker 10-20`,
  `at the limit 0-10 dB over the receiver`), each swatch sampled *inside* its own range,
  plus the faint asked-and-lost row and the bare never-measured row. Counts are walked in
  the palette (`gradientCounts`) because only this view needs them and the sweep has no
  line budget left; the faint count is asserted equal to the sweep's own
  `levelCounts[last] - budgetExcludedCells`, so the two paths cannot drift. The old design
  could not survive the new top anyway: sampling the ramp at the band boundaries with a top
  of 30 gave two legend rows in one colour.
- The zone legend gained the row it was missing: its three clearance rows count every
  *measured* path, link or no link, so it now appends the `out of budget - not measured,
  not painted` row (alpha 0) and the HUD prints a note under it saying what faint and blank
  pixels mean. All three legends now sum to `walkedCells + budgetExcludedCells` - 30 624 for
  the default state, measured below - which is the invariant the palette tests assert.
- `assets/app.css` gained `.legend-note` (dim, italic, full-width grid cell).
- Measured legends, live, HUD scrolled to the card (`.tmp/view-shots.js`, no page errors):
  - `?view=gradient`, default state: strong 6 / weaker 56 / at the limit 782 / faint 1984 /
    unmeasured 27 796
  - `?view=bands`, same state: 0 / 0 / 16 / 828 / faint 1984 / unmeasured 27 796 - the same
    828 linked cells the banded view paints in **one** colour are 6 / 56 / 782 in the
    gradient, which is the entire argument for the second view in one line
  - `?preset=flat-field&view=gradient`: 17 / 194 / 1846 / faint 112 / unmeasured 28 455
  - `?view=zone`: cut 1241 / partly 525 / clear 1062 / unmeasured 27 796
- Pixel classification over a fixed camera (`.tmp/view-paint2.js`, 240x160 samples) proves
  three different pictures rather than three different captions: bands 1185 yellow-ish and
  0 pink; gradient 544 pink and 4 yellow; zone purple-ish 7304 against 6029 for the other
  two. `scene().coverageView` reported `bands`/`gradient`/`zone` in step with the patch,
  with no coverage recompute in between (the counts did not move while the pixels did).
- `.tmp/artifacts/view-gradient-flat-field.png` read back: yellow core along the boresight,
  pale-yellow ring, pink rim, faint speckle where the ground won, bare ground beyond, and a
  legend that names every one of those.
- Verification: `npm run lint` ok (`config.js` trimmed to exactly 350 lines to fit the two
  new keys); `node --test tests/unit/palette.test.js tests/unit/fresnel.test.js` 13 pass;
  `npm run test:unit` all 15 files pass; `npm run test:browser` 39 tests, **1 failure**:
  `browser: the zone view repaints the coverage drape and gives it back`, which still asks
  `display.showFresnel` to recolour the drape. That is step-018's assignment, not a
  regression in the picture: the volume still switches, only the colouring moved.
