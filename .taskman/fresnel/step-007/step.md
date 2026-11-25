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
