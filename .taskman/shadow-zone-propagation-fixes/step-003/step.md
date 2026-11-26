# step-003: pin the convention against the radio horizon, not against a metre reading

## How to perform this step

The synthetic beyond-horizon case is a straw man unless it ties to `radioHorizonM`,
which the app already quotes to users.

1. In the file step-001 used, add one test: on a flat plane, mast at
   `ANTENNA.heightLimitsM.min`, terminal on the ground, take
   `d = radioHorizonM(h, 0)` (from `src/propagation/rf.js`) and assert a link at
   `1.2 * d` reports `worstExcess > 0` while a link at `0.8 * d` reports
   `worstExcess < 0`. Build the field `2.5 * d` across so it contains the link. Comment
   that the horizon and the profile are one geometry seen two ways - which is why this
   is an invariant and not a golden number.
2. Add the flat-earth control: the same long link with `kFactor: 0` (which makes
   `earthBulgeM` return 0) must be clear. This fails loudly if someone "fixes" the sign
   by deleting the bulge term.
3. Verify: the file green, then the whole unit suite.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Step-001 had already grown most of this shape, so this step added the part that was
  missing rather than a duplicate: `los: the radio horizon is exactly where the ray
  starts to graze the ground`, over three height pairs including the one the app quotes
  (10 m mast, `RF.fresnelRxHeightM` terminal).
- The identity is better than expected: at exactly `radioHorizonM(h1, h2)` the walked
  profile reports `worstExcess` of 0.000 / -0.000 / -0.000 m for the three pairs, so the
  assertion `|worstExcess| < 0.02` is not a fudge factor but the tangency, with the
  sample-spacing miss bounded quadratically (miss^2 / (2 k R), about 1e-5 m here).
- Measured excess at 1.3x the horizon, which also shows where the tangency sits:
  0.5/0.5 m -> +0.345 m at mid-path; 0.5/4 m -> +1.094 m at 5.4 km of a 14.9 km path
  (nearer the low end); 10/4 m -> +4.459 m at 16.2 km of 28.5 km. The block always
  begins nearer the lower antenna, which is worth remembering for HUD wording.
- `hasLineOfSight` is asserted alongside the profile so the public helper cannot drift
  from the profile it wraps, and each pair keeps a `kFactor: 0` control.
- `tests/unit/raycurvature.test.js` is now 168 lines and holds the whole convention.
