# step-012: use the multi-edge sum in the sweep, single edge must not change

## How to perform this step

1. In `src/propagation/pathtrace.js` (41 lines), charge the loss with the multi-edge
   function from step-011 instead of the single worst edge, and update its header: the
   file's whole purpose is "one path, two questions", and the loss question is now "what
   does the sequence of ridges cost".
2. `profileObstructionDb` stays as the single-edge answer if anything still uses it - say
   who uses which in its comment - or delete it if nothing does and reachability lint
   would object; record which you chose.
3. Add the end-to-end invariant: over a synthetic two-ridge field, the coverage RSSI of a
   cell behind both ridges is below that of the same cell behind one ridge, which is
   below that of a cell with nothing in the way - all three computed in the test from the
   same sweep. Put it in `diffraction.test.js` or `coveragebehaviour.test.js`.
4. Run `node tools/timebox.js -t 600 -- npm run test:unit`. The sensitive ones will be
   `coverage: no preset is cut off by our own limits` and the reach-ordering tests:
   re-measure, do not loosen.
5. Record the sweep cost again (same probe as step-010) here: sorting every profile is a
   real cost and the number belongs in the record.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
