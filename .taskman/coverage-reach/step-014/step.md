# step-014: full `npm run verify` and closing commit

## How to perform this step

1. Clean process table: `node tools/browser.js status --all` (exit 0) and
   `node tools/staticserver.js status` (stopped); kill orphans with
   `node tools/browser.js stop --all`.
2. `node tools/timebox.js -t 900 -- npm run verify` - vendor, lint, unit, browser. Fix
   causes. If a browser test is flaky, re-run that file alone and note it in the
   comments rather than relaxing it.
3. Confirm the acceptance numbers one last time, live and timeboxed, and write them into
   the step comments: for each of the five designs at the default radio settings, the
   `maxLinkedRangeM`, `budgetRangeM` and `limitingFactor` with the mast at a map side -
   the table that would have answered the user's complaint on the spot. Also record the
   measured whole-map coverage time in Node and the live rebuild time.
4. `git status --short`: only task files, source, tests and docs. `git diff --stat
   vendor/` must be empty; `.tmp/` and `tmp/` stay untracked.
5. Commit whatever remains, e.g. `taskman: complete step-014 — coverage reach: bigger
   map, whole-map evaluation, visible limits`.
6. Report: the acceptance table, the two numbers that prove the cap is gone (max linked
   range vs study range, and the design-to-design spread), and anything deliberately
   left for a follow-up task.

## Expected result

`npm run verify` green, tree clean, and a measurement table showing that what the map
draws is now the link.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Process table clean before and after (`browser.js status --all` exit 0, `staticserver.js
  status` stopped). `npm run verify` green in 51 s: vendor check, lint (43 src, 15 tools,
  18 tests), 12 unit files, 5 browser files - 17 test files in 48.5 s, no flakes seen.
- **Acceptance table** (Node, `.tmp/acceptance.mjs`, each design with the parameters the
  app gives it, mast 1 km west of centre on the flat field aimed east, 10 dBm / -80 dBm).
  This is the table that answers the complaint the task was opened for - "the three
  antennas look the same size":

  | design | peak | free-space budget | last link | limiting | linked (mast 40 m) | linked (mast 10 m) |
  | --- | --- | --- | --- | --- | --- | --- |
  | omni-dipole | 2.1 dBi | 937 m | 932 m | budget | 1918 | 1302 |
  | omni-collinear | 7.2 dBi | 1670 m | 1664 m | budget | 4209 | 2455 |
  | patch | 6.6 dBi | 1563 m | 1393-1402 m | budget | 842 | 804 |
  | yagi | 9.6 dBi | 2204 m | 2169 m | budget | 786 | 656 |
  | biquad-reflector | 12.4 dBi | 3049 m | 3035 m | budget | 3323 | 1909 |

  The spread of last-link distances is 3.3x, every row ends at its own budget with zero
  clipped cells, and the 10 m column shows the ground eating reach that the 40 m column
  keeps (yagi 2169 -> 1479 m). The live app measured the same five rows to within one
  30 m cell (`.tmp/live-acceptance.js`: 932/1918, 1664/4209, 1393/841, 2169/786,
  3035/3323) - Node and browser agreeing cell for cell is the closing proof that the
  seed/sanitisation divergence found in step-010 is gone.
- The two numbers that prove the cap is gone: **last link 3035 m against a study range of
  3800 m and a half-diagonal of 3677 m, with `limitingFactor: budget` and 0 clipped cells**
  (before this task the same measurement was 1399 m inside a 1400 m circle), and the
  **3.3x design-to-design spread** above. The deliberately impossible case - 43 dBm into a
  -124 dBm receiver, every one of 30624 points linked - reports
  `limitingFactor: map-edge`, `nearestMapEdgeM 2600`, and the app draws and names that
  limit instead of pretending the antenna stopped there.
- Cost. Node whole-map sweep on the 175^2 strided grid: 16-47 ms for the rows above,
  worst observed **133 ms** for the nothing-can-be-dismissed case above (against the
  ~250 ms gate set in the plan). Stride 1 costs 59 ms on the default configuration only
  because the pre-filter discards almost everything; at stride 1 the linked count is
  4x larger (3374 vs 844) for the same physical area, which is the cell count, not a
  behaviour change. Live: 12 consecutive patch+settle round trips averaged 28 ms each
  including two CDP round trips and a frame wait, `stats()` reporting fps 36.7 /
  lastFrameMs 16.7 - interactive.
- Corrections to my own earlier notes, so nobody quotes them again: there is no
  `coverageBuildMs` in `stats()` (it is `{status, frames, fps, lastFrameMs, renderCalls}`)
  and step-003's note quoted "147 ms" from it - the honest live figure is the round-trip
  and frame numbers above, and the sweep cost is the Node number. `__sim` has no `timing`
  member either; the live rebuild is driven by the rAF loop, so neither `patch()` nor
  `settle()` measures it in-page.
- Three tool-usage traps found while measuring, all mine, all recorded in GUIDELINES:
  `session.patch()` returns the reducer report and does **not** rebuild - derived reads
  (`coverage()`, `site()`, `fresnel()`) need `await session.settle()` first, which is why
  an early version of the live table showed stale numbers; `withApp` takes `query` for a
  query string and `url` for a server base, so `{url: '?azimuth=135'}` navigates to a
  relative URL and leaves a blank page; and `tools/browser.js start --url` launches at
  `about:blank` - only `eval --url` and `shot --url` navigate.
- Verified by measurement rather than by reading: URL state parameters still reach the
  model (`?azimuth=135&range=1200&height=22&sensitivity=-95&siteX=-1000` gives exactly
  those values with `boot.overrides` empty), a mixed patch nesting `site` alongside
  scalars applies **all** of it (`changed: [txPowerDbm, rxSensitivityDbm, site.x,
  heightM]`), and an unknown top-level key (`azimuthDeg` instead of `aim.azimuthDeg`) is
  rejected rather than guessed - the app was right in all three cases and my probe was
  wrong in the last one.
- Left for a follow-up, deliberately: the patch/biquad/patch-panel pattern shape question
  noted in step-013 (a far boresight sample 22 dB under its own free-space figure with
  0 dB diffraction), which is an antenna-pattern question rather than a coverage-reach
  one; `coverage.js` at 323 lines is close to the 350 budget and would take another seam
  to split; and the pre-filter could skip whole *rows* outside the budget circle instead
  of testing every point, which the numbers say is not yet worth the complexity.
