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
