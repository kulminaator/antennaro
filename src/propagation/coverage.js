/**
 * Coverage grid: received signal strength over the whole map.
 *
 * Layer: L2 (domain service, pure). For each grid point: antenna gain towards it,
 * free-space loss, terrain diffraction, an optional clutter margin, classified against
 * the receiver sensitivity. The result is a bundle of typed arrays that the WebGL
 * overlay paints and the HUD summarises. This is the hot loop of the application - keep
 * it allocation-free per point - while the two questions asked of each path live in
 * `pathtrace.js` and the direction tally and limit report in `coveragestats.js`.
 *
 * Two decisions keep the picture honest and the loop cheap:
 *
 * - **The study area is the map, not a circle.** `maxRangeM` still exists (the slider
 *   can shrink the work area to save time) but its default covers the map. A disc we
 *   chose must never look like the antenna's reach: when it bites, `stats.limitingFactor`
 *   says so and the view draws the ring.
 * - **Coarser than the ground.** `RF.coverageStride` points at every n-th terrain
 *   vertex: landforms need ~15 m vertices to look like land while a link boundary is
 *   kilometres wide. Walking all 121 800 of them measured 734 ms in Node.
 *
 * A point whose **free-space loss alone** already breaks the budget is flagged
 * `budgetExcluded` and no ray is walked for it. That is not an approximation: diffraction
 * and clutter only subtract, so such a point cannot link and the stored value is the
 * upper bound it failed to beat. `tests/unit/coverage.test.js` proves the shortcut
 * leaves the linked set identical; keep that test true.
 *
 * Each walked point also records its **first Fresnel zone** clearance against
 * `RF.fresnelClearFraction` - a reliability flag, not another loss term, because the dB
 * already come from the same Fresnel/Kirchhoff ratio and charging it twice would punish
 * the same ridge twice.
 */

import { RF } from '../config.js';
import { toCompass } from '../math/vec3.js';
import { clamp, mean, percentile } from '../math/scalar.js';
import { freeSpaceLossDb, freeSpaceRangeM, levelIndexFor, levelMarginsDb } from './rf.js';
import { tracePath } from './pathtrace.js';
import { createSectorTally, describeEarth, describeLimits, markClippedSectors } from './coveragestats.js';

export { SECTOR_COUNT, SECTOR_LABELS, sectorIndexForAzimuth } from './coveragestats.js';

/** Cells closer than this many cell widths are the transmitter's own footprint. */
const NEAR_FIELD_SKIP_FACTOR = 0.6;

/** Clearance ratios are stored capped: 100 zone radii means "nothing to judge". */
const CLEARANCE_CAP = 100;

/**
 * @typedef {{x:number, z:number, y:number, groundY:number, heightM:number}} Site
 */

/**
 * Evaluate the grid.
 * @param {{field:import('../terrain/heightfield.js').HeightField, site:Site,
 *   model:import('../antenna/model.js').AntennaModel, freqHz:number,
 *   txPowerDbm?:number, feederLossDb?:number, rxSensitivityDbm?:number,
 *   maxRangeM?:number, clutterLossDb?:number, useDiffraction?:boolean,
 *   rxHeightM?:number, fresnelClearFraction?:number,
 *   stride?:number, budgetPrefilter?:boolean}} options
 */
