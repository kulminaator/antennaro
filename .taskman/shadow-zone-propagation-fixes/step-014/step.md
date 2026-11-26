# step-014: README: the corrected curvature story and the new model notes

## How to perform this step

1. Rewrite "The earth is round, and now it says so" around the step-004 and step-013
   measurements. The old claim - that coverage is never ended by curvature inside this
   map, demonstrated on a flat plane with the lowest mast - must be replaced by what the
   model now reports, including whether that flat-plane extreme is now horizon-limited
   and what the HUD says about it. Keep the section's tone: the app reports what it
   measured and does not stage drama.
2. Update "What the numbers mean" on terrain shadowing to describe the model as it now
   is: multi-edge (Deygout over the sampled profile), a shadow that starts at 0 dB and
   passes about 6 dB at the shadow line, and the refinement that keeps narrow crests from
   being invisible.
3. Update "What this does not model": multi-point and terrain-reflected models are still
   absent, but "beyond the single knife edge" is no longer true - say what remains
   (reflections, urban models, vegetation, ducting, clutter as one slider).
4. Correct every number in those sections to the step-013 measurements, including the
   legend counts quoted in "What you see" and the HUD sentences quoted in the curvature
   and colour sections; quote each with the configuration it was measured in.
5. Verify `node tools/lint.js`, then re-read the changed sections end to end for claims
   that no longer match the code.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

## Step comments

README rewritten around the step-013 measurements plus several new ones. Sections changed: the
title caption, "What you see" (legend counts), the RSSI-model paragraph, a new
**"How a shadow begins, and how fine the ground has to be"** (0 dB onset, signed screen
parameter, one sample per terrain cell, Deygout and the three-tallest cap), the preset list,
"Why two antennas of different gain can look the same size", "What the colours can mean"
(including both valley captions and the 30 dB margin-span evidence), the curvature section -
retitled **"The earth is round, and now it hides things"** - the Fresnel section, and "What
this does not model".

### Two README claims turned out to be wrong when re-measured, not merely stale

- **"72 % of paths cross two or more screens" is the *loudest* configuration, not the
  default.** Measured with `screenEdges` over the walked set: default mast and budget, 844 of
  2828 walked paths = **29.8 %**; 43 dBm into -124 dBm, 22117 of 30624 = **72.2 %**. Step-012's
  note said "from the default mast" and that was wrong; corrected in task.md and README.
- **"the third screen contributes fractions of a dB" is false.** `RF.diffractionEdgeLimit`
  keeps the **three tallest** screens (`screenEdges` result sorted by excess, not sliced by
  path order), and dropping to the top three rather than the top eight costs a mean of 0.6 dB
  but up to **29.1 dB** on individual paths: over an 8712-path grid from the default mast,
  7.3 % of paths lose more than 1 dB, 5.0 % more than 3 dB, 184 (2.1 %) more than 10 dB. All
  of those cells are already deep in shadow and no cell crosses the sensitivity line at
  either the default or the loudest configuration, so the cap is defensible - but as a stated
  model choice, not as "free". `diffraction: the first screen is charged in full, the ones
  behind it are not` now asserts `edgeLimit: 1` equals the **tallest** screen alone, so a
  regression to cutting by path order fails a test instead of quietly changing the map.

### Other new measurements now in the README

- Flat plane, loudest budget, mast sweep: the earth obstructs **2232 cells at 0.5 m** (all
  between 3024 m and the 3677 m corner) and **nil at 1 m and above**; every height still links
  all 30624 points with `limit: map-edge`.
- Curvature alone on the default map: of 2828 walked cells, **three** differ from the same map
  with `kFactor: 0` by more than 0.05 dB, worst **1.24 dB at 870 m**.
- site-sector preset, why its zone-clear share is the lowest of the five (72.8 %): the 2044
  clear cells sit a median **911 m** out, the 762 cut cells a median **1310 m**. The old
  README sentence ("first 200 m clear, nothing past 400 m, because a panel aiming at the dirt
  cuts its own zone") could not be reproduced: down the azimuth the zone stays clear to
  **1075 m**, so the downtilt costs range, not clearance. Replaced.
- Shadowed-cells HUD line (**73.7 %** of walked cells diffracted by more than 6 dB) quoted in
  the new shadow section, since that number moved a lot with multi-edge.

### One small honesty fix in the HUD, because the README was about to repeat it

`describeEarth()` now also returns **`groundHorizonM`** - the same radio-horizon formula with
the far end lying on the ground - and the `beyondMap` curvature sentence appends
`; a terminal on the ground is out of sight past 3.00 km` when that horizon falls inside the
map. Without it, the row reads "the earth curves away long before this map ends" at a 0.5 m
mast where 2232 cells are earth-obstructed: technically about the quoted (terminal-height)
horizon, and half a story. `tests/unit/curvature.test.js` gained
`coverage: the curvature facts carry the horizon a terminal on the ground has` (relationship,
not value: shorter than the quoted horizon, inside the map at 0.5 m while the quoted one is
outside it), and `tests/browser/curvature.test.js` gained
`browser: at a low mast the curvature row says what the earth is hiding`, which reads the
panel text itself - the sentence *selection* is presentation, so this is the one place where
scraping the DOM is the right test, and it asserts the clause is absent at 10 m and present,
with the same distance the stats carry, at 0.5 m.

`node tools/lint.js` green; `npm run test:unit` 20/20; `node tools/test.js --browser` all
6 files green.
