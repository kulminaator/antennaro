# step-007: `presets.js`: retune so every preset still ends at its own link

## How to perform this step

1. Read `src/app/presets.js`, then measure the five presets with
   `node tools/timebox.js -t 200 -- node .tmp/preset-probe.mjs` (rewrite that probe if it
   has drifted: apply each preset through `applyPreset`/`createInitialState`, compute
   coverage in Node, print `linkedCells`, `maxLinkedRangeM`, `budgetRangeM`,
   `limitingFactor`, clipped counts).
2. The gains that moved are the biquad (-4.3 dB at defaults) and, slightly, the Yagi and
   the patch. Where a preset's story is now wrong - `bumps-hills` claimed 3.05 km of
   budget for a biquad that no longer has it - re-tune the *radio* (`txPowerDbm`,
   `rxSensitivityDbm`) so the scenario still ends at its own link with
   `limitingFactor: 'budget'` and zero clipped cells, and rewrite the preset's `description`
   string to the new story. Do not touch the terrain or the site to dodge a physics change.
3. If the biquad preset can no longer tell its "gain helps, grazing rays do not" story,
   keep the story and change the numbers, not the other way round; say in the step comments
   what the new margin between budget and last link is.
4. Verify: `node tools/timebox.js -t 200 -- node --test --test-reporter=spec
   tests/unit/coverage.test.js` - `coverage: no preset is cut off by our own limits`
   green - and the probe table (all five `limitingFactor: budget`, no clipped sectors) in
   the step comments.

## Expected result

Every preset's picture still ends where its own link ends, with the changed gains
absorbed honestly rather than by moving the map.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
