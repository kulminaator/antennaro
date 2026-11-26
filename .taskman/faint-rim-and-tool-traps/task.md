# Task: the faint rim is invisible, and four tools say nothing when you misname an argument

## Description

Four bugs found while working on the stepped coverage colours, all confirmed by measurement or
by a tool run that should have failed and did not.

**1. The faint "asked and lost" wash cannot be seen on much of this map.** `RF.noLinkAlpha` is
0.22 and the wash colour is fixed (`COLOURS.noLink` `#2a2f38`), so the cell is 22 % wash over
the ground it sits on. Measured worst of four simulated eyes over the terrain ramp, darkened
as shadows darken it: **1.4 CIEDE2000** from the bare ground it replaces - and the alpha is the
reason, not the hue: with a lightness-push colour rule the ceiling at alpha 0.22 is still only
4.2, because the eye only sees `alpha` of the vertex colour. The consequence is a honesty bug,
not a style one: the README claims the faint rim shows "the reach the terrain actually allows",
and on dark or shadowed ground (`#213d33`: 1.5) there is no rim to see. Both coverage views
have it: the zone view paints unlinked cells with zone colours at the same 0.22. Fix: raise the
faint alpha and give the faint cells a colour rule that moves the *ground they sit on*
(dark ground lifted, bright ground pressed down, chroma taken out) rather than a fixed hue the
ground can match. The frontier is measured in step-001; the two bars (visible against the
ground, still clearly not a signal step) cannot both be met at high values - a fixed translucent
fill over an unknown backdrop has a hard ceiling (12.0 against ground costs 11.7 against the
painted cells at alpha 0.6) - so the step picks the point and records what it gave up.

**2. `tools/browser.js eval` and `shot` evaluate `about:blank` in secret.** Both do
`const url = flags.url ? String(flags.url) : 'about:blank'` and then `openPage`, which always
creates a *new* target. So `open <url>` followed by `eval 'window.__sim.state()'` answers
`undefined` about a blank page it made itself, which cost two detours this session. `shot`
likewise screenshots `about:blank` when `--url` is missing, and ignores a positional output
path (`shot out.png` silently produces `.tmp/artifacts/shot-<ts>.png` instead).

**3. `tools/test.js` ignores arguments it does not read.** `node tools/test.js browser
interaction` - the natural way to say "run that browser test file" - parses into `_` which
`main()` never looks at, so it runs the *unit* suite and reports 20 files passing. Every tool
except `vendor`/`timebox`-style positional users shares `parseArgs`, which collects positionals
and lets each tool ignore them; the tools do not say so. Same family inside the test harness:
`createAppSession({ url })` (the option is `query`) is ignored, so the session boots the default
page and the test times out ~30 s later blaming the app.

**4. The declared 320-line `tests/` budget is not enforced anywhere.** GUIDELINES says
"Line budgets: 350 lines in `src/`, 430 in `tools/`, 320 in `tests/`", and `LINE_BUDGET` in
`tools/lib/arch.js` declares it, but `checkModules` walks only `src/` and the architecture test
walks only `tools/`. Five test files are already over: `state.test.js` 358,
`interaction.test.js` 338, `reach.test.js` 337, `coveragebehaviour.test.js` 335,
`architecture.test.js` 327. Fix by making the rule live and honouring it - not by quietly
raising or deleting the number.

Finished means: the faint rim visible everywhere on this map with both bars quoted, the two
CLI traps refusing to do something surprising, unknown options rejected by the harness, lint
and the architecture test enforcing the tests/ budget with every file inside it, and
`npm run verify` green.

## Steps

