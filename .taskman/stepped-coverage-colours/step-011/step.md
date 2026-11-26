# step-011: run every gate and fix what breaks

## How to perform this step
1. `node tools/lint.js`, then `npm run test:unit`, then the browser suite as documented in
   GUIDELINES section 9 (detached server, timeboxed, server and browsers stopped afterwards).
2. Fix every failure at its cause. If a documented number elsewhere in the repo (README,
   GUIDELINES, a test comment) is now stale, do not fix it here - note it for step-012/013 in the
   task comments.
3. Verify: all three gates green, `git status --porcelain` shows only intended files, and no stray
   `staticserver`/browser processes are left.

## Expected result
Lint, unit and browser gates are green with the new palette wired end to end.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->

- `tests/browser/fresnel.test.js` walks `steps -> zone -> steps` (three readings, not four) and
  still demands that the return visit restores the frame exactly and that the coverage
  statistics do not move between views. `tests/browser/interaction.test.js` gains
  "the legend says what the map is painted with".
- That legend test is the second browser test allowed to read the DOM instead of `window.__sim`
  (the About dialog in `app-boot.test.js` is the first), on the same grounds: the legend's words
  exist nowhere else. It asserts the step names, the swatches as the browser writes them back
  (`rgb(255, 240, 70)` etc.), the three alphas - 1 for a working link, `RF.noLinkAlpha` for the
  rim, 0 for ground nobody asked about - that all four steps are populated on the default map,
  that the rows sum to `walkedCells + budgetExcludedCells` in both views, and that no zone row
  wears a signal colour.
- My own error, caught by the run: `__sim.coverage()` returns `coverage.stats`, so the row sums
  are `coverage.walkedCells`, not `coverage.stats.walkedCells`.
- interaction 11/11 (18.9 s), fresnel 7/7 (12.3 s).
