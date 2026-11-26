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

- Four stale comments, one of them a false claim rather than a stale word:
  - `controller.js`: "the three views share one drape" -> two.
  - `reports.js`: the `coverageView` doc said `bands | gradient | zone` -> `steps | zone`.
  - `propagation/rf.js`: "ramp index ... weaker-than-all-bands" -> "signal-step index ...
    below every step".
  - `palette.js`, the zone-ramp docstring, asserted "the warm-to-cool language matches the
    signal ramp so both overlays read the same way". That was true of a purple/amber/green
    zone ramp against a yellow/pink gradient and it is the opposite of what is shipped now:
    the two scales are deliberately disjoint. Rewritten to say so and to name the test that
    enforces it.
- The same paragraph carried an unmeasured figure - "only about one cell in ten meets the
  criterion". Measured on the default map: 1080 of 30624 cells clear, which is 3.5 % of the
  grid and 38 % of the 2828 paths the ground was actually asked about. Both denominators are
  now in the comment, because the two numbers answer different questions and the old sentence
  answered neither.
- `ui/schema.js` and `ui/controls.js` needed nothing: the panel builds the select from
  `STATE_FIELDS`, so the two new options arrive with the field table. No keyboard shortcut
  cycles coverage views (`orbit.js` keydown is camera only).