1. step-001 - measure the alpha/colour frontier and choose the faint rule
2. step-002 - `palette.faintWashRgb` + config keys, used by the steps view
3. step-003 - the zone view's unlinked cells get the same treatment
4. step-004 - palette tests for the faint rule, plus a guard against misusing the colour ruler
5. step-005 - a browser test that measures the real drape's faint rim on two configurations
6. step-006 - README, GUIDELINES and the screenshots, re-measured for what faint now means
7. step-007 - `browser.js eval`/`shot` reuse the open page instead of making a blank one
8. step-008 - `tools/test.js` refuses arguments it does not read
9. step-009 - the same refusal in `browser.js`, `lint.js`, `staticserver.js`, `timebox.js`
10. step-010 - the browser harness refuses options it does not read
11. step-011 - lint and the architecture test enforce the 320-line `tests/` budget
12. step-012 - split `tests/unit/state.test.js` (358 lines)
13. step-013 - split `tests/browser/interaction.test.js` (338)
14. step-014 - split `tests/browser/reach.test.js` (337)
15. step-015 - split `tests/unit/coveragebehaviour.test.js` (335)
16. step-016 - split `tests/unit/architecture.test.js` (327), lint green at 320
17. step-017 - full `npm run verify`, and the measured numbers recorded in this file

*(Step statuses are tracked only in each `step-NNN/status` file, never here.)*

## Comments

- **A translucent fill over an unknown backdrop has a hard visibility ceiling, and alpha is the
  knob, not colour.** The eye sees `alpha` of the vertex colour over `1 - alpha` of the ground,
  so at `RF.noLinkAlpha` 0.22 the best rim this map can produce is ~4 CIEDE2000 no matter what
  colour is chosen - measured over the whole terrain ramp. Any future claim of the form "a
  reader can see X on the map" must therefore name the alpha and the colour rule *together*, and
  measure against the backdrop range the terrain can actually produce (including shadow, which
  is where the shipped wash disappeared: 1.4 against the ground it replaced).
- The ceiling is not symmetric: pushing the faint wash towards the ceiling (alpha 0.62) drags it
  to 11.3 from the painted cells, so "visible where it is" and "cannot be mistaken for a
  painted cell" trade against each other and the chosen point has to say which floor it gave up.
  Chosen: 0.50 / shift 30 L\* / neutral -> 10.0 and 11.2 (`.tmp/faint-decision.txt`).
- The closest *painted* colour to the faint wash is the zone view's `#663f81`, never a signal
  step. Any legend or palette change to the zone ramp has to respect that adjacency, which the
  existing cross-view floor of 12 does not currently cover (it compares solid colours to each
  other, not solid to faint).

## Result

Four bugs from the "fix the bugs you found" request, plus two more of the same family that the
fixing exposed. Every number below was measured in this task, with the configuration quoted.

| bug | fix | what refuses it now | measured |
| --- | --- | --- | --- |
| The asked-and-lost rim was invisible: `COLOURS.noLink` `#2a2f38` at effective alpha 0.50 | the drape paints `palette.faintWashRgb(ground)` - that cell's own ground moved 38 L\* away from pivot 55, chroma kept 0 - at `RF.noLinkAlpha` 0.57 x `RF.overlayOpacity` 0.88 | `tests/unit/faintwash.test.js` (8 tests) + `tests/browser/rim.test.js` (canvas read-back) | shipped rule: >= **13.1** CIEDE2000 from the ground under it, >= **10.9** from any painted cell; the fixed grey it replaced measured **1.4**; on the real canvas 879 interior rim pixels, p05 **11.4**, median **15.5** |
| `browser.js eval`/`shot` created a fresh target and navigated it to `about:blank`, so `open <url>` then `eval` answered about a page nobody asked for | `attachToOpenPage` / `attachToPageTarget` in `tools/lib/cdp.js`, `resolvePage` in `tools/browser.js`: reuse the open page, name it on stderr, leave it open; exit 4 when there is none | `tests/browser/browsercli.test.js` (2 tests, real CLI + real Chromium) | before: `document.title` -> `""`, `window.__sim ? ...` -> `"no app here"`, **exit 0**; after: refusal naming the fix, and `shot [OUT]` writes where it says |
| CLIs accepted arguments they never read | `checkArgs` in `tools/lib/args.js`, used by all six tools (per-subcommand for `browser.js`), plus `guardBrokenPipe()` in `tools/lib/proc.js` | `tooling: every CLI refuses arguments it cannot read` (8 cases) and `tooling: the arguments the CLIs do read still work` (10 cases) | `staticserver --prob 8123` used to **listen on 8080**; `lint src/config.js` linted the whole tree; `test browser interaction` printed the unit suite at exit 0 - all now exit 2 naming the token |
| The declared 320-line `tests/` budget was enforced nowhere, and `tools/`' 430 only in one test | `checkFileSizes` in `tools/lint.js` measures all three trees; `architecturetools.test.js` asserts `tools/` + `tests/` | `node tools/lint.js` and `architecture: tools and tests have their own budgets...` | turned red with **358, 344, 337, 335, 331**, cleared over steps 012-016, now `lint ok - 45 src, 15 tools, 38 tests file(s)` |
| A mistyped session option in the browser harness became a silent default, then a 30 s timeout blamed on the app | `checkSessionOptions` in `tests/harness/app.js` (five keys, plus viewport shape) | `tooling: the browser harness refuses session options it does not read` | rejects in **0 ms** naming the key, instead of failing at the per-file budget |
| Piping a tool into `head` ended in an unhandled EPIPE stack trace | `guardBrokenPipe()` installed in every CLI | the piped case in `tooling: test.js refuses arguments it does not read` | `tools/test.js --list --browser \| head -3`: exit 1 + stack before, exit 0 after |

