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
