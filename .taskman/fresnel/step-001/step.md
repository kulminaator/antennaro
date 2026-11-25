# step-001: config + palette: the clearance criterion, the obstructed colour, the volume knobs

## How to perform this step

1. `src/config.js`, `RF` block: add the criterion and keep it next to the other radio
   numbers:

   ```js
   /** A path is reliable only when this fraction of the first Fresnel zone is
    *  clear of the ground (convention: 60 % of r1). */
   fresnelClearFraction: 0.6,
   ```

   `RENDER` block: the volume's look - `fresnelRings` (radial segments),
   `fresnelSteps` (samples along the link), `fresnelOpacity` (~0.18),
   `fresnelRadialExaggeration` (1 - a knob to make the cigar visible on a km map).
   `COLOURS`: add `fresnelObstructed` (a hue that reads against all four level
   colours and the dark no-link grey - try '#a24bd0') and `fresnelVolume`.
2. `src/palette.js`: `fresnelObstructedRgb()` and `fresnelVolumeRgb()` built with
   `hexToRgb(COLOURS...)`, plus `coverageRgb(band)` untouched; add a `coverageLegend`
   -shaped helper the legend can render: the existing legend rows stay RSSI bands,
   the Fresnel row is a *marker*, so expose `fresnelLegendRow()` returning
   `{ colour: hexToRgb(COLOURS.fresnelObstructed), label: ... }`.
3. Verify: `npm run lint` ok; `node --input-type=module -e "import('./src/config.js')..."`
   prints the new keys; `npm run test:unit` still green (palette/config are covered by
   the unit suite).

## Expected result

The criterion, the colour and the volume look are single sourced in `src/config.js`
and reachable through `src/palette.js`; nothing else changes yet.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
