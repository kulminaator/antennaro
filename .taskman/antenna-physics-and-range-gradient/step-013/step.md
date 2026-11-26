# step-013: name what "terrain shadowing off" really means, and prove the zone walk still bows

## How to perform this step

1. Read the current `useDiffraction` field in `src/app/fields.js`. With shadowing off the
   sweep skips the ray walk entirely, which means the ground neither costs dB **nor** hides
   the horizon - i.e. it silently becomes a flat earth. Keep that behaviour (a free-space
   mode is useful and cheap) but rename the label to say what it is:
   `Terrain shadowing (diffraction and horizon)`, and rewrite the hint so it states that
   switching it off is free space over a flat earth, and that the *Fresnel zone verdict* is
   still walked against the real ground.
2. Prove the second half of that claim in `tests/unit/coveragebehaviour.test.js`: run the
   same configuration twice, once with `useDiffraction: false`, and assert that
   `obstructionDb` is 0 everywhere while `fresnelClearance` is **not** the flat-earth
   answer - specifically that on a grazing path over the bumps the clearance ratio differs
   from the same walk with `kFactor` set absurdly large. If the assertion cannot pass,
   that is a real finding: record it here and write the hint to match what the code
   actually does.
3. Verify: `node tools/timebox.js -t 300 -- node --test tests/unit/coveragebehaviour.test.js
   tests/unit/state.test.js` green (the state test asserts control labels/hints in places -
   update it only if it quotes the old label) and the hint text in the step comments.

## Expected result

No mode quietly pretending the earth is flat: the switch is named for what it changes,
and the walk that still happens is pinned.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
