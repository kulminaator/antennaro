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
