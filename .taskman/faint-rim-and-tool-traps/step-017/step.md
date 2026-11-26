# step-017 - full verify, doc claims re-checked, task closed

**Status**: done

## Clean room first
`staticserver.js status` -> `stopped`, `browser.js status --all` -> nothing running, no listeners on
8080 or 81xx. The mid-task accident where `staticserver.js --prob 8123` (a typo *this step's own
family of bug*) left a foreground server until my shell's timeout killed it is recorded in step-009.

## Gates, verbatim
```
$ node tools/vendor.js
vendor ok - three 0.187.0, three.module.min.js 732 KiB, license + notice present

$ node tools/lint.js
lint ok - 45 src, 15 tools, 38 tests file(s)

$ npm run test:unit
all 26 test file(s) passed in 16092 ms

$ node tools/timebox.js -t 990 -- npm run verify
...
all 36 test file(s) passed in 113638 ms
timebox: npm exited 0 in 117.0s
```
The counts reconcile: lint weighs 38 files under `tests/`, of which 36 are `*.test.js`
(26 unit + 10 browser) and 2 are harness modules (`app.js`, `colour.js`).

Against the previous task's close (**78.5 s** for 26 test files), the suite is **113.6 s** for 36.
This task added `rim.test.js` (measures the drawing buffer) and `browsercli.test.js` (drives the real
CLI in a real Chromium), and the splits added four unit files - four more module loads, no new
computation in the split files themselves (`coverageshadow.test.js` re-runs one `computeCoverage`
fixture, 566 ms for the pair).

## Claims this task could have made stale, re-checked against the code
- `grep -rn "noLinkAlpha\|faintLightnessShift\|faintChromaKeep\|FAINT_CHIP" README.md GUIDELINES.md`:
  GUIDELINES lines 195, 376, 464, 469-470 quote 0.57, 0.88, shift 38, pivot 55, chroma 0 and the 13.1
  floor - identical to `src/config.js` lines 161-163 and `src/palette.js`. No `src/` file changed
  after step-006, so the rim numbers in README (canvas p05 11.4, median 15.5) still describe the
  shipped build; the final browser run re-passed `rim.test.js` and printed those numbers again.
- **GUIDELINES §4** now says the budget is measured by both lint and the architecture test, and
  records what each used to cover - the paragraph used to state a rule nothing enforced for `tests/`.
- **GUIDELINES §10**'s command table row for `eval`/`shot` is corrected (they drive the open page;
  `--url` opens one; `shot [OUT]`), and a new paragraph states the two contracts this task installed:
  drive-the-page-you-opened-or-refuse, and no tool reads an argument it was not given, with the four
  concrete misbehaviours named.
- §9's three DOM claims and the canvas-read-back rules name `rim.test.js`, the About dialog and
  `describeEarth()` - all still true after the splits; nothing there pointed at a file that moved.
- Deliberately **not** rewritten: the legend assertions in the closed `stepped-coverage-colours`
  task record still name `interaction.test.js`, and GUIDELINES' example command still uses that file.
  Both are true statements about history and a valid example respectively; step-013 logs the move.
- Superseded figures in this task's own Comments (alpha 0.50 / shift 30 -> 10.0 and 11.2) are kept
  and explicitly marked as the decision as it was made, with what shipped beside them.

## Closure
`## Result` appended to `task.md`: the six-row bug -> fix -> guard -> measured table, the verbatim
gates, the suite-cost comparison, the superseded-numbers note, and five items **not fixed with
reasons** - the palette-vs-canvas colour-space gap (with the crimson triple that proves it), the
one-cell boundary fade, the pivot discontinuity, `usage()` writing refusals to stdout, and
`vendor.js`'s own better unknown-command message.