export function computeCoverage(options) {
  const {
    field, site, model, freqHz,
    txPowerDbm = RF.defaultTxPowerDbm,
    feederLossDb = 0,
    rxSensitivityDbm = RF.defaultRxSensitivityDbm,
    maxRangeM = RF.defaultMaxRangeM,
    clutterLossDb = RF.clutterLossDb,
    useDiffraction = true,
    rxHeightM = RF.fresnelRxHeightM,
    fresnelClearFraction = RF.fresnelClearFraction,
    stride = RF.coverageStride,
    budgetPrefilter = true,
  } = options;

  // The coverage grid is a decimation of the terrain grid: same square domain,
  // coarser step, so the ground keeps its resolution and the ray walks do not.
  const gridStride = Math.max(1, Math.min(field.size - 1, Math.round(stride)));
  const size = Math.floor((field.size - 1) / gridStride) + 1;
  const cellSpan = field.cellSize * gridStride;
  const half = field.worldSize / 2;
  // How far the mast can get from home before the picture stops: the nearest map edge.
  const nearestMapEdgeM = Math.min(half - site.x, half + site.x, half - site.z, half + site.z);
  const cells = size * size;
  const rssi = new Float32Array(cells);
  const level = new Uint8Array(cells).fill(255);
  const evaluated = new Uint8Array(cells);
  const distanceM = new Float32Array(cells);
  const obstructionDb = new Float32Array(cells);
  const fresnelClearance = new Float32Array(cells);
  const fresnelClear = new Uint8Array(cells);
  /** 1 where free-space loss alone lost the link, so the ground was never consulted. */
  const budgetExcluded = new Uint8Array(cells);

  const margins = levelMarginsDb();
  const bandCount = margins.length;
  const levelCounts = new Array(bandCount + 1).fill(0);
  const sectors = createSectorTally();

  const samples = [];
  const skipWithin = cellSpan * NEAR_FIELD_SKIP_FACTOR;
  // Reused across points: this loop runs tens of thousands of times per change.
  const from = { x: site.x, y: site.y, z: site.z };
  let linkedCells = 0;
  let evaluatedCells = 0;
  let blockedCells = 0;
  let fresnelClearCells = 0;
  let fresnelPartialCells = 0;
  let fresnelCutCells = 0;
  let fresnelObstructedLinkedCells = 0;
  let worstClearance = Infinity;
  let worstClearanceDistanceM = 0;
  let bestDbm = -Infinity;
  let worstDbm = Infinity;
  let maxLinkedRangeM = 0;
  let maxLinkedBearingDeg = 0;
  let budgetExcludedCells = 0;
  let clippedByRangeCells = 0;
  let clippedByMapCells = 0;
  let fresnelClearLinkedCells = 0;

  for (let gz = 0; gz < size; gz += 1) {
    const tz = Math.min(gz * gridStride, field.size - 1);
    const z = field.worldZ(tz);
    for (let gx = 0; gx < size; gx += 1) {
      const tx = Math.min(gx * gridStride, field.size - 1);
      const x = field.worldX(tx);
      const index = gz * size + gx;
      const dx = x - site.x;
      const dz = z - site.z;
      const horizontal = Math.hypot(dx, dz);
      if (horizontal < skipWithin || horizontal > maxRangeM) continue;

      const h = field.heights[field.index(tx, tz)];
      const dy = h - site.y;
      const slant = Math.hypot(horizontal, dy);
      const gainDbi = model.gainDbiForDirection({ x: dx, y: dy, z: dz });
      const pathLoss = freeSpaceLossDb(slant, freqHz);
      // The most optimistic value any ground can produce: diffraction and clutter
      // only subtract. Below sensitivity here, and the point cannot link whatever
      // the terrain does, so the rays are not walked - see the header.
      const optimistic = txPowerDbm - feederLossDb + gainDbi - pathLoss - clutterLossDb;
      const excluded = budgetPrefilter && optimistic < rxSensitivityDbm;

      // A point the pre-filter dismissed carries **no verdict**: obstruction 0, the
      // clearance sentinel, and `fresnelClear` false. Those arrays are not claims about
      // ground we never looked at - `budgetExcluded` is the claim - and every bucket,
      // statistic and colour that reads them skips dismissed points. Keeping the pair
      // "sentinel + false" rather than "sentinel + true" is what stops the zone view
      // painting the far map green.
      let obstruction = 0;
      let ratio = CLEARANCE_CAP;
      let zoneClear = false;
      let clippedByRange = false;
      let clippedByMap = false;
      if (!excluded) {
        const steps = clamp(Math.round(horizontal / field.cellSize) * 2, 12, RF.profileSamples);
        const traced = tracePath(field, from, { x, y: h, z }, {
          freqHz, samples: steps, rxHeightM, guard: RF.fresnelEndpointGuard,
        });
        obstruction = useDiffraction ? traced.obstructionDb : 0;
        ratio = Number.isFinite(traced.clearanceRatio)
          ? Math.min(CLEARANCE_CAP, traced.clearanceRatio)
          : CLEARANCE_CAP;
        zoneClear = ratio >= fresnelClearFraction;
        // Linked points sitting on the rim of an area *we* chose, rather than inside a
        // link that happens to end there. Only `maxRangeM` is ours; the map edge is the
        // world, and it gets named too so nobody reads a border as an antenna limit.
        clippedByRange = horizontal > maxRangeM - cellSpan;
        clippedByMap = Math.abs(x) > half - cellSpan || Math.abs(z) > half - cellSpan;
      }
      const value = optimistic - obstruction;
      const band = levelIndexFor(value, rxSensitivityDbm, margins);

      evaluated[index] = 1;
      budgetExcluded[index] = excluded ? 1 : 0;
      rssi[index] = value;
      distanceM[index] = horizontal;
      obstructionDb[index] = obstruction;
      fresnelClearance[index] = ratio;
      fresnelClear[index] = zoneClear ? 1 : 0;
      level[index] = band;
      levelCounts[band] += 1;
      evaluatedCells += 1;
      if (excluded) {
        budgetExcludedCells += 1;
      } else {
        // Decibel statistics describe the ground we actually modelled, not the far
        // tail the pre-filter dismissed: including 3 km hopeless points would drag
        // the median into the noise floor and tell the user nothing.
        samples.push(value);
        if (value > bestDbm) bestDbm = value;
        if (value < worstDbm) worstDbm = value;
        if (obstruction > 6) blockedCells += 1;
        if (zoneClear) fresnelClearCells += 1;
        else if (ratio > 0) fresnelPartialCells += 1;
        else fresnelCutCells += 1;
        if (!zoneClear && value >= rxSensitivityDbm) fresnelObstructedLinkedCells += 1;
        if (ratio < worstClearance) {
          worstClearance = ratio;
          worstClearanceDistanceM = horizontal;
        }
      }

      const { azimuthDeg } = toCompass({ x: dx, y: 0, z: dz });
      sectors.record(azimuthDeg, { linked: value >= rxSensitivityDbm, horizontal, value, excluded });
      if (value >= rxSensitivityDbm) {
        linkedCells += 1;
        if (clippedByRange) clippedByRangeCells += 1;
        if (clippedByMap) clippedByMapCells += 1;
        if (zoneClear) fresnelClearLinkedCells += 1;
        if (horizontal > maxLinkedRangeM) {
          maxLinkedRangeM = horizontal;
          maxLinkedBearingDeg = azimuthDeg;
        }
      }
    }
  }

  // Points the ground was actually asked about. Every share below is stated against
  // this, because a percentage whose denominator includes ground that could never have
  // linked is a statement about the size of the map, not about the link.
  const walkedCells = evaluatedCells - budgetExcludedCells;

  // Free-space reach of the boresight: what this budget buys over perfectly flat
  // ground. A radius, so it can be compared with the study range and the map edge.
  const budgetRangeM = freeSpaceRangeM(txPowerDbm, model.peakGainDbi, rxSensitivityDbm, freqHz, feederLossDb);

  const stats = {
    cells,
    /** Terrain vertices this grid steps over, and what one coverage point measures. */
    coverageStride: gridStride, coverageCellSizeM: cellSpan,
    evaluatedCells,
    /** Points the ground was asked about: the study area minus the hopeless tail. */
    walkedCells,
    linkedCells,
    /** Points where free-space loss alone lost the link; no ray was walked there. */
    budgetExcludedCells,
    linkAvailabilityPct: walkedCells === 0 ? 0 : (100 * linkedCells) / walkedCells,
    /** The same links as a share of the whole study area: how much *map* is served. */
    mapCoveragePct: evaluatedCells === 0 ? 0 : (100 * linkedCells) / evaluatedCells,
    blockedCells,
    blockedPct: walkedCells === 0 ? 0 : (100 * blockedCells) / walkedCells,
    /** Evaluated points whose first Fresnel zone meets the clearance criterion. */
    fresnelClearCells,
    /** The three buckets the zone colour ramp paints, mutually exclusive and total. */
    fresnelPartialCells,
    fresnelCutCells,
    /** Zone state is reported **against working links**: a zone verdict on a point that
        cannot receive anything is not information. `fresnelClearPct` and
        `fresnelObstructedLinkedPct` are the two halves of the linked set. */
    fresnelDenominatorCells: linkedCells,
    fresnelClearLinkedCells,
    fresnelClearPct: linkedCells === 0 ? 0 : (100 * fresnelClearLinkedCells) / linkedCells,
    /** Cells that make the link budget and still have the zone cut: links that work
        on paper and misbehave in the field. */
    fresnelObstructedLinkedCells,
    fresnelObstructedLinkedPct: linkedCells === 0 ? 0
      : (100 * fresnelObstructedLinkedCells) / linkedCells,
    /** Tightest clearance found on any evaluated path, in first-zone radii. */
    worstClearance: Number.isFinite(worstClearance) ? worstClearance : 0,
    worstClearanceDistanceM,
    /** The assumptions every zone number above is stated for. */
    fresnelRxHeightM: rxHeightM,
    fresnelClearFraction,
    meanDbm: samples.length === 0 ? 0 : mean(samples),
    medianDbm: percentile(samples, 0.5),
    weakDbm: percentile(samples, 0.1),
    bestDbm: Number.isFinite(bestDbm) ? bestDbm : 0,
    worstDbm: Number.isFinite(worstDbm) ? worstDbm : 0,
    maxLinkedRangeM,
    maxLinkedBearingDeg,
    levelCounts,
    sectors: markClippedSectors(sectors.summary(), {
      siteX: site.x, siteZ: site.z, half, studyRangeM: maxRangeM, cellSpan,
    }),
    sensitivityDbm: rxSensitivityDbm,
    margins,
    maxRangeM,
    ...describeLimits({
      linkedCells,
      budgetRangeM,
      studyRangeM: maxRangeM,
      nearestMapEdgeM,
      clippedByRangeCells,
      clippedByMapCells,
    }),
    ...describeEarth({
      siteHeightM: site.heightM, maxLinkedRangeM, rxHeightM, worldSizeM: field.worldSize,
    }),
  };

  return {
    size,
    /** How many terrain vertices one coverage step spans. */
    stride: gridStride,
    terrainSize: field.size,
    worldSize: field.worldSize,
    cellSize: cellSpan,
    rssi,
    level,
    evaluated,
    distanceM,
    obstructionDb,
    fresnelClearance,
    fresnelClear,
    budgetExcluded,
    sensitivityDbm: rxSensitivityDbm,
    margins,
    stats,
  };
}

