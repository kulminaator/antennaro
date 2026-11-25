# step-004: coverage stats: honest denominators and the binding-limit report

## How to perform this step

1. Read `src/propagation/coverage.js` again, focused on the stats block, plus
   `src/app/reports.js` (which forwards stats to the HUD and `window.__sim`) and
   `src/palette.js`'s `fresnelZoneLegendItems(stats)`.
2. Change the Fresnel denominators from `evaluatedCells` to `linkedCells`. With
   whole-map evaluation, "24 % of the ground is zone-clear" would mostly count fields
   where no link exists at all, which is not the question. Keep `fresnelClearCells`,
   `fresnelPartialCells`, `fresnelCutCells` as counts, and make the percentages
   explicitly about linked cells: `fresnelClearPct` = clear **of linked**, and keep
   `fresnelObstructedLinkedCells`. Name things so the reader cannot pick the wrong
   denominator by accident.
3. Add the numbers the HUD needs to say which limit bit (compute them here, in the pure
   layer, not in the UI):
   - `budgetRangeM`: the free-space range of the boresight (the same number `rf()`
     reports), i.e. the reach the link would have on a flat, unobstructed Earth;
   - `maxLinkedRangeM` already exists - keep it;
   - `clippedByRangeCells`: linked cells whose distance is within one coverage cell of
     the study range, i.e. the population that proves the study range is biting;
   - `clippedByMapCells`: linked cells within one coverage cell of the height-field
     boundary;
   - `limitingFactor`: `'budget' | 'study-range' | 'map-edge'`, whichever is smallest of
     (budget range, study range, distance from the site to the map edge in the worst
     linked direction) - with a short comment on how it is decided.
4. `sampleCoverage()` gains `budgetExcluded` (boolean) so `rssiAt()` can tell a caller
   "this value is the free-space upper bound, the ground was never consulted".
5. Update `fresnelZoneLegendItems` and any HUD text that quoted the old denominator so
   it says "of linked cells" (full HUD work is step-009; here only stop the legend from
   lying).
6. Verify: `npm run lint`; `timeout 300 npm run test:unit` (same allowance as step-003);
   and a Node print of a coverage run showing the new fields for the default state with
   the study range at its default and again at 1400 m - the second must report
   `limitingFactor: 'study-range'` with a non-zero `clippedByRangeCells`, which is
   exactly the situation in the user's screenshot.

## Expected result

The stats say what limits the picture: the budget, the study range or the map - and the
zone percentages are about links, not about dirt.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Measured, all three populations of `limitingFactor` (Node, 868 MHz, -80 dBm, clutter 0):

  | case | limiting factor | budget | study | nearest edge | max linked |
  | --- | --- | --- | --- | --- | --- |
  | centre, 10 dBm | `budget` | 1670 m | 3800 m | 2600 m | 1667 m |
  | centre, 10 dBm, range 600 m | `study-range` | 1670 m | 600 m | 2600 m | 598 m |
  | corner (-2100, 0), 27 dBm | `map-edge` | 11 820 m | 3800 m | 500 m | 3800 m |

  A limit is only named when it actually bites: `clippedBy*Cells > 0` **and** that
  radius is the smaller one. A study range far outside the link is measured and kept
  quiet rather than reported as the limit.
- The Fresnel denominator moved to the linked set, and the statistic changed meaning
  with it: at the centre, 80.9 % of *working* links are zone-clear (373 of 1951 are
  not), where the old share of everything evaluated read 24.5 % and mostly counted
  points that could not receive anything at all.
  - `fresnelClearPct` now means **share of linked cells**; new keys
    `fresnelDenominatorCells`, `fresnelClearLinkedCells`, `fresnelObstructedLinkedPct`.
    The bucket counts (`fresnelClearCells`/`Partial`/`Cut`) are unchanged, so the
    legend's three bars still add up to what was walked.
  - Commented at the site of the decision why a zone verdict on a point that cannot
    receive anything is not information.
- To pay for these lines, `coverage.js` had crossed its 350-line budget (367). Split on
  two seams rather than trimming content:
  - `src/propagation/pathtrace.js` (new, L1 pure): one path, the two questions asked
    of it - what the ground costs, and how much zone is left. This is where the
    "loss ray ends on the ground, zone ray ends at receiver height" rule now lives,
    stated once. The ground ray deliberately keeps the **unguarded** profile: the
    endpoint guard belongs to zone judgement, and letting it leak into the loss would
    move the decibels whenever the criterion is retuned.
  - `src/propagation/coveragestats.js` (new, L2 pure): the eight-sector compass tally.
    `SECTOR_COUNT`/`SECTOR_LABELS`/`sectorIndexForAzimuth` are re-exported from
    `coverage.js` so `hud.js` and the tests keep their import.
  Both registered in `tools/lib/arch.js` (layer table + pure list). `coverage.js` is
  back to 347 lines and is now only the sweep and its summary.
- Lint ok (43 src files). Red still: terrain (step-002), propagation and fresnel unit
  tests, which assert the old grid shape and the old percentages - steps 006/007.
