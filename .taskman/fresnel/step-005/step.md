# step-005: overlay colouring + legend: linked but zone-obstructed

## How to perform this step

1. `src/propagation/coveragemesh.js`: `update(field, coverage, options)` where
   `options.zoneView` (default false) switches the *whole* drape from RSSI bands to
   zone state - clear / partial / cut - using `fresnelObstructedRgb()` and the palette
   ramps. Off means the overlay paints exactly what it paints today. Painting
   "not zone-clear" on top of the default RSSI map is wrong: it is ~95 % of the map
   (task Comments), which reads as a bug rather than as information.
2. `src/ui/controls.js` legend renderer: after the RSSI band rows, render the marker
   row from `fresnelLegendRow()` (same DOM shape as the band rows so the CSS needs no
   change). The legend must say what it is: a linked cell whose first Fresnel zone is
   cut, not a signal level.
3. Verify: `npm run lint`; unit suite green; live, take a screenshot with defaults and
   one behind the mountain (`?preset=mountain-shadow`) and *look* at it: the obstructed
   colour must appear where the ridge shadows the path and must not smother the flat
   field. `node tools/browser.js eval "JSON.stringify(window.__sim.coverage().stats)"`
   reports the obstructed counts to compare against what the picture shows.

## Expected result

On screen, "the budget says yes but the zone says no" is a colour you can see, and the
legend explains it.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
