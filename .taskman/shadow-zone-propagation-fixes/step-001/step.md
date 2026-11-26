# step-001: red unit tests for the direction the earth bulge moves a ray

## How to perform this step

The bug must be demonstrated before it is fixed, and demonstrated by a relationship,
not by a metre reading.

1. Add tests to `tests/unit/propagation.test.js` (294 lines, budget 320). If they will
   not fit, create `tests/unit/curvaturedirection.test.js` instead and say so in this
   step's comments.
   - Build a flat `HeightField` (`new HeightField({ size, worldSize, heights })`). Use a
     `worldSize` well over the radio horizon so the geometry is beyond dispute, e.g.
     40 km with `size: 401`; the domain has no world-size limit, only the panel does.
   - Mast 10 m, terminal on the ground, link 30 km:
     `rayProfile(field, from, to, { samples: 96, freqHz })`.
   - Assert `profile.worstExcess > 0` and that `maxExcessDistance` lies in the middle
     half of the path, with a comment deriving the expected numbers from
     `earthBulgeM(15000, 15000)` (12.5 m at k = 1.413) and the straight-ray height there
     ((10 + 0) / 2 = 5 m), i.e. the ground should stand ~7.5 m above the ray.
   - Assert the convention itself at the mid sample: `rayY` equals the straight-chord
     height minus `earthBulgeM(d1, d2)`, within a millimetre, computed from the
     profile's own `points`.
2. Add the inverse case: the same geometry 8 km apart reports `worstExcess < 0` (nothing
   in the way).
3. Verify these FAIL on the current code (the bulge is added, so the ray is lifted):
   `node tools/timebox.js -t 200 -- node --test tests/unit/propagation.test.js`
   Then run the whole unit suite and confirm nothing else broke, since `src/` is intact.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
