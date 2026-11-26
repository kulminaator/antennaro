# step-004: measure what curvature actually does on this map now, no code

## How to perform this step

Before rewriting the curvature tests and docs, get the new truth from the model. Every
number goes into this step's comments; steps 005, 006 and 014 quote them.

1. Write a throwaway probe `.tmp/curvature-truth.mjs` (pure Node; import
   `src/propagation/{rf,los,coverage}.js`, `src/terrain/generators.js`, `src/config.js`)
   and run it under a timebox. Report:
   - `earthBulgeM(d/2, d/2)` for the longest link the map allows from the centre and
     from a corner (`farthestGroundDistanceM` in `src/math/vec3.js`).
   - For masts at `ANTENNA.heightLimitsM.min`, 1, 2, 5, 10, 25, 40 m on a *flat* plane
     of `WORLD.worldSize`: the largest `worstExcess` now reported for a link to the map
     edge, and for which of those masts `radioHorizonM(h, 0)` falls inside the map.
   - On the real default terrain: whether the default 10 m mast's sweep changes at all,
     and how much. If `coverage`'s options do not plumb `kFactor`, compare per-path
     numbers instead of a whole sweep and say so here.
   - The worst excess now seen on the default configuration's longest link, and whether
     the HUD's curvature claim ("the earth curves away long before this map ends") is
     still true for the default and for the loudest legal configuration.
2. Append the measurements as bullets to this step's comments, and the ones that change
   what the project believes to `task.md`'s `## Comments`.

## Expected result

A measured statement of the form "curvature now binds for masts below X m beyond Y km;
at the default mast height it changes nothing / changes Z".

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

Probe: `.tmp/curvature-truth.mjs` (pure Node, ~2 s). All numbers below are from it.

**A. How much earth has to be cleared (mid-path bulge, k = 1.413)**
- centre to map edge, 2600 m: 0.094 m
- centre to corner, 3677 m: 0.188 m
- legal corner site to opposite corner, 7212 m: 0.722 m

**B. Where the earth starts to hide a terminal standing on the ground** (the ray the
decibels are charged against; walked by bisection, and it agrees with `sqrt(2 k R h)`
to within 0.4 %):

| mast | earth shadow begins | zone-terminal horizon (4 m) | inside this map? |
| --- | --- | --- | --- |
| 0.5 m (panel minimum) | 3008 m | 11 487 m | **yes** (corner is 3677 m from centre, 7212 m from corner) |
| 1 m | 4254 m | 12 729 m | yes, past centre-to-corner |
| 2 m | 6016 m | 14 487 m | only for a corner mast looking across |
| 5 m | 9513 m | 17 974 m | no |
| 10 m (default) | 13 453 m | 21 904 m | no |
| 25 m | 21 271 m | 29 702 m | no |
| 40 m | 26 906 m | 35 322 m | no |

**C. The default configuration is numerically unchanged** - linked 844, last link 936 m,
walked 2828, median -90.3 / best -52.1 / worst -117.1 dBm, `limitingFactor: budget`,
zone-clear 86.1 %, bulge under the max link 0.0122 m, horizon 21.904 km, worst clearance
-21.374 r1 at 120 m. Every one of those matches the pre-fix record, so the sign fix does
not disturb the story the README tells about the default map.

**D. Curved versus flat, path by path, default mast, real map**: of the 844 linked cells,
113 differ in dB and the largest difference is **0.01 dB** (at 574 m); but **all 844
differ in first-zone clearance**, because clearance is measured off the ray and the ray
is now up to 0.19 m lower. The headline zone percentage did not move (86.1 % both before
and after), so the shift is real but sub-visible.

**F. The loudest configuration the panel allows** (40 m mast, Yagi, 43 dBm, -124 dBm):
30 624 linked, last link 3677 m, `map-edge`, zone-clear 37.7 %, worst clearance -31.587 r1
at 1343 m, bulge 0.188 m, horizon 35.32 km. Curved versus flat: 18 367 of 30 624 paths
differ in dB, the largest by **6.12 dB at 3141 m**. So even with a tall mast, curvature is
worth several dB where a path grazes a ridge - that is the number to put in the docs
instead of "curvature is centimetres, so it does not matter".

**E/G. Curvature alone, on a featureless plane**: with the lowest legal mast and a loud
budget, 2280 of 30 624 cells are obstructed by the earth alone (the ones past ~3.0 km,
i.e. the corners), yet every cell still links and `limitingFactor` stays `map-edge` - the
earth costs decibels, it does not end the link. With a 2 m mast on the same plane: zero.

**I. Where it does bite**: lowest legal mast in a legal corner on the real terrain with a
1670 m budget - 1605 of the cells the sweep asked about are made worse by curvature, while
the same site on a flat plane has none (its budget only reaches 1669 m, inside the 3008 m
shadow radius). Low mast plus real ground is where curvature and terrain add up.

**H. A preview of defect 2**: on a flat plane at 0.5 m the model reports 0.00 dB at
3.7 km of excess and then 6.05 dB at 0.02 m of excess - the 6 dB cliff is already visible
as a step from "no obstruction" to "grazing". Step-007 removes it; these H numbers will
change when it does.

**Statements the project can now make honestly**
- The old flat-plane test (`coverage: the earth is never what ends the coverage inside
  this map`) still passes: curvature does not *end* coverage, because the excess it
  produces is centimetres to 0.7 m and costs at most a few dB. It must be kept, and the
  new fact added beside it: from the panel's lowest mast the earth **does** obstruct the
  far corners of this map, and obstructs nothing at all above a 5 m mast.
- The claimed horizon (computed for the *terminal* height) remains off-map for every
  legal mast: 11.5 km at the lowest mast. That sentence survives unchanged.
- The HUD's "the earth curves away long before this map ends" is now only true for masts
  above ~2 m; for the lowest mast the earth curves away *inside* the map.
