# step-010: browser tests: view cycle and a step boundary

## How to perform this step
1. Find the test that cycles the coverage views (README documents `gradient -> bands -> zone ->
   gradient`) - `grep -rn "coverageView\|view=" tests/browser/` - and make it cycle
   `steps -> zone -> steps`, asserting the coverage statistics and counts do not move when the view
   changes (a view changes colour, nothing else).
2. Add a browser test that drives through `window.__sim`: read the painted vertex colours of two
   cells that straddle a threshold (one just under, one at/over) and assert they differ by a large
   margin - the recognisability claim, checked on the actual mesh - and that a faint no-link cell is
   not the same colour as any step.
3. Fix `tests/browser/fresnel.test.js` where it names the amber zone colour or the gradient view.
4. Verify with the documented procedure: start the static server detached on a free port, run the
   browser tests timeboxed, stop the server and `node tools/browser.js stop --all`.

## Expected result
Browser tests prove the view switch changes colour only, and that neighbouring steps are
visibly different on the real mesh.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->
