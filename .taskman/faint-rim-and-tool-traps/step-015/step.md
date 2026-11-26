# step-015 - split `tests/unit/coveragebehaviour.test.js` (335 lines)

**Status**: done

## The seam the file actually had
The plan proposed "pre-filter / budget-exclusion proofs versus mast-height and earth-hiding tests",
but that seam does not exist in this file: those tests are elsewhere, confirmed by grep -

| quoted test | file |
| --- | --- |
| `coverage: the budget pre-filter cannot move the link boundary` | `tests/unit/coverage.test.js` |
| `coverage: no preset is cut off by our own limits` | `tests/unit/coverage.test.js` |
| `coverage: the earth is never what ends the coverage inside this map` | `tests/unit/curvature.test.js` |
| `coverage: the earth does hide part of this map, from the mast height ...` | `tests/unit/curvature.test.js` |

What this file really holds is "what the radio configuration does to the served ground" versus "what
the ground and the curved earth do to it", so it split that way:

| file | lines | tests |
| --- | --- | --- |
| `tests/unit/coveragebehaviour.test.js` | 188 | 7 - aiming, power/receiver/clutter, RSSI falloff, downtilt, frequency, pointing at the sky, determinism |
| `tests/unit/coverageshadow.test.js` (new) | 191 | 4 - the wall that blocks a bearing, shadowing switched off, how much round earth the sweep walked, terrain-off-for-dB must not flatten the earth for the zone |

`coverage: switching the terrain off for dB does not flatten the earth for the zone` is the one test
this file contributes to README (line 550, with its 0.228 vs 0.156 first-zone radii). README quotes it
**by name, not by file**, and the name is unchanged, so the reference still resolves - now into
`coverageshadow.test.js`, which is the honest home for it.

The split script (`.tmp/split-tests.py`, now reusable) distributes module-level fixtures by usage
rather than by position - the step-014 lesson.

## Third bug of this family, again caught by running the tests
The script decided whether an import was needed with
`spec_line.split('from')[0]`. For `import { fromCompass } from '../../src/math/vec3.js';` the string
`from` occurs *inside* `fromCompass`, so the symbol list came out empty and the import was dropped:

```
✖ coverage: a direction that points at the sky serves nobody
  ReferenceError: fromCompass is not defined
```
Fixed to read the braces with a regex. Regenerated from the pristine file (`git checkout`) rather than
patching the damaged output, so nothing else could be quietly half-migrated.

## Deliberate duplication, measured
The equivalence check reports 253 -> 264 code lines with **nothing lost** and 11 lines "gained":
`freqHz`, `field`, `site`, `omni()`, `baseCoverage`, `map`, `mapSite` exist in both files.

That is fixtures, not logic. Each test file builds the world it asserts about instead of importing a
shared mutable fixture it could silently perturb; the alternative - a fixtures module - would couple
two files that ask different questions. The cost is one extra `computeCoverage` over the same 81x81
field: both files together run in **566 ms**, so the duplication is cheap and I am keeping it. (The
colour ruler went the other way in `tests/harness/colour.js` because that is an algorithm whose
correctness the tests depend on - duplicated maths drifts, duplicated fixtures do not.)

## Verification
`node --test tests/unit/coveragebehaviour.test.js tests/unit/coverageshadow.test.js` -> 11 pass,
0 fail, 566 ms · `node tools/lint.js` down to **1** violation: `architecture.test.js` (327), which is
step-016 · `node --check` on both files.
