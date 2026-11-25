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

- `npm run verify`: `vendor ok - three 0.187.0`, `lint ok - 41 src, 15 tools, 15 tests
  file(s)`, `all 14 test file(s) passed in 37 s`. Started from a clean process table
  (`browser.js status --all` exit 0, static server stopped).
- Sweep `grep -rn "sitePad|padElevation|naturalHeightAt|padBlendFactor" src/ tests/
  README.md GUIDELINES.md` → nothing (exit 1).
- Cost of the change, measured (port 8137): `generateTerrain()` on the default
  161 x 161 grid is **13.9 ms in Node**, and that is what a relocation no longer pays.
  Live wall time of patch + settle: **moving the mast 109-121 ms**, **a new seed
  (terrain + coverage) 126 ms** - i.e. a relocation is now the coverage rebuild plus
  the rig, with the terrain stage off the path.
- `tmp/` (the user's two screenshots) was left untracked on purpose.
