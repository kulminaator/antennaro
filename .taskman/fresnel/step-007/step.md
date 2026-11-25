# step-007: split the controller: carve out the coverage/RF seam (no behaviour change)

## How to perform this step

`src/app/controller.js` is at 349 of the 350-line budget (GUIDELINES.md §3), so the
Fresnel wiring cannot be added to it. Carve the coverage/RF reporting seam out first,
as a pure refactor: same behaviour, same public methods, smaller controller.

1. Read `src/app/controller.js` and identify the coverage/RF block: `recomputeCoverage`,
   the `coverageStats`/`antennaSummary`/`rf`-shaped reporting and the pixel/summary
   helpers that only assemble numbers (confirm with `git diff --stat` afterwards that
   the moved code is the moved code).
2. Move that block into a new module (e.g. `src/app/reports.js`, L5 composition,
   registered in `LAYER_TABLE` if a new pattern is needed) that takes
   `{ getState, getModel, getField, getSite, getCoverage }` accessors and returns the
   summary functions the controller used to expose. No state, no DOM, no three.js.
3. The controller keeps orchestration (stages, dirty flags, actions, meshes) and calls
   into the new module.
4. Verify: `npm run lint` ok (line budgets, layer table, reachability, no cycles);
   `npm run test:unit`; `node tools/test.js --browser --only tests/browser/app-boot.test.js`
   and `tests/browser/interaction.test.js`. `wc -l src/app/controller.js` must leave
   real headroom (aim <= 250) - the point is to make room, not to move the problem.

## Expected result

The controller delegates its coverage/RF reporting; behaviour is unchanged and every
suite that passed before still passes, with line budget to spare for step-008.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Split outcome: `controller.js` 349 -> 295 lines, two modules out:
  - `src/app/reports.js` (111 lines) owns the coverage recompute - which is the only
    place `computeCoverage` is called - plus `coverageStats`, `antennaSummary`, `rf`
    and `sceneInfo`. It keeps one piece of data: the last coverage result.
  - `src/app/actions.js` (80 lines) owns the `action()` switch. `savePng` stayed in
    the controller (only it can reach the canvas) and is injected.
  - 295 rather than the 250 the step asked for, because the remaining lines are the
    stage machine, the meshes and the relocator wiring - moving those would move the
    problem rather than the code. 55 lines of headroom is what step-008 needed.
- `architecture.test.js` pins "exactly one `Math.random` in src/, in
  `src/app/controller.js`". The dice roll moved with the action it belongs to, so the
  test now pins `src/app/actions.js` and additionally asserts the roll sits next to
  `case 'new-seed'`. A test that names a *file* instead of an *invariant* has to be
  told when the code moves house; the invariant (one roll, deliberate) is unchanged.
- Dropping `resolveFrequencyHz` from the controller's import list while moving `rf()`
  out broke the app in the browser only: unit tests stayed green, and the page died at
  boot with `resolveFrequencyHz is not defined`. The boot browser test caught it in
  25 s of timeout, which is what it is for. When a refactor moves the last use of an
  import, grep for the symbol after removing it, not before.
- The browser suite hung for 18 minutes once, with the same 25 s timeouts everywhere,
  while a `--name dbg` browser from a manual probe was still running. `browser.js
  stop --all` and it ran clean in 39 s. Check for orphan browsers before believing a
  hang.
- Behaviour check: `npm run test:unit` (10 files) and `node tools/test.js --browser`
  (3 files, 21 tests) both green; `coverage()` still returns the same grid because the
  recompute reads its options from `getState()` exactly as before.
