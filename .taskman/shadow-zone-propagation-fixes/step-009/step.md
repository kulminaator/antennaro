# step-009: refine the ray around its worst sample so narrow crests are found

## How to perform this step

Measured: 96 samples over 5.2 km puts samples 54 m apart, and a 20 m ridge with
sigma 20 m sitting between two samples is charged 0 dB against 11.2 dB when the same path
is sampled every 1.3 m. The fix is a second, cheap pass around the worst sample, not a
denser global walk.

1. In `rayProfile`, after the coarse loop, add a refinement pass over
   `[max(d0 - span, 0), min(d0 + span, total)]` around the worst interior sample distance
   `d0`, with `RF.profileRefineSamples` samples, folding the result into
   `maxExcess` / `worstExcess` / `maxExcessDistance` and into `minClearance` when `freqHz`
   was requested, so the zone answer gets the same care. Skip it when there is no
   interior sample to refine.
2. Add `RF.profileRefineSamples` and `RF.profileRefineSpanFactor` (span as a fraction of
   path length, so it scales with the map) to `src/config.js`, commented with the
   measurement above. `src/config.js` is at 349 of 350 lines: trim wording in the long
   comments elsewhere to fit and keep `node tools/lint.js` green.
3. Add a unit test that builds the failing case - a gaussian crest whose peak falls
   between two coarse samples, on a field built straight from a `Float32Array` - and
   asserts the app's answer is within 1 dB of the same path walked with a very dense
   sample count. Compute the dense answer in the test; do not hard-code 11.2 dB.
4. Verify: `node tools/timebox.js -t 200 -- node --test tests/unit/propagation.test.js`
   then the whole unit suite.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

## Step comments

- **The step's premise did not survive measurement, and the fix moved.** The plan asked for a
  refinement pass around the worst sample, motivated by "a 20 m ridge between two samples is
  charged 0 dB against 11.2 dB". That 11.2 dB was produced with the *old* charging rule, which
  charged nothing until the terrain touched the ray. Re-measured under step-007's continuous
  screen rule, the same miss costs a few decibels instead of eleven. A refinement pass around
  the worst sample still cannot fix it either: a crest that no sample lands on is not the worst
  sample, so there is nothing to refine around. What actually fixes it is sampling at the mesh.
- **First three probes reported zero error and were wrong.** Every one of them put the crest at
  mid-path of a symmetric path, and a symmetric path has a sample exactly at mid-path. The
  crest has to be slid off the sample grid on purpose. `tests/unit/diffraction.test.js` shifts
  by fractions of a *coarse* interval for exactly this reason, and asserts that the coarse walk
  really is worse, so the test knows when it has stopped measuring anything.
- **Measured ladder**, worst error against the same paths walked dense, crests one to three
  cells wide (sigma 15-40 m, 4-16 m tall), each slid through the sample phase:

  | samples per cell | spacing on the 7071 m corner-to-corner diagonal | worst error |
  | --- | --- | --- |
  | old cap of 96 | 73.7 m = 4.93 cells | 6.51 dB |
  | 2 (old rule, unclamped) | 40.6 m = 2.72 cells | 4.44 dB |
  | 1 | 20.3 m = 1.36 cells | 2.49 dB |
  | 1 with the cap lifted | 14.9 m = 1.00 cell | **1.86 dB** |
  | 0.5 (two per cell) | 7.5 m | 1.86 dB - no better |

  The mesh saturates at one sample per terrain cell: finer sampling of a bilinear field along a
  diagonal buys decibels of nothing, so the rule is one per cell and the config value is a
  ceiling on nonsense path lengths rather than a limit this map reaches.
- **What it cost**, `computeCoverage` in Node, 10 dBm / -80 dBm (the app default) and
  43 dBm / -124 dBm with a 6 km work area (deliberately the loudest thing the panel allows):
  default 57 ms -> 42 ms, i.e. *faster*, because short paths used to get two samples per cell
  and now get one; loudest 172 ms -> 220 ms, because that sweep is all long paths. Default
  linked cells 1916 -> 1926, zone clear 82.72 -> 82.09 %, loud median -74.47 -> -75.12 dBm.
  Nothing structural moved.
- **Duplicated sample-count logic was the second real defect.** `coverage.js`, `los.js`
  (`obstructionLossDb`, `fresnelStatus`) and `testapi.js` each derived a step count their own
  way, so `window.__sim.rayTo` reported 8.77 dB for a cell the picture painted from 8.46 dB -
  0.3 dB of argument between the map and the tool used to check it. All of them now call
  `pathSamples(horizontalM, cellSizeM)` in `src/propagation/rf.js`, and `rayTo` takes a
  `samples` option for tests that want to override it.
- `RF.profileSamples` is renamed `RF.profileMaxSamples: 2 * WORLD.gridSize`, which says what it
  is: one sample per cell along the longest path the map can hold, twice the grid width.
- Files: `src/config.js`, `src/propagation/rf.js` (new `pathSamples`), `src/propagation/los.js`,
  `src/propagation/coverage.js`, `src/app/testapi.js`,
  `tests/unit/diffraction.test.js` (new sampling test), `tests/unit/propagation.test.js`.
- Verification: `node tools/lint.js` -> `lint ok - 44 src, 15 tools, 26 tests file(s)`;
  `npm run test:unit` -> `all 19 test file(s) passed in 5514 ms`;
  `node tools/test.js --browser` -> `all 6 test file(s) passed in 60212 ms`.
