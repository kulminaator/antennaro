# step-014: README: the corrected curvature story and the new model notes

## How to perform this step

1. Rewrite "The earth is round, and now it says so" around the step-004 and step-013
   measurements. The old claim - that coverage is never ended by curvature inside this
   map, demonstrated on a flat plane with the lowest mast - must be replaced by what the
   model now reports, including whether that flat-plane extreme is now horizon-limited
   and what the HUD says about it. Keep the section's tone: the app reports what it
   measured and does not stage drama.
2. Update "What the numbers mean" on terrain shadowing to describe the model as it now
   is: multi-edge (Deygout over the sampled profile), a shadow that starts at 0 dB and
   passes about 6 dB at the shadow line, and the refinement that keeps narrow crests from
   being invisible.
3. Update "What this does not model": multi-point and terrain-reflected models are still
   absent, but "beyond the single knife edge" is no longer true - say what remains
   (reflections, urban models, vegetation, ducting, clutter as one slider).
4. Correct every number in those sections to the step-013 measurements, including the
   legend counts quoted in "What you see" and the HUD sentences quoted in the curvature
   and colour sections; quote each with the configuration it was measured in.
5. Verify `node tools/lint.js`, then re-read the changed sections end to end for claims
   that no longer match the code.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
