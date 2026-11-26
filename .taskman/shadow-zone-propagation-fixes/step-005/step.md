# step-005: rewrite the curvature unit tests to the honest finding

## How to perform this step

`tests/unit/curvature.test.js` (83 lines) asserts
`coverage: the earth is never what ends the coverage inside this map` using the
flat-plane extreme (lowest mast, absurd budget, still `map-edge`). With the ray lowered
that claim is probably false; find out and write what is true.

1. Run the file first: `node tools/timebox.js -t 200 -- node --test tests/unit/curvature.test.js`.
2. Keep the test pinning the reported facts being the ones `rf.js` computes; the sign fix
   must not touch it.
3. Rewrite the "never ends the coverage" test to the step-004 finding, in this shape: for
   mast heights whose horizon is inside the map, curvature is what ends the ray and the
   model says so (`worstExcess > 0`, plus whatever `coveragestats.describeEarth()` now
   reports); for the heights the app quotes to users, it is not. Use
   `ANTENNA.heightLimitsM` and fractions of `WORLD`, never metres.
4. If `describeEarth()` output changed in a way that needs pinning, pin it; otherwise
   comment that the reported bulge is a magnitude and the direction is pinned in the los
   tests.
5. Verify: that file green, then `npm run test:unit`.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
