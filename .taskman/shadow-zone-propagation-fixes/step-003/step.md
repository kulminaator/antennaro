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
