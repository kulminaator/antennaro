# step-016: screenshots from the new numbers, full verify, closing measurements

## How to perform this step

1. Background the server - `(setsid node tools/staticserver.js start --port 8080 --quiet > /dev/null 2>&1 &)`
   - and regenerate the four docs images at 1440x820 with
   `node tools/browser.js shot --url URL --out docs/FILE.png --width 1440 --height 820`,
   matching the four files already in `docs/` (default, valley preset, bands view,
   fresnel view). Timebox each shot.
2. Read each PNG back with the read tool and rewrite its README caption from what is
   actually in the picture - legend counts, range-limit line, curvature line - using the
   step-013 numbers; correct anything in the four captions the new model changed.
3. Stop the server, `node tools/browser.js stop --all`, confirm the process table is
   clean, then `node tools/timebox.js -t 900 -- npm run verify`.
4. Append to `task.md`: the final verify line (vendor/lint/test counts, duration), the
   sweep cost before and after from steps 010 and 012, and one sentence per defect: what
   the fix was and which test pins it.
5. Commit what remains, then write `done` into this step's status.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

## Step comments

Four `docs/` images regenerated at 1440x820 through `node tools/browser.js shot --name docs2`
against a detached server on 8136 (`?` - default, `?preset=valley-reach`,
`?preset=valley-reach&view=bands`, `?preset=valley-reach&fresnel=1`), then read back with the
read tool and every caption rewritten from the pixels.

- Every HUD number in the four shots matches step-013 exactly, which is the check that matters:
  default `836 of 30624 (2.7 %)`, `29.6 %`, `936 m @ 153 deg`, `-50.1 / -90.2 / -116.7 dBm`,
  `73.7 % (> 6 dB diffracted)`, `87.9 % ... 101 ... -19.9 r1 @ 90 m`; valley-reach
  `2019 of 30624 (6.6 %)`, `84.2 %`, `2481 m @ 181 deg`, `budget 2.50 km`,
  `-48.1 / -77.4 / -119.4 dBm`, `14.8 %` shadowed, `99.8 % ... 5 cut`.
- The bands and gradient shots differ in no read-out digit at all, which is now said in the
  caption of the pair because the pictures prove the rule the view test only asserts.
- One caption claim was *removed for not being in the picture*: the old default caption said
  the lit area is "almost all one colour", which is a legend fact, not a visual one. The new
  caption says what the eye can actually check - 770 of 836 at the limit, and the **wedge
  missing to the west**, which is the most striking thing in the image and was never mentioned:
  an omnidirectional antenna with three compass directions at 0 % linked. Verified by a
  top-down look (`.tmp/doc-shots-inspect.js` -> `.tmp/artifacts/docs-default-top.png`) so the
  bite could be attributed to the west rather than guessed at from a perspective view.
- The valley caption now names the configuration it is a picture of (10 directors, 24 m,
  azimuth 180, 6 deg of tilt) instead of "aimed south", because `?preset=valley-reach` is a
  24 m mast and the README elsewhere discusses 25 m masts on a different preset.

## Final verify

`node tools/timebox.js -t 900 -- npm run verify`:
`vendor ok - three 0.187.0, three.module.min.js 732 KiB, license + notice present`,
`lint ok - 45 src, 15 tools, 27 tests file(s)`, `all 26 test file(s) passed in 71422 ms`
(20 unit + 6 browser files, 44 browser tests + 20 unit files' worth of unit tests). Server and
browser processes confirmed gone before it ran.

## What the four defects cost, and what pins them

| defect | the fix | pinned by |
| --- | --- | --- |
| The earth curved the *wrong way*: `rayY = lerp + bulge` lifted every ray over every obstacle, so the round earth helped the link and no shadow zone was ever a horizon. | Subtract the bulge; keep both ray ends anchored (the bulge is 0 at a path end, so this cannot invent an obstacle at the antenna). Tie `radioHorizonM` to the grazing ray so the two cannot drift apart again. | `tests/unit/raycurvature.test.js` (grazing exactly at the horizon, clear inside, earth-obstructed beyond), `browser: the app lowers its ray by exactly the earth, wherever the path is worst` |
| Shadow onset was a step: 0 dB while the ray cleared the ground, then the full diffraction of a buried ray - a hard 6 dB line across the map. | Charge the loss from the *signed* Kirchhoff parameter, fitted down to `KIRCHHOFF_FIT_FLOOR_V = -0.78`, so the loss grows out of 0 dB and passes ~6 dB at the shadow line. | `diffraction: the loss climbs through the shadow line instead of stepping over it`, `diffraction: the climb begins where the Fresnel geometry says it must`, `diffraction: on the map the app ships, ground only ever subtracts` |
| Narrow crests did not exist for the ray: 96 samples over 5.2 km is 54 m spacing, and a crest between samples is not the worst sample, so the planned refinement pass could not find one either. | Walk at one sample per terrain cell via one shared `pathSamples()` rule (`RF.profileMaxSamples` demoted to a ceiling), so the sweep and `__sim.rayTo` cannot disagree. Worst path error 6.5 dB -> 1.9 dB; finer than the mesh buys nothing. | `diffraction: the ray walk is dense enough to see the mesh it walks over` (slides a crest across the *old* grid and asserts the coarse walk is still worse, so it fails when it stops measuring) |
| Obstructions did not accumulate: the worst screen was charged and every ridge behind it was free. | New `src/propagation/diffraction.js`: `screenEdges` collapses contiguous obstruction into screens, the tallest `RF.diffractionEdgeLimit` are superposed Deygout-style, the sum floored at the most significant screen alone - wired through `profileObstructionDb` so the map and `rayTo` share one answer. Moves 22.1 % of the default map's cells, up to 15.7 dB; 29.8 % of default-walked paths (72.2 % of loudest) cross 2+ screens. | `tests/unit/multiedge.test.js` (8 tests, incl. the non-monotonicity of Deygout in a *near* screen and the end-to-end coverage test), `diffraction: the first screen is charged in full, the ones behind it are not` |

Two more were found by re-measuring the documentation rather than by looking for them: the
curvature HUD sentence told half the story at a low mast (fixed with `groundHorizonM` and a
conditional clause, `browser: at a low mast the curvature row says what the earth is hiding`),
and the `RF.diffractionEdgeLimit` cap was quietly keeping the *first* three screens in prose
while the code kept the *tallest* three (now asserted, `edgeLimit: 1` must equal the tallest
screen alone).

## Sweep cost, start to finish

Median of three, same probe throughout (`.tmp/refine-cost.mjs` / `.tmp/multiedge-map.mjs`):

| configuration | before this task | after mesh sampling (step-010) | after multi-edge (step-012) |
| --- | --- | --- | --- |
| default (10 dBm / −80 dBm / 3.8 km, 9159 cells walked) | 57 ms | 42-46 ms | **49 ms** |
| loudest (43 dBm / −124 dBm / 6 km, all 30624 walked) | 172 ms | 226 ms | **270 ms** |

The default got faster - short paths used to be over-sampled by the fixed cap - and the loudest
sweep, which is the one that walks every cell at full mesh resolution, grew by about half again.