/** Band index for a value, exposed for legends and tooltips. */
export function bandFor(rssiDbm, coverage) {
  return levelIndexFor(rssiDbm, coverage.sensitivityDbm, coverage.margins);
}

/** Legend rows: [{band, colourless label, minimum dBm}]. */
export function coverageLegend(coverage) {
  return coverage.margins.map((margin, i) => ({
    band: i,
    minDbm: coverage.sensitivityDbm + margin,
    marginDb: margin,
  }));
}

/**
 * Sample the grid at a world position; returns null outside the evaluated area.
 * The coverage grid may be coarser than the terrain grid, so the position maps to
 * the nearest coverage point, not to the cell the terrain would put it in.
 */
export function sampleCoverage(coverage, field, x, z) {
  const stride = coverage.stride ?? 1;
  const ix = Math.round(field.cellX(x) / stride);
  const iz = Math.round(field.cellZ(z) / stride);
  if (ix < 0 || iz < 0 || ix >= coverage.size || iz >= coverage.size) return null;
  const index = iz * coverage.size + ix;
  if (!coverage.evaluated[index]) return null;
  return {
    rssiDbm: coverage.rssi[index],
    band: coverage.level[index],
    distanceM: coverage.distanceM[index],
    obstructionDb: coverage.obstructionDb[index],
    fresnelClearanceRatio: coverage.fresnelClearance[index],
    fresnelClear: coverage.fresnelClear[index] === 1,
    /** True when the value is the free-space upper bound: the ground was never asked. */
    budgetExcluded: coverage.budgetExcluded?.[index] === 1,
  };
}
