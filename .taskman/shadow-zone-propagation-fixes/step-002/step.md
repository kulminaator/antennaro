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

- One line changed in `src/propagation/los.js` (`rayY = from.y + dy * t - bulge`) plus a
  header paragraph saying which way the transform moves and why both ray ends stay put.
- Exactly one existing test failed, and it had the wrong sign written into its own
  justification: `coverage: switching the terrain off for dB does not flatten the earth
  for the zone` asserted `curved.clearanceRatio > straight.clearanceRatio` with the
  message "a standard atmosphere lifts the ray". A standard atmosphere bends rays *down*,
  which is why the equivalent earth is rounder, so the assertion is now `<` and the
  comment says that a model in which curvature helps a link has the sign backwards.
  Measured on the flat test plane: 0.2167 curved against 0.2269 flat zone radii.
- No other unit file changed character, and the whole browser suite (6 files) passed
  unchanged - `node tools/test.js --browser`, 70 s. The browser curvature tests quote the
  *radio horizon for the terminal height*, which this fix does not touch; step-006 still
  has to re-read them for claims that were really about the ray.
- Consequence the suite does not yet express: the README/GUIDELINES sentence pair that
  quotes this test's numbers (0.228 against 0.156) is now stale in both value and
  direction. That belongs to step-014 / step-015.
