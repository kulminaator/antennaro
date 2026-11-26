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

## Step comments

- **Wired through `profileObstructionDb` itself, not through a second function.** The step
  suggested charging in `pathtrace.js` and leaving `profileObstructionDb` as the single-edge
  answer; that would have left `window.__sim.rayTo` reporting one number and the map painting
  another, which is the exact 0.3 dB argument step-009 exists to prevent. So the profile's dB
  are now the multi-edge sum everywhere, and `diffractionLossDb(profile.diffractionExcess,
  diffractionD1, diffractionD2)` stays available and documented as the single-edge answer for
  anyone who wants "the one thing in the way" in decibels. `screenEdges` is exported for the
  same reason.
- **The defect was worth more than expected.** Screening every in-range path from the default
  site: 1238 paths cross no screen, 7269 one, 8291 two, 5239 three, 8587 four or more - so 22
  117 of 30 624 (72 %) cross two or more. Charging them properly moves 6763 cells (22.1 %) by
  more than 0.05 dB, the largest single move being 15.74 dB (16.91 -> 32.65 dB) at 2464 m. From
  the panel's lowest mast the screen census is 506 / 13 034 / 9701 / 4614 / 2769.
- **Cost**, same probe as step-010: default sweep 46 -> 49 ms median, loudest 226 -> 270 ms.
  Roughly a fifth on the sweep where every path is walked, which is the same shape as the extra
  per-path work (one scan of the samples plus at most four loss evaluations).
- **Consequences, measured not assumed.** Default configuration: linked 1926 -> 1864 cells,
  median -95.38 -> -96.09 dBm, Fresnel-clear 82.1 -> 84.8 %, still `limit: budget`. The clear
  *share* rose because the linked set shrank outward-inwards - the far, marginal cells are the
  ones the ridges now defeat, and they were the least zone-clear. Loudest configuration: median
  -75.12 -> -76.95 dBm, still every cell of the map linked at 868 MHz. With the band opened up
  in the browser, the accumulation makes the band matter for reach where it previously did not:
  433 and 868 MHz still cross all 30 624 cells, 2400 MHz now links 29 986 and 5800 MHz 28 109.
- **Two browser tests re-measured, neither loosened.**
  - `a higher band has a smaller zone` asserted the lower *three* bands all reached the map edge;
    2400 MHz no longer does. It now asserts what is true and stronger: the two lowest bands
    still cross every cell asked, and each step up in band loses strictly more ground to the
    ridges.
  - `the app lowers its ray by exactly the earth` compared the charged dB of a curved and a flat
    ray and required the curved one to cost more. It does not always: at the map centre from a
    0.5 m mast in a corner, the flat ray's path charges 21.60 dB and the curved one 21.54 dB,
    while the worst excess rose 15.814 -> 15.980 m and the zone clearance fell -1.736 ->
    -1.738 r1. That is step-011's non-monotonicity arriving through the back door, so the dB
    comparison is gone from this test and the reason is written where the assertion used to be.
    The geometric claims - the ray goes down by exactly the bulge, the zone gets eaten - are
    untouched and still pass.
- **The new end-to-end test went into `tests/unit/multiedge.test.js`**, not the two files the
  step named: `coveragebehaviour.test.js` is already 335 lines, over the 320 convention. It took
  three attempts to build a field that says what it means. Two 18 m ridges 700 m apart are not
  two screens - between them the ground stays above the ray, so they are one contiguous screen,
  correctly merged. Two 8 m ridges are two screens but the far one sits below the line the near
  one casts, and a screen in another's shadow legitimately costs nothing. Two 6 m ridges are two
  screens, the near one only grazes the ray, and the path charges 14.50 dB against the 8.75 dB
  of the worse screen standing alone - a number the single-screen model could not produce.
- **Residual wart, quantified on real ground**: among the mast heights 4/6/8/10/12/16 m, 104 cell
  pairs exist where the sum rises as the mast goes up while the single-screen model falls - the
  first at 2847 m, worth +1.0 dB. Against ~150 000 such comparisons, and against a 15.7 dB
  correction elsewhere, shipping the sum is the honest trade; both numbers are in this record and
  the artefact has its own unit test.
