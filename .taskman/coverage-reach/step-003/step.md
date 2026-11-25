# step-003: coverage: strided evaluation plus a free-space budget pre-filter

## How to perform this step

1. Read `src/propagation/coverage.js` in full (it is the biggest file this task
   touches, and it is near the line budget - if adding the stride and the pre-filter
   pushes it past 350 lines, split the per-cell evaluation into a small sibling module
   rather than squeezing comments out).
2. Stride: evaluate the grid on every `WORLD.coverageStride`-th vertex instead of every
   vertex. That means: the iteration over `field.forEachCell` becomes an explicit loop
   over `ix, iz` stepping by the stride (include the last vertex so the map edge is
   evaluated), the typed arrays are sized `(size-1)/stride + 1` per side, and the
   coverage record carries its own `stride` and `cellSize` so the mesh and
   `sampleCoverage` can map world position -> coverage index without guessing. Keep
   `sampleCoverage(coverage, field, x, z)` working for callers: it must find the nearest
   *evaluated* point, not assume the terrain grid.
3. Whole map, no disc by default: `maxRangeM` stays an option but the default (from
   config) now covers the map. Keep the range test, because the slider still has to be
   able to shrink the study area; when it does, that is a *declared* limit (steps 8-9).
4. Budget pre-filter, the part that must be provably lossless: before walking any ray,
   compute the free-space RSSI for the cell with the **pattern gain in that direction**
   (`eirpDbi(direction) - freeSpaceLoss(slant)`), and if even that - the most
   optimistic value any terrain can give, because diffraction and clutter only ever
   subtract - lands below `rxSensitivityDbm`, then:
   - store that free-space RSSI and the corresponding band, so `rssiAt()` still answers;
   - set a new `budgetExcluded` array element to 1;
   - skip the diffraction ray walk *and* the Fresnel ray walk (they cannot change the
     linked verdict) and do not include the cell in the Fresnel statistics.
   Add an option `budgetPrefilter = true` so a test can turn it off and prove the linked
   set is unchanged. Comment the argument, because "we skipped work because the answer
   was already known" is exactly the kind of thing that rots into a silent bug.
5. Stats for this step (the rest comes in step-004): `budgetExcludedCells`,
   `coverageStride`, `studyRangeM`, and keep everything that already exists working.
6. Verify:
   - `npm run lint`, `timeout 300 npm run test:unit` - failures allowed only in tests
     that hard-code the old grid/coordinates (steps 006-007 own those); the coverage and
     rf unit tests that do not depend on geography must pass.
   - Cost gate, Node: extend `.tmp/cost-probe.mjs` to the new config and print
     whole-map coverage time with the pre-filter on and off, for the omni dipole and the
     10-director Yagi at 10 dBm / -80 dBm. Record both. The gate is: worst case at or
     below about 250 ms in Node; if it is not, say so in the comments and stop - do not
     quietly accept 700 ms.

## Expected result

Coverage covers the map, its cost is bounded by physics rather than by a circle, and a
flag records which cells were declared hopeless before the ground was consulted.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Cost gate met, Node, mast at (-2100, 0), 868 MHz, sensitivity -80 dBm, whole map:

  | design | budget radius | stride 2 | stride 1 | excluded |
  | --- | --- | --- | --- | --- |
  | omni dipole (10 dBm) | 937 m | 30 ms | 60 ms | 20 793 |
  | collinear (10 dBm) | 1670 m | 41 ms | 129 ms | 16 652 |
  | Yagi (10 dBm) | 2204 m | 21 ms | 68 ms | 21 097 |
  | biquad (20 dBm) | 9640 m | 90 ms | 386 ms | 5 687 |

  Worst case 90 ms against the 250 ms gate; stride 1 would have blown it on the last row.
- Pre-filter honesty measured before writing its test: comparing `budgetPrefilter` on
  and off over the same grid gave **0 linked-set differences and 0.0000 dB drift** on
  every linked cell, for all four designs.
- The stride lives in `computeCoverage` (`options.stride`, default `RF.coverageStride`);
  the result now carries `size`, `stride`, `terrainSize` and `cellSize`, and stats carry
  `coverageStride`, `coverageCellSizeM`, `budgetExcludedCells`, `studyRangeM`. `stats.cells`
  is the *coverage* grid's point count, which is what step-011 needs for its
  "whole map is looked at" assertion.
- Had to change two more files to keep every commit green rather than half-migrated
  (their real content stays in steps 005/009):
  - `coveragemesh.js` now builds its geometry on the coverage grid, draping each
    coverage vertex onto the terrain height beneath it; painting rules untouched. It
    prebuilds at `RF.coverageStride` so the mesh has valid geometry before the first
    coverage result exists.
  - `src/app/testapi.js` `rssiAt()` delegates to `sampleCoverage()` instead of indexing
    the terrain grid itself - it was silently reading the wrong array the moment the
    grids diverged, and now reports `budgetExcluded` for free.
- Decibel statistics (mean/median/weak/best/worst) are computed over **walked** cells
  only; folding in the pre-filtered far tail would drag "Median RSSI" to the noise floor
  and say nothing. Commented at the site of the decision.
- Live (port 8145): coverage grid 175^2 at 29.9 m, `evaluated 30624` of `cells 30625`
  (whole map, the skipped centre point aside), `excluded 27796`, dipole max linked 936 m
  against a 937 m budget, live rebuild 147 ms, and 20 dBm of transmitter power moved
  linked cells 844 -> 3797. No console errors.
- Red for later steps: `tests/unit/terrain.test.js` (valley probes, step-002),
  `tests/unit/propagation.test.js` (geography + grid), `tests/unit/fresnel.test.js`
  (asserted the arrays were `field.size^2` long, which is no longer the contract).
