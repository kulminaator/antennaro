# step-011: Deygout multi-edge loss, as a pure function with its own tests

## How to perform this step

One ridge behind another currently costs the same as one ridge. Implement the Deygout
multi-edge rule in `src/propagation/los.js` as an exported pure function, before wiring
it anywhere.

1. Signature that fits the profile `rayProfile` returns, e.g.
   `multiEdgeDiffractionDb(points, totalDistance, freqHz, options)`: from the interior
   samples, walk the path from the transmitter keeping the line to the highest preceding
   edge, and for each edge standing above that line compute its own `v` measured from
   that line and add `diffractionLossDb` for it. Cap the number of edges charged by
   `RF.diffractionEdgeLimit` and merge adjacent samples of one slope so a single ridge
   charges one edge rather than twenty.
2. Add `RF.diffractionEdgeLimit` to `src/config.js` with a comment saying why a cap is
   needed (samples closer than the profile step are the same ridge seen many times);
   trim comment wording elsewhere to stay inside the 350-line budget.
3. New file `tests/unit/diffraction.test.js` asserting, all computed rather than
   hard-coded, with profiles built through `rayProfile` over synthetic `HeightField`s so
   the tests exercise the app's own sampling:
   - one obstruction reduces to `diffractionLossDb` for it, within 0.1 dB;
   - two identical well-separated ridges cost strictly more than one, and strictly less
     than twice one (Deygout is not "add them up");
   - monotone in each ridge's height;
   - a clear profile costs 0 dB;
   - one long slope charges one edge.
4. Verify that file green. Do not switch the sweep over yet - that is step-012.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
