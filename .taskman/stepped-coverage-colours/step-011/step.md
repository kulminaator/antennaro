# step-011: run every gate and fix what breaks

## How to perform this step
1. `node tools/lint.js`, then `npm run test:unit`, then the browser suite as documented in
   GUIDELINES section 9 (detached server, timeboxed, server and browsers stopped afterwards).
2. Fix every failure at its cause. If a documented number elsewhere in the repo (README,
   GUIDELINES, a test comment) is now stale, do not fix it here - note it for step-012/013 in the
   task comments.
3. Verify: all three gates green, `git status --porcelain` shows only intended files, and no stray
   `staticserver`/browser processes are left.

## Expected result
Lint, unit and browser gates are green with the new palette wired end to end.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->
