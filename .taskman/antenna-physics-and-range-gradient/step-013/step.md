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

- `useDiffraction` is now labelled **`Terrain shadowing (diffraction loss)`** with the hint
  `Off: the signal level ignores the ground - free space over a flat earth, useful as a
  reference. The Fresnel-zone verdict is still walked over the real terrain, curvature
  included, so a zone cut keeps being reported.`
- **Deviation from this step's text, on purpose:** it suggested
  `Terrain shadowing (diffraction and horizon)`. The second half would have been a lie:
  with the switch off, `coverage.js` still calls `tracePath()` and only discards
  `traced.obstructionDb` (`obstruction = useDiffraction ? traced.obstructionDb : 0`), so the
  zone walk - horizon and curvature included - keeps happening. Naming the control after
  something it does not change is the kind of wording this task exists to remove.
- New test `coverage: switching the terrain off for dB does not flatten the earth for the
  zone`, in `tests/unit/coveragebehaviour.test.js` (288 -> 334 lines), pinning both halves:
  - every walked, non-dismissed point has `obstructionDb === 0` with the switch off, and the
    test first proves the same sweep *does* shadow something (`shadowed > 0`, plus
    `asked > 100`, so it cannot pass on an empty grid);
  - `fresnelClearance` and `fresnelClear` are **identical** between the two runs, point for
    point - the switch cannot move the reliability verdict;
  - and the verdict that survives is the curved one: over a perfectly flat plane the only
    thing that lifts a ray off the ground is the bulge, so `fresnelStatus` with the default
    `kFactor` is compared against the same walk with `kFactor: 1e12` (a curve too small to
    matter). Measured on a 3.6 km grazing path: **0.2283 against 0.1559 zone radii** - the
    standard atmosphere lifts that ray by a tenth of a zone radius, which is worth two
    decimal places of argument.
- Live check of the panel through `window.__sim` + the rendered DOM (port 8080): the control
  reads `Terrain shadowing (diffraction loss)`, `session.errors()` empty. Server and browser
  stopped afterwards.
- `npm run test:unit` all 13 files pass (33 tests in `coveragebehaviour` + `state`);
  `npm run lint` ok. No test quoted the old label, so nothing else needed touching; no
  behaviour changed, only words and a new proof.
