# step-012 - split `tests/unit/state.test.js` (358 lines) on its own seams

**Status**: done

## The seam the file already had
It held four subjects, not two: the reducer's patch contract, the recomputation bookkeeping, the
presets, and the generated panel. Cutting it in half by line count would have put presets next to
path helpers, so it went into four files by subject:

| file | lines | tests | subject |
| --- | --- | --- | --- |
| `tests/unit/state.test.js` | 218 | 13 | initial state, patch reporting, clamp/reject, steps, nesting, immutability, unknown keys, relocation bounds, unfulfillable requests, panel defaults |
| `tests/unit/statechanges.test.js` | 67 | 4 | `impactedStages`, `diffStates`, path helpers, what a site move dirties |
| `tests/unit/presets.test.js` | 51 | 2 | presets apply as patches, presets differ visibly |
| `tests/unit/panel.test.js` | 86 | 3 | panel rows match `STATE_FIELDS`, controls mirror catalogue limits, placement group rows |

`panel: no default sits outside the bounds of its own control` stayed in `state.test.js`, where
GUIDELINES §4 points at it by name and where the plan asked for it: what it checks is a reducer bound
colliding with the DOM's sanitising behaviour, which is the story the seed-swallowing note tells.
The doc sentence still resolves.

## Split performed mechanically, then verified mechanically
A script cut the original file on `test(...)` block boundaries and regenerated each file with only the
imports its own body uses - because hand-copying blocks is how assertions quietly disappear.

Two bugs in my own generator, both caught before committing:
1. Imports were computed before the shared `const initial = createInitialState();` line was appended,
   so `presets.test.js` and `statechanges.test.js` got the const without the import:
   `ReferenceError: createInitialState is not defined`.
2. The `specFromPanel` helper sits between two tests and my "carry the preceding gap" rule attached it
   to the *following* test - so it landed unused in `state.test.js` while the panel test that calls it
   lost it: `ReferenceError: specFromPanel is not defined`. Moved to `tests/unit/panel.test.js`, next
   to its only caller.

Verification that nothing was altered in the move, comparing `git show HEAD:...` with the four new
files: test names **22 == 22, identical set**; assertion lines 159 before, and after the same 159 plus
exactly 3 duplicated `import assert` lines and 2 comment lines from my new headers that happen to
contain the word "assertion". Nothing lost, nothing added.

## Verification
`node --test tests/unit/state.test.js tests/unit/statechanges.test.js tests/unit/presets.test.js tests/unit/panel.test.js`
-> 22 pass, 0 fail · `node tools/lint.js` now reports **4** violations, and `state.test.js` is no
longer one of them (the other four are this task's remaining steps).
