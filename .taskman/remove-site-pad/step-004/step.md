# step-004: unit tests: the map does not move when the antenna does

## How to perform this step

1. Read `tests/unit/terrain.test.js` fully, then replace the pad tests (as of this
   writing: "the site pad is flat so the mast does not float", "the pad is cut level
   with the ground the mast stands on", the `ctx.padElevation` assertion in the
   map-centre test, and "the flattened pad travels with the site") with tests that
   pin the new invariant. Keep the zone/valley/profile tests that are not about the
   pad - the valley-stays-south test in particular still earns its keep.
   New tests, in the same file and voice:
   - **the ground does not depend on where the mast stands**: build the field twice
     with different site positions (0,0) and a ridge-shoulder position (365,-400),
     compare every cell: maximum absolute difference must be exactly 0. Assert the
     same for `heightAt(x, z, ctx)` from two contexts, so the pure function is pinned
     as well as the field.
   - **the mast foot is the drawn ground**: for a list of spots - map centre, the
     ridge shoulder (365,-400), the mountain (0,-900), the valley floor (0,900), a
     corner and an edge - `resolveSite(field, {x, z, heightM: 10})` must give
     `groundY === field.sample(x, z)` (exact, `approxEqual(..., 1e-9)` is fine given
     the same bilinear call) and `y - groundY === 10`.
   - **steep ground is left alone**: at the ridge shoulder, the natural height 60 m
     east of the mast must be *below* the mast foot by a large margin (it is the
     cliff); assert the difference is still there with a site centred there, i.e. no
     plateau is built. Phrase the assertion as "the relief within one pad-radius of
     the mast is unchanged by placing the mast there" - it compares two fields, not a
     golden number.
   - Keep "high ground stays high" if it can be rewritten without `padElevation`:
     compare `groundY` at the mountain spot against the valley spot instead.
2. `tests/unit/state.test.js`: the placement test asserts that `site.x` dirties the
   terrain stage (comment says the pad is baked into the height field). Now the two
   placement fields impact antenna + coverage: update the assertion to expect those
   stages and *not* terrain, and fix the comment - the ground is the ground.
3. `grep -rn "pad" tests/unit/` must come back with nothing but `padStart`.
4. Verify: `npm run lint` and `timeout 300 npm run test:unit` - green, including the
   architecture tests. Do not weaken an assertion to make it pass; if one cannot hold,
   say so in this step's comments and fix the code instead.

## Expected result

The unit suite states the new contract: placing the mast cannot change a single metre
of ground, and the mast foot is exactly the drawn surface.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
