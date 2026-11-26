# step-001: measure the alpha/colour frontier and choose the faint rule

## How to perform this step

1. Re-run `.tmp/faint-scan.mjs` (already written) and finish it: for each candidate
   `(alpha, delta, keep)` also report *which* painted colour is the closest one, and the
   relief left under the wash (delta between two neighbouring grounds before and after).
2. Sweep alpha 0.3..0.6 by 0.04 and delta 18..30 by 2 at keep 0 and keep 0.25, over the terrain
   ramp at shades 1.0/0.68/0.42/0.3, worst of `normal, protan, deutan, tritan` via
   `worstDistance` from `tests/harness/colour.js`.
3. Pick the smallest alpha whose worst case against bare ground is >= 8 (target 10) *and* whose
   worst case against a painted cell (step or zone colour at `RF.overlayOpacity` over the same
   ground) is >= 11. If no point meets both, say which bar was given up and by how much.
4. Write the chosen `(alpha, delta, keep)` and the two measured floors into
   `.tmp/faint-decision.txt` and the step comments, and add a task.md comment for the frontier
   itself (it constrains every later colour decision).
Verify: `.tmp/faint-decision.txt` names one triple, both floors, and the closest painted colour.

## Expected result
`RF.noLinkAlpha` and the faint colour rule are one measured decision, written down with the two
floors it trades off, before any source file changes.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This step starts empty and is append-only. -->

- Rerun as `.tmp/faint-frontier.mjs` (grid alpha 0.30-0.60, shift 18-32, keep 0 / 0.25, over the
  terrain ramp at shade 1.0 / 0.68 / 0.42 / 0.3, `worstDistance` over the four eyes). Decision
  in `.tmp/faint-decision.txt`: **`RF.noLinkAlpha` 0.50, lightness shift 30 L\*, chroma kept 0**.
  Floors it buys: **10.0** from the bare ground the cell replaces (was 1.4), **11.2** from any
  painted cell.
- The closest *painted* partner is never a signal step - it is the zone ramp's deep violet
  `#663f81` (L\* 34), which a neutral lifted grey approaches. So the painted floor is a
  steps-and-zone floor, and the test in step-004 must state it that way.
- Chroma kept at 0 rather than 0.25: keeping a quarter of the ground's colour costs about 1.0
  against painted cells (11.2 -> ~10.1, against the same violet), which is what the floor is
  measured against. Neutral grey also cannot be mistaken for a level on either scale.
- The worry that a strong wash hides the blocking hill is measured away: neighbouring terrain
  cells keep **104-107 %** of their mutual difference under the wash, because the rule shifts
  lightness instead of replacing it. Deep shadow (`#0c140f`, L\* 6) is the hardest ground and
  still reads 10.1.
- Frontier, for the record: no point reaches 10 against the ground *and* 12 against painted
  cells. The best is 13.4 / 11.3 at alpha 0.62, shift 32 - a heavier drape than this needs.
  Recorded because it bounds every future faint-vs-ground claim, not just this one.
