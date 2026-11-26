# step-015: GUIDELINES: the chord convention, the onset, multi-edge, refinement

## How to perform this step

1. In section 7, rewrite the bullet "The earth is round and the app says so" to state the
   convention that was wrong: the terrain is planar, the equivalent round earth lowers the
   ray, both ray ends stay anchored because the bulge is 0 there, and the sign is pinned
   by a test that compares the profile with `radioHorizonM` under a `kFactor: 0` control.
   Replace "coverage is never ended by curvature" with the re-measured finding.
2. Add a bullet on the diffraction model: the shadow starts at 0 dB and reaches about
   6 dB on the shadow line because the loss is charged from the signed Kirchhoff
   parameter, valid to v = -0.78; Deygout accumulation over the sampled profile with
   `RF.diffractionEdgeLimit`; and the refinement pass with the measurement that forced it
   (54 m spacing, a narrow crest between samples charges 0 dB against 11.2 dB).
3. Add the new config keys to section 4 (`RF.profileRefineSamples`,
   `RF.profileRefineSpanFactor`, `RF.diffractionEdgeLimit`, plus anything else these
   steps introduced), each with the measurement that fixed its value.
4. Keep the existing rule that neither ray end may be the obstacle, and check that the
   sentence about *Terrain shadowing (diffraction loss)* still describes what that switch
   does after these changes.
5. Verify `node tools/lint.js`, then read both changed sections in full once.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

## Step comments

- **`RF.profileRefineSamples` and `RF.profileRefineSpanFactor` were never added, and item 3 of
  this step is written against what shipped instead.** The refinement pass died in step-009
  when it was measured; the sampling rule that replaced it is `pathSamples()` in `rf.js`
  (one sample per terrain cell) with `RF.profileMaxSamples` demoted to a ceiling. Section 4 now
  names `RF.profileMaxSamples`, `RF.diffractionEndpointGuard`, `RF.diffractionNearEndM` and
  `RF.diffractionEdgeLimit`, each with the measurement that fixed it, and section 7's new
  shadow bullet carries the reasoning that does not fit a config comment.
- `KIRCHHOFF_FIT_FLOOR_V` joined `PATTERN_FLOOR_DB` and `NEAR_FIELD_SKIP_FACTOR` in the
  "declared next to the maths" paragraph - and that paragraph's "neither is a magic number"
  became "none is", which is what happens when a rule of two becomes a rule of three.
- The curvature bullet is retitled **"The earth is round, and the ray bows *down*"** and now
  states the planar-datum convention as an explicit formula (`rayY = lerp - bulge`, minus,
  always) because a sign is not a style. The old "coverage is never ended by curvature" is
  kept as one half of a two-half finding, with the 2232-cell result at 0.5 m and the
  `groundHorizonM` / HUD-clause consequence of step-014.
- The "54 m apart, 0 dB against 11.2 dB" figure is quoted *with its caveat*, because
  step-009's own notes record that it was measured under the pre-step-007 charging rule;
  GUIDELINES should not launder a superseded number into a current one.
- Section 7's diffraction bullet now states the two things that were assumed and are false:
  that the sum is monotone in a near screen (it is not, 13.31 dB against 9.99 dB), and by
  implication that any single-screen model would be safer (Bullington is non-monotone and
  non-reciprocal by 3 dB).
- `node tools/lint.js` green. Both changed sections read end to end; the only claims in them
  not re-measured here are the ones step-013/step-014 measured and recorded.
