# step-016 - split `tests/unit/architecture.test.js` (331 lines), lint green at budget

**Status**: done

## The seam
Rules about `src/` versus rules about `tools/` - which is also the seam the file's own imports show,
since half its tests walk `PATHS.tools`/`PATHS.tests` and half walk the `src` module graph.

| file | lines | tests |
| --- | --- | --- |
| `tests/unit/architecture.test.js` | 281 | 17 - layer table, line budget for `src/`, three.js behind the adapters, no dependencies, vendor auditability, web root, licence, bare specifier, imports resolve, no cycles, config central, one dice roll, no hard-coded design ids, quiet code, doc comments |
| `tests/unit/architecturetools.test.js` (new) | 75 | 3 - `TIMEOUTS` declared in config and actually used by the tooling, `tools/` + `tests/` budgets and no cycles into `src`, package.json exposes the documented commands |

`packageJson` is the one fixture that appears in both files (the npm-scripts test moved, but
`architecture.test.js` still reads it for the licence/vendor tests) - the equivalence check reports
265 -> 266 code lines with **nothing lost** and that single duplication.

## Result: the budget rule is now true of the whole repository
```
$ node tools/lint.js
lint ok - 45 src, 15 tools, 38 tests file(s)
```
That is the first green lint since step-011 turned the measurement on, and it is the task's stated
expected result: every file inside the budget the guidelines declare, with the budget enforced rather
than asserted. The red list step-011 recorded - 358, 344, 337, 335, 327/331 - is empty, cleared one
file per step across 012-016.

## Verification
`node --test tests/unit/architecture.test.js tests/unit/architecturetools.test.js` -> 20 pass, 0 fail
(17 + 3, matching the 20 tests the file had before the split) · `node --check` both files ·
`node tools/lint.js` exit 0 · code-line multiset: nothing lost, one intentional fixture duplication.

## Deviation from the plan
The plan expected the moved half to be "the tool-CLI and TIMEOUTS-usage assertions". The tool-CLI
assertions (`--help` on every CLI, refusal of unread arguments, the harness option guard) had already
gone to `tests/unit/tooling.test.js` in steps 009-010, so what remained to move were the three tests
above. `architecturetools.test.js` is therefore smaller than the plan imagined, and
`tooling.test.js` (246 lines, inside budget) holds the rest - both names still describe their
contents honestly.
