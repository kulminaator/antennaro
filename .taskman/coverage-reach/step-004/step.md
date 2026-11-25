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
