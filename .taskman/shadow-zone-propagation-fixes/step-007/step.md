# step-007: charge diffraction from the signed obstruction, so the shadow starts at 0 dB

## How to perform this step

`profileObstructionDb()` returns 0 dB for any ray that misses the ground, so the loss
jumps 0 -> 6.03 dB the centimetre the ray touches. The closed form already handles the
approach: it is valid down to v = -0.78 and returns 0 below that.

1. In `src/propagation/los.js`, make `profileObstructionDb(profile, freqHz)` evaluate the
   knife-edge loss from the *signed* `profile.worstExcess` instead of bailing out at 0,
   and let `diffractionLossDb` clamp what it already clamps (`v < -0.78` -> 0 dB). Keep
   the reason for the old bail-out visible in the comment: 6 dB at exactly v = 0 is right
   for a grazing ray and was being charged to rays nowhere near the ground; the signed
   parameter fixes that by construction rather than by an early return.
2. Declare the -0.78 validity bound next to the maths, named and commented as the limit
   of the Lee/Maqsood fit - the manner GUIDELINES 4 allows for `PATTERN_FLOOR_DB`. Not in
   `src/config.js`.
3. Add unit tests (in `tests/unit/propagation.test.js`, or the file step-001 created):
   - continuity: loss at `worstExcess = -epsilon` and `+epsilon` differ by less than
     0.1 dB and each is within 0.1 dB of `diffractionLossDb(0, d1, d2, freqHz)`;
   - the deep-clear case is still exactly 0 dB (worstExcess far beyond the -0.78 bound);
   - monotonicity in `worstExcess`, sampled every metre from -60 m to +60 m.
4. Verify that file green, then `npm run test:unit` - coverage numbers move slightly,
   because near-grazing cells now pay a little.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
