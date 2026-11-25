# step-005: overlay colouring + legend: linked but zone-obstructed

## How to perform this step

1. `src/propagation/coveragemesh.js`, in `update()`: a cell that is evaluated and
   linked but not `fresnelClear` paints with `fresnelObstructedRgb()` instead of its
   band colour; everything else keeps `coverageRgb(band)`. It needs the sensitivity to
   know "linked": pass `coverage.sensitivityDbm` (already on the coverage result).
   Keep the "not evaluated" alpha-0 path exactly as it is.
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