**Gates at close**, verbatim:

```
vendor ok - three 0.187.0, three.module.min.js 732 KiB, license + notice present
lint ok - 45 src, 15 tools, 38 tests file(s)
all 26 test file(s) passed in 16092 ms            (npm run test:unit)
all 36 test file(s) passed in 113638 ms           (npm run verify: vendor + lint + unit + browser)
timebox: npm exited 0 in 117.0s
```

The browser group grew from 8 to 10 files across this task (rim, browsercli) and 012-016 added four
unit files by splitting, so the suite costs more than the **78.5 s** the previous task recorded at
its close: **113.6 s** now, measured the same way. That is the price of measuring the canvas and the
CLI instead of asserting about them, and it is still inside the suite budget.

**Superseded numbers in the Comments above.** The second bullet records "Chosen: 0.50 / shift 30
L\* / neutral -> 10.0 and 11.2". Step-005 measured that choice on the real canvas and found the
5th percentile of interior rim pixels at only 10.0 - readable in palette arithmetic, marginal on
screen - so the shipped shift is **38**, giving 13.1 / 10.9 in palette space and 11.4 / 15.5 on the
canvas. The 30 figures are left above as the decision as it was made, not as what shipped.

**Not fixed, and why.**

- **Palette space is not canvas space.** `src/app/viewport.js` sets `outputColorSpace = SRGBColorSpace`
  with no tone mapping, but the sRGB triples the palette writes into geometry colour attributes are
  treated as linear by three.js: crimson `#980011` (152,0,17) renders as a mean of (171,6,66) at
  `overlayOpacity: 1`, matching "treated as linear" (203,0,73) far better than "converted"
  (152,0,17). Every colour guarantee in the palette tests is therefore a palette-space guarantee,
  which is why `rim.test.js` measures the buffer as well. Closing the gap needs a conversion pass in
  the render adapters and a re-measurement of every colour claim in README/GUIDELINES: a task of its
  own, not a line in this one.
- **The one-cell alpha fade at the coverage boundary** is real and reported: all rim pixels give
  p05 8.0 / worst 2.1 against interior p05 11.4, because a rim cell adjacent to a painted cell is
  drape blended over a neighbour's geometry. Asserted only for interior pixels; the fade band (451 of
  1330 pixels, median 15.3) is measured and written into the test output, not hidden.
- **The wash's pivot discontinuity stays.** A rule that keeps a fixed distance from every ground on a
  continuous lightness ramp must have a fixed point; at pivot 55 the rule flips direction there.
  Measured over six shipped configurations, 348 faint adjacencies straddle the pivot (~0.8 % of
  faint cells, worst jump 35 dE000). The one-way alternative was built and rejected: its floor on
  bright ground is 0.5 against the two-way rule's 9.1.
- `usage()` still writes refusals to **stdout**, so a refusal stays visible in a pipeline; the exit
  code (2 for unread arguments, 4 for no page) is the machine-readable part.
- `vendor.js` keeps its own `unknown command "x"` refusal rather than routing through `checkArgs`:
  it names the valid commands better than the generic hint would. Its flags now go through `checkArgs`.
