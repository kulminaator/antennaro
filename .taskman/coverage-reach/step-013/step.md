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
