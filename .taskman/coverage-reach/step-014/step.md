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
