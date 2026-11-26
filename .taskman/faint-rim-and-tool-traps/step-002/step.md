# step-002: `palette.faintWashRgb` + config keys, used by the steps view

## How to perform this step

1. `src/config.js`: retarget `RF.noLinkAlpha` to the chosen value; add `RF.faintLightnessShift`
   and `RF.faintChromaKeep` with a comment each quoting the measured floors (config is near its
   350-line budget, so trim a comment in the same edit); keep `COLOURS.noLink` as the legend's
   nominal colour for the row, or drop it if the wash is now ground-derived (say so here).
2. `src/palette.js`: add `faintWashRgb(terrain, params = RF)` returning the vertex colour -
   `L* + shift` when the ground is dark, `L* - shift` when it is bright, chroma scaled by
   `keep` - plus the private Lab -> sRGB it needs (`labOf`/`labToXyz` are already in the file).
   Docstring says *why* a fixed hue cannot work: over a backdrop ramp every fixed colour has a
   colour it matches, measured 1.4 CIEDE2000.
3. `src/propagation/coveragemesh.js`: the unlinked-cell path uses `faintWashRgb` with
   `RF.noLinkAlpha` instead of `COLOURS.noLink`.
4. `src/palette.js` `coverageLegendItems`: the faint row's swatch must be the colour the map
   actually paints for a representative ground - read it from the same helper, not a hex.
Verify: `node tools/lint.js` ok; `node --test tests/unit/palette.test.js` (a colour failure is
expected and is the *next* step's job - note it there, do not edit tests in this step).

## Expected result
The steps view paints unlinked cells with a ground-relative wash at the new alpha, and every
number behind it is in `config.js`.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This step starts empty and is append-only. -->

- Shipped: `RF.noLinkAlpha` 0.57 with `RF.faintLightnessShift` 30 and `RF.faintChromaKeep` 0,
  `palette.faintWashRgb(ground, out)` (private `rgbToLab`/`labToRgb`, D65 white point and the sRGB
  matrix named as colour-space identities, `FAINT_PIVOT_L = 55` declared next to the maths), and
  `coveragemesh.js` computing the cell's own ground colour the way `terrainmesh.js` does
  (`terrainRgb(height, stats.min, stats.max, slopeDegAt)` - the exaggeration cancels) and passing
  it through the wash.
- **The drape's alpha is multiplicative.** `MeshBasicMaterial({opacity: RF.overlayOpacity})` with a
  4-component colour attribute gives `opacity x vertexAlpha` in the shader, so `noLinkAlpha` 0.57
  is the 0.50 effective alpha the step-001 frontier was measured at. Anyone reading the config
  value as "what reaches the eye" gets it wrong by a factor of 0.88; the config comment now says
  the product out loud.
- Deviation from the step plan, and it is a merge rather than a skip: because the faint branch is
  chosen before the view is consulted, the mesh change lands for **both** views in this step -
  which is step-003's mesh half. What step-003 still owns is the legend (both views' faint row
  swatch and the zone legend's note) and the re-measurement of the counts.
- `src/config.js` went to 354 lines and the budget is 350, so the three rim keys now share one
  comment block instead of three (measured floors retained verbatim), the `COLOURS` header lost a
  line, and `COLOURS.noLink` became `// legend chip only: the map paints faintWashRgb(ground)`.
  The header's claim that COLOURS holds "the colour used when the link budget is not met" was
  removed because it stopped being true - not trimmed for space.
- Palette suite unchanged and green: the old assertions measured the fixed wash *away* from the
  terrain, and moving the wash further from the terrain cannot fail them. The assertions that
  actually describe the old rule get rewritten in step-004, as planned.
- Screenshots read back before believing anything (`.tmp/artifacts/wash-default.png`,
  `wash-valley.png`): the default map shows a grey band whose relief still shows through, and the
  valley preset's tongue shows its asked-and-lost holes - the north patch, the crescent in the
  north, and the 150-152 deg holes at 1.5 km the README describes - which is the geography this
  bug was hiding.
- Open risk, to be closed by step-005's pixel measurement rather than argued away: the wash is
  keyed to the terrain **albedo**, while `terrainmesh.js` draws `MeshStandardMaterial` under a
  directional sun and a hemisphere light. Where a face renders darker than its albedo the wash is
  more visible, not less - except bright rock in deep shade, where the rule pushes *down* toward
  a ground that has already been darkened. That is the one case the model cannot vouch for.
