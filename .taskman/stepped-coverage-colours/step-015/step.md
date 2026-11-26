# step-015: final verify, and the measured numbers recorded here

## How to perform this step
1. `npm run verify` (vendor, lint, unit) plus the browser suite, timeboxed, everything stopped after.
2. Append to `task.md` under Comments: the final shipped hexes and thresholds, the measured
   before/after numbers with their configurations, and anything a later contributor would otherwise
   rediscover (e.g. that the zone view had to give up its amber because a yellow step collides with
   it at 10.7 CIEDE2000).
3. Commit, and report the gate output summary.

## Expected result
The task is verified, the measurements are recorded where the next person will read them.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->

- `npm run verify` from a quiet machine (no stray static server, no stray Chromium):
  `vendor ok - three 0.187.0, three.module.min.js 732 KiB, license + notice present`,
  `lint ok - 45 src, 15 tools, 28 tests file(s)` (27 before this task added
  `tests/harness/colour.js`), and `all 26 test file(s) passed in 78457 ms` - the unit suite plus
  all six browser files, no skips, no todos.
- Nothing needed adjusting to get there: the palette tests, the display tests and the two browser
  files were each run against their step, so the full run was a confirmation rather than a fix.
