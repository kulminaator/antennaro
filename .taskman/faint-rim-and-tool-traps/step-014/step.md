# step-014 - split `tests/browser/reach.test.js` (337 lines): reach versus what stops it

**Status**: done

## The seam
"How far does it reach?" and "what truncated it?" were interleaved in one file. Six of the eight tests
were about the second question, so they moved:

| file | lines | tests |
| --- | --- | --- |
| `tests/browser/limit.test.js` (new) | 231 | 6 - far edge is the link not the map/cap, low mast names which won, study range binds only when asked, never-asked ground is not painted, sweep walks the whole map, work area wider than the map |
| `tests/browser/reach.test.js` | 133 | 2 - gain becomes range as the budget says, five designs reach in gain order with none exceeding its own beam |

The plan offered either direction for the naming; `limit.test.js` is the honest one because the moved
tests each name a binding limit in their assertions (`limitingFactor`, `clippedByRangeCells`,
`budgetExcludedCells`), while the two that stayed assert a gain-to-range relationship.

## Two mistakes my own split script made, both found before committing
1. **The preamble was silently dropped.** The script rebuilt each file from its test blocks only, so
   the three module-level constants that sat above the first test - `DESIGNS`, `WESTERN_FIELD_X`,
   `sector` - disappeared from the repository entirely. `limit.test.js` failed at once with
   `ReferenceError: WESTERN_FIELD_X is not defined`; `reach.test.js` would have failed the same way on
   `DESIGNS` had I run it first. All three restored into the file that uses them (`DESIGNS` →
   reach, `WESTERN_FIELD_X` + `sector` → limit), so nothing is shared and nothing is duplicated.
2. **My verification was too weak to see it.** The step-013 check compared multisets of *assertion*
   lines, which said 68 → 68 identical while three lines of executable code were gone. The check is
   now multisets of **all code lines** (imports and comments excluded): 250 → 250, **identical,
   nothing lost, nothing gained**. That is the version used from here on.

A cosmetic defect in the generated headers (a blank line before the closing `*/`) was also fixed.

## Verification
`node tools/test.js --browser --only limit` -> 6/6 in 6.3 s · `--only reach` -> 2/2 in 2.2 s ·
`node tools/lint.js` down to 2 violations (`coveragebehaviour.test.js`, `architecture.test.js`) ·
code-line multiset identical to `git show HEAD:tests/browser/reach.test.js` + the new file.
