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
