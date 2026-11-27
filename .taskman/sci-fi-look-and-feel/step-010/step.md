# step-010: final verify, close-out

## How to perform this step

1. `node tools/timebox.js -t 400 -- npm run verify` one last time — the gate
   after the screenshot/README steps (documentation-only changes since
   step-007, so this is the belt-and-braces confirmation the Definition of
   Done demands).
2. `node tools/browser.js stop --all` and stop any stray static server;
   `git status --short` must show only this task's changes (app.css,
   config.js if step-006 moved colours, four PNGs, any single README sentence,
   and the `.taskman` bookkeeping).
3. Append a close-out to `task.md`'s `## Comments`: what the skin is (tokens,
   void background), what deliberately did **not** move (data colours, DOM
   contracts, red banner, zero-dependency rule), and the verify result.
4. Commit everything: `taskman: close sci-fi-look-and-feel - console skin, void scene, re-shot docs`.

## Expected result

The task is complete: verify green, screenshots fresh, docs true, work
committed, `task.md` comments record the constraints honoured.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Final `npm run verify` (`.tmp/verify-010.log`): exit 0 - vendor ok, lint ok
  (45/15/38), all 36 test files / 256 tests passed in 95.7 s.
- `browser.js status --all` quiet (no instances, no orphans); static server
  stopped; `git status` showed only this step's bookkeeping before the final
  commit. Close-out appended to `task.md` Comments.
