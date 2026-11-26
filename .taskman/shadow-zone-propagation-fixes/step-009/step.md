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
