# step-012: README: re-measure and rewrite the colour story

## How to perform this step
1. Re-measure what the README quotes, with a scratch script in `.tmp/`: the per-step cell counts and
   percentages on the default scene and each preset at the new thresholds; the loudest configuration's
   counts; the legend totals. Quote each number with its configuration.
2. Rewrite these places (found by `grep -n "gradient\|bands\|pink\|amber" README.md`): the title
   caption, the "What you see" legend paragraph, the legend walkthrough (four named steps), the
   Display control row, the URL table's `view` values (`steps`, `zone`, plus a note that
   `bands`/`gradient` still resolve), the "What the colours can mean" table and its two-image pair
   with the new counts (the old claim was that the bands painted 816 of 836 cells one colour - say
   what the new steps do instead, with numbers), and the Fresnel caption that says amber.
3. Keep the honest structure: absolute scale, why it is not normalised, and why four steps rather
   than five (measured separation ceiling).
4. Verify: `grep -n "gradient\|pink\|amber" README.md` returns only sentences that are true of the
   new picture; every number in the colour sections was produced by the step's own script.

## Expected result
README describes the four steps with re-measured numbers and no stale colour claims.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->
