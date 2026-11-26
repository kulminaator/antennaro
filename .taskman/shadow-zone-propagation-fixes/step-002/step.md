# step-002: flip the bulge sign in rayProfile and get the unit suite green

## How to perform this step

1. In `src/propagation/los.js`, `rayProfile()`: subtract the bulge instead of adding it,
   and comment the convention in one or two sentences: field heights are planar, so the
   equivalent-round-earth transform leaves the terrain where it is and bends the *ray*
   down toward it; both ray ends stay anchored because `earthBulgeM` is 0 when either
   `d1` or `d2` is 0.
2. Update the module header, which says "standard-earth bulge from the k-factor" without
   saying which way it goes.
3. `node tools/lint.js`, then `node tools/timebox.js -t 600 -- npm run test:unit`.
4. Every unit failure is a claim built on the wrong sign. For each one decide and record
   here: either the test encoded the lifted ray (fix its expectation and the comment
   justifying it), or it caught a real regression (fix the code). Never weaken an
   assertion just to go green.
5. Note here which suites changed character - expect `propagation`, `coverage`,
   `coveragebehaviour`, possibly `fresnel`, since the zone walk shares the profile.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
