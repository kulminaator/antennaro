# step-011 - the 320-line `tests/` budget becomes a rule the tools enforce

**Status**: done

## What was actually unenforced
`LINE_BUDGET` in `tools/lib/arch.js` declares `src/ 350`, `tools/ 430`, `tests/ 320`, and GUIDELINES
states all three. Enforcement was narrower than the table:

- `tools/lint.js` measured sizes **inside `checkModules`**, and `checkModules` only ever received
  `srcFiles.map(readModule)`. Proof, not inference: a 500-line file dropped into `tools/` printed
  `lint ok - 45 src, 16 tools, 31 tests file(s)` and exited 0.
- `tests/unit/architecture.test.js` did enforce `tools/` - in a test called *"tools and tests have
  their own budgets and no cycles into src"*, whose tests half was missing. The name overclaimed.

So `tests/` was unenforced everywhere, and `tools/` was enforced only by the test suite, never by
lint - contrary to what this task's brief assumed.

## What changed
- `tools/lint.js`: `checkFileSizes(files)` walks the same three trees `checkSyntax` already walks,
  measures each file against `lineBudgetFor(relative)` and adds a `file-size` violation naming the
  file, its line count and the budget. The duplicate size check inside `checkModules` is removed, so
  size has exactly one owner, and a note reports the measurement:
  `note: line budget: 91 file(s) measured, 5 over`.
- `tests/unit/architecture.test.js`: the budget loop now covers `[...walk(PATHS.tools), ...walk(PATHS.tests)]`;
  the node-built-ins-only rule stays tools-only. With the tests half added, the test name is finally
  true. (This edit grew that file to 331 lines - it is on the red list and step-016 splits it.)

## The red list, measured, as this step intends
`node tools/lint.js` - 5 violations, exit 1, nothing else reported:

| file | lines | budget |
| --- | --- | --- |
| `tests/unit/state.test.js` | 358 | 320 |
| `tests/browser/interaction.test.js` | 344 | 320 |
| `tests/unit/coveragebehaviour.test.js` | 335 | 320 |
| `tests/browser/reach.test.js` | 337 | 320 |
| `tests/unit/architecture.test.js` | 331 | 320 |

`tests/browser/interaction.test.js` is 344, not the 338 the task brief recorded: it grew when
step-003 added the legend assertions. The budget is not being raised to make anything fit.

Steps 012-016 clear this list one file at a time. Until then `npm run verify` is red by design, and
this step's commit is where it turns red - a runner that reports the real state is the point of the
step, so the red is the result, not a regression.

`tests/unit/architecture.test.js` fails its own budget test with
`tests/browser/interaction.test.js: 344 lines > budget 320` - the suite now disagrees with the repo
in exactly the same places lint does, which is the agreement this step was for.
