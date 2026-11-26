# step-003: the zone view's unlinked cells get the same treatment

## How to perform this step

1. `src/propagation/coveragemesh.js`: in the `zone` branch, unlinked cells use the same
   `faintWashRgb` treatment (optionally keeping the zone colour's hue via `keep`) so the rim
   means the same thing in both views.
2. `src/palette.js` `fresnelZoneLegendItems`: same swatch rule as step-002 item 4.
3. Re-measure both legends on the default map in the browser (`node tools/browser.js eval` with
   `--url http://127.0.0.1:<port>/`, server via `node tools/staticserver.js start --port 8123`)
   and confirm the counts did not move: steps 105/300/253/178/1992/27796, zone 1159/589/1080/
   27796. Only colours may differ.
Verify: counts identical to the ones above, `node tools/lint.js` ok, and a quote of the new
swatch colour for the faint row in this step's comments.

## Expected result
A cell outside coverage reads the same way in both views: the ground, muted and pushed off
itself.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This step starts empty and is append-only. -->

- Both legends now take the rim's chip from the rule itself: `FAINT_CHIP_COLOUR` in
  `src/palette.js` = `rgbToHex(faintWashRgb(terrainRgb(0.5, 0, 1)))` = `#c1c1c1`, measured in the
  page as `rgb(193, 193, 193)` at opacity `0.57` for the rim row and `0` for the unpainted row.
- `coverageRgb(band)` no longer has a "below sensitivity" branch; it **throws** a `RangeError`
  naming `faintWashRgb` for any band outside the four steps. An out-of-coverage cell asking for a
  step colour is precisely the confusion this task exists to end, so it fails loudly instead of
  painting crimson. `COLOURS.noLink` is deleted (config 348 lines); its old header claim that
  COLOURS holds "the colour used when the link budget is not met" went with it.
- The zone legend's "out of budget" chip used to borrow `ZONE_CUT`'s violet, distinguishable from
  the "zone cut" row above it only by alpha. It now carries the same absence pigment as the steps
  legend, and the browser test asserts that both legends use one pigment for "not painted".
- No faint *row* was added to the zone legend, deliberately: its three rows already partition
  every walked path, asked-and-lost cells included, so a fourth count would double-count and
  break the denominator rule the browser test enforces (`rows sum == walkedCells +
  budgetExcludedCells`). `LEGEND_NOTES.zone` already states that faint means measured-and-failed
  and blank means never measured, and both sentences are still true, so the wording is unchanged.
- Re-measured in the page (`node tools/browser.js eval`, default map, both views): steps
  105/300/253/178/1992/27796, zone 1159/589/1080/27796, `walkedCells` 2828,
  `budgetExcludedCells` 27796 - identical to the pre-change figures, so the paint moved and the
  bookkeeping did not.
- Two assertions in `tests/unit/palette.test.js` had to move with the behaviour (they named the
  deleted colour): the step-vs-rim floor now measures against `faintWashRgb(ground)` and stands at
  **24.9** (the old 24.1 was measured against a fixed wash colour that no longer exists), and the
  legend chip assertion names `FAINT_CHIP_COLOUR`. The step-004 rewrite owns the rest.
- `tests/browser/interaction.test.js` grew two assertions (chip colour, shared absence pigment),
  11/11 green in 20.2 s. That file is 341 lines - over the 320 budget, and step-013 splits it.
