# step-007: full `npm run verify` and closing commit

## How to perform this step

1. Make sure nothing is left running: `node tools/browser.js status --all` (exit 0)
   and `node tools/staticserver.js status` (stopped). Kill orphans with
   `node tools/browser.js stop --all`.
2. `node tools/timebox.js -t 800 -- npm run verify` - vendor check, lint over
   `src/`, `tools/` and `tests/`, the unit suite and the browser suite. Fix causes,
   never assertions. If a browser test fails intermittently, re-run that one file
   alone before touching anything.
3. Final sweep for the removed concept:
   `grep -rn "sitePad\|padElevation\|naturalHeightAt" src/ tests/ README.md GUIDELINES.md`
   must be empty.
4. `git status --short`: only the files this task touched plus
   `.taskman/remove-site-pad/**`. `vendor/` untouched
   (`git diff --stat vendor/` empty). Screenshots under `docs/` may have changed.
5. Commit whatever is left (the task bookkeeping included) with a message naming the
   change, e.g. `terrain: the mast stands on natural ground - no site pad`.
6. Report: what got removed, what the tests now guard, and the side benefit (moving
   the mast no longer regenerates the terrain - report the relocation cost you see in
   the browser's `stats()` or by timing `patch` + `settle` before/after, from
   `.tmp` notes or a quick live measurement).

## Expected result

`npm run verify` green, tree clean, the pad concept gone from code, tests and docs.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
