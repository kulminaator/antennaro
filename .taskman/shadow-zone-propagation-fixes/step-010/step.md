# step-010: measure the cost of refinement and put its size in config

## How to perform this step

Refinement is extra work per path, paid tens of thousands of times per sweep.

1. Write `.tmp/refine-cost.mjs` (`.tmp/cost-probe.mjs` from the coverage work may be
   reusable): whole-map strided sweep on the default configuration and on the loudest
   legal one, three repetitions each, in milliseconds.
   Run `node tools/timebox.js -t 300 -- node .tmp/refine-cost.mjs`.
2. Compare against the recorded baseline (about 150 ms for a fully walked whole-map
   sweep, noted during the coverage work) and write the new numbers here.
3. If the worst case grew by more than about half again, lower
   `RF.profileRefineSpanFactor` / `profileRefineSamples` - do not remove the refinement -
   and re-measure; record the trade-off settled on and that the narrow-crest test still
   passes with those values.
4. Verify: `node tools/timebox.js -t 600 -- npm run test:unit` green.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

## Step comments

- **There is no refinement pass to size.** step-009 measured the plan's premise and replaced
  the refinement idea with a sampling rule - one sample per terrain cell, derived in
  `pathSamples()`. What this step now sizes is that rule, and the knob is the per-cell factor
  and `RF.profileMaxSamples`, not `profileRefineSamples` / `profileRefineSpanFactor`, which
  were never introduced.
- `.tmp/refine-cost.mjs`: whole-map strided sweep, three repetitions, default and loudest legal.
  - `default 10 dBm / -80 dBm, 3.8 km: 48 / 46 / 43 ms` (median 46) - asked 30624, walked 9159,
    linked 1926, median -95.38 dBm, zone 82.1 %, limit `budget`
  - `preset-loud 43 dBm / -124 dBm, 6 km: 222 / 226 / 231 ms` (median 226) - walked 30624,
    linked 30624, median -75.12 dBm, zone 12.4 %, limit `map-edge`
- Against the recorded baseline for a fully walked whole-map sweep (~150 ms during the coverage
  work, 172 ms re-measured here at the old 96-sample cap), the loudest sweep grew by 31 % to
  51 % depending on which baseline you trust - i.e. at the "half again" threshold, not past it -
  and the **default configuration got faster**, 57 ms to 42-46 ms, because short paths used to
  be doubled and now get exactly one sample per cell. The sweep that pays is the one where every
  one of 30 624 cells links, which is a configuration nobody reaches without deliberately setting
  43 dBm, -124 dBm and a 6 km work area together.
- Trade-off settled on, stated so it can be undone in one line: keep one sample per cell.
  Reverting `SAMPLES_PER_CELL` to a cap-bound count buys the milliseconds back and puts back the
  6.5 dB miss step-009 measured; `tests/unit/diffraction.test.js` ("the ray walk is dense enough
  to see the mesh it walks over") fails the moment that happens, because it asserts the coarse
  count is materially worse on the same paths.
- In-browser timing was attempted and is not a usable measure here: in this headless software-GL
  environment a single `requestAnimationFrame` of the scene takes 0.8-1.4 s even for a patch that
  dirties nothing, so frame-based timing buries a 46 ms sweep completely. Also learned the hard
  way: `tools/browser.js start --url` leaves the eval target on `about:blank`; `eval --url` is
  what navigates. And `__sim.settle()` is synchronous, so it does not itself pump frames.
- Verification: `node tools/timebox.js -t 300 -- node .tmp/refine-cost.mjs` (numbers above),
  `node tools/lint.js` green, `node tools/timebox.js -t 600 -- npm run test:unit` ->
  `all 19 test file(s) passed`, which includes the narrow-crest test at these values.
