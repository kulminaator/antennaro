# step-018: full `npm run verify` and the closing commit

## How to perform this step

The definition of done is `npm run verify` (GUIDELINES.md §11): vendor check +
lint + unit suite + browser suite, all timeboxed.

1. Make sure no browser from the earlier manual checks is still alive —
   `node tools/browser.js status --all` (exit code 2 means orphans). If any,
   `node tools/browser.js stop --all`. Never `pkill -f`.
2. Run the gate: `npm run verify`.
3. If anything fails, fix the cause (not the assertion) and re-run; record what
   happened in this step's comments and, if it was a project-wide discovery, in
   `task.md`'s `## Comments`.
4. Confirm the change set is what the task intended:
   - `git status --short` shows only: `src/config.js`, `src/app/fields.js`,
     `src/app/state.js`, `src/ui/schema.js`, `src/terrain/generators.js`,
     `src/app/controller.js`, `src/app/viewport.js`, `src/app/orbit.js`,
     `src/app/pick.js`, `src/app/relocate.js`, `src/app/testapi.js`,
     `src/ui/controls.js`, `src/ui/hud.js`, `src/main.js`, `tools/lib/arch.js`,
     `tests/unit/state.test.js`, `tests/unit/terrain.test.js`,
     `tests/unit/pick.test.js`, `tests/browser/relocate.test.js`, `README.md`,
     `GUIDELINES.md`, and `.taskman/relocation/**`.
   - `vendor/` untouched (`git diff --stat vendor` empty); nothing new under
     `.tmp/` is staged.
   - The docs screenshots in `docs/` still show the default view (site at the map
     centre), so no regeneration is required. Only if one looks wrong:
     `node tools/browser.js shot --url http://127.0.0.1:8080/ --out docs/screenshot.png --width 1440 --height 820`
     against a running `npm run dev`.
5. Commit whatever is left (including the task bookkeeping) with a message that
   names the feature, e.g.
   `git add -A && git commit -m "relocate the antenna: pad, mast, coverage, mouse drag and reset"`.

## Expected result

`npm run verify` reports lint ok + all unit and browser tests passing, the working
tree is clean, and the relocation feature is committed.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
