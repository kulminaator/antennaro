# step-013: documentation and screenshots, every number re-measured

## How to perform this step

1. Read `README.md` and `GUIDELINES.md` in full, then rewrite what the resize changed.
   Places that are certainly wrong now: the map size and cell size, "the pad" leftovers
   if any crept back, the controls table (study range wording, new slider max), the URL
   parameter table, *What the numbers mean*, the Fresnel numbers, the presets
   descriptions, and the camera table.
2. Add the two sentences this task exists for:
   - in *What you see* (or *What the numbers mean*): the outer edge of the painted
     coverage is where the **link** dies; if the app's own study range or the map edge
     would cut it off first, the ring appears and the read-out says which limit bit.
   - in *What this does not model* (or wherever the limits are listed): the study range
     is a work area, not a prediction, and the free-space pre-filter is a shortcut that
     cannot change a verdict (link to the test that proves it).
   In `GUIDELINES.md`: the new config numbers (`WORLD.coverageStride`,
   `RF.noLinkHaloDb`, `COLOURS.rangeLimit`, the new world/range limits), the coverage
   section (strided grid, whole-map evaluation, `budgetExcluded`, Fresnel percentages
   over linked cells, `limitingFactor`), and the rule that a limit the app chooses must
   be drawn and named, never left to look like physics.
3. Re-measure every number the docs quote, with the app running (server backgrounded,
   timeboxed, browser stopped afterwards): the default-map linked-cell count,
   zone-clear share of linked cells, per-band shares, worst clearance, and the free-space
   ranges of the five designs. Write the numbers you measured, not the old ones - the
   previous tasks proved these numbers move when the ground or the region moves.
4. Regenerate `docs/screenshot.png`, `docs/screenshot-valley.png` and
   `docs/screenshot-fresnel.png` at 1440x820 and read all three back: the mast must be
   on natural ground, the coverage must end in terrain (no straight arc at the map edge),
   and captions must match the pictures. If a preset is clipped, that is a step-010 bug -
   fix the preset, not the caption.
5. `node tools/lint.js`.

## Expected result

The docs tell the truth about the new world and about what the edge of the colour means.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Every number in both documents re-measured from the running app (`.tmp/doc-numbers.js`),
  not carried over: world 5200 m, terrain grid 349 (cell 14.94 m), coverage grid 175 at
  stride 2 (cell 29.9 m), half-diagonal 3677 m against a 3800 m study range, placement
  ±2500 m in 5 m steps, height 0.5-40 m.
- README: new hero caption that describes what the three paint strengths in the new
  picture actually mean; the coverage bullet now states the whole-map sweep, the three
  alphas and the "the outer edge of the colour is where the link dies" rule with the ring
  and the `>=` marks; the read-out description gained the *Range limit*, *Served within
  reach* and the corrected legend rows (`>= -35 / -50 / -65 / -80`, then
  `< -80 dBm (faint: terrain stops the link)`, then `out of budget - not measured, not
  painted` - the old example quoted `>= -40 dBm` down to `< -85 dBm (no link)`, five bands
  that no longer exist); the controls table says ±2500 m and "study range (100 m up to the
  whole map)"; the URL table's `range` row points at the clamping report, which is now
  documented (`window.__simBoot.overrides`).
- Two new README sections, which are the sentences this task exists for:
  **What the edge of the colour is** (the three things that can end the picture, each with
  the sentence the HUD prints; the two denominators; the pre-filter as a provably lossless
  shortcut, with the test that proves it named) and **Why two antennas of different gain
  can look the same size** (at the centre the Yagi/biquad/patch all stop at 899 m against
  budgets of 2.20/3.05/1.56 km because the beams hit rising ground; at 40 m on the flat
  field each reaches within a few per cent of its free-space figure - and both halves are
  browser tests). *What this does not model* names the two tool-limits (study range is a
  work area; ground beyond the budget is not ray-walked, and is painted as "not measured").
- Fresnel numbers replaced with measured ones: the default dipole links 844 points, 117 of
  them (13.9 %) make the budget with the zone cut, 86.1 % of linked points are clear, and
  the band sweep of the *linked* set is 70.6 % at 433 MHz, 86.1 % at 868, 93.7 % at 2.4 GHz,
  100 % at 5.8 GHz - with the honest caveat that at 5.8 GHz only 12 points link at all, so
  the percentage is honest and the sample is the story. The old text quoted "945 of 5470
  linked cells" and shares of the whole map (17/25/43 %), both of which described the
  pre-resize world and the old denominator.
- Preset bullets rewritten from measurement (valley 2.54 km of a 2.58 km budget and 99 %
  zone-clear; mountain-shadow 7064 points, 2.04 km of 2.05 km; flat-field 1913 m of a
  1913 m budget at 25 m and 837 m at 10 m; bumps 1.30 km of 3.05 km; sector 3571 points,
  2.86 km of 2.92 km, 56 % zone-clear - the worst of the five). The old valley caption
  said the beam "reaches 1.5 km"; the measured figure is 2542 m at 182 deg.
- One bullet was rewritten after measuring rather than reasoning. I first wrote that the
  downtilted sector "serves least near the mast"; probing along its boresight says the
  opposite - -71 dBm at 60 m falling to -107 dBm at 2.86 km - so the bullet now says what
  was observed: the first 200 m keep the zone clear, nothing past 400 m does, which is why
  its zone-clear share is the lowest of the five. (Why the far boresight sample is 22 dB
  below its own free-space figure with 0 dB of diffraction is a pattern-shape question this
  step does not answer; it is noted here so the next person does not "fix" the docs to
  match a guess.)
- GUIDELINES: §2 layout names `pathtrace.js` / `coveragestats.js`; §4 lists the new knobs
  (`WORLD.minWorldSize`/`maxWorldSize`/`maxGridSize`, `RF.coverageStride`,
  `RF.defaultMaxRangeM`/`maxRangeLimitsM` as a work area, `RF.noLinkAlpha`,
  `COLOURS.rangeLimit`, `VIEW.rangeRing*`, `TERRAIN.seedMin`/`seedMax`) and states the new
  rule **a default must lie inside the control that displays it, and both bounds come from
  config**, with the seed story told in full; §6's "the UI never mutates state" explains why
  that is load-bearing and points at `createInitialStateWithReport()`; §7 gains four bullets
  - **a limit the app chooses must be drawn and named** (including
  `rayBoxExitDistance` and the ring-that-only-appears-when-it-can-bind rule), the strided
  whole-map sweep, **three alpha values are a contract**, and **every percentage names its
  denominator**; §9 documents `budgetExcluded` on `rssiAt()`, `walkedCells` /
  `denominatorCells` on `fresnel()`, `scene().rangeRing`, `boot.overrides`, and adds two
  conventions learned this task: pin a probe to a feature or to the map rather than to a
  metre reading, and know which sectors are empty ground (due west of centre links nothing
  at any height, so a comparison there compares zeros).
- Screenshots regenerated at 1440x820 through `tools/browser.js shot` and read back:
  `docs/screenshot.png` (ragged terrain-hugging edge, no circular cap),
  `docs/screenshot-valley.png` (beam down the valley, dying in mid-map, HUD reading "the
  link: budget 2.58 km, last link 2.54 km"), `docs/screenshot-fresnel.png` (zone ramp plus
  the boresight tube). Captions match the pictures.
- `node tools/lint.js` ok. Browser and server stopped afterwards.
