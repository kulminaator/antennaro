# step-006: rewrite the curvature browser tests to the honest finding

## How to perform this step

`tests/browser/curvature.test.js` (83 lines) proves from inside the page that the
horizon is nowhere near where coverage stops: "the horizon the app quotes is nowhere
near where the coverage stops" and "even the loudest link the panel allows ends before
the curve matters".

1. Background the server - `(setsid node tools/staticserver.js start --port 8080 --quiet > /dev/null 2>&1 &)`
   - and run `node tools/timebox.js -t 300 -- node --test tests/browser/curvature.test.js`;
   stop the server afterwards (`node tools/staticserver.js stop`).
2. Re-measure both claims against the new model with the step-004 numbers. Keep what is
   still true: the horizon the row quotes is computed for the *terminal* height and is
   still far off this map (11.5 km for a 0.5 m mast with a 4 m terminal). Where a claim
   was really about the *ray*, rewrite it to what the model now reports.
3. If step-004 found a user-visible consequence on legal configurations, add one browser
   test for it (patch, `await session.settle()`, read through `window.__sim` - never DOM
   or coordinates). If it found none, say so here and do not invent one.
4. Assert `session.errors()` empty; then `node tools/browser.js stop --all` and stop the
   server.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
