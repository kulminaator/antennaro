/**
 * Coverage grid: received signal strength over the whole map.
 *
 * Layer: L2 (domain service, pure). For each grid point it asks the antenna model for
 * gain towards it, applies free-space loss, terrain diffraction and an optional
 * clutter margin, then classifies the result against the receiver sensitivity. The
 * result is a bundle of typed arrays that the WebGL overlay paints and the HUD
 * summarises.
 *
 * Two decisions keep the picture honest and the loop cheap:
 *
 * - **The study area is the map, not a circle.** `maxRangeM` still exists (the slider
 *   can shrink the work area to save time), but its default covers the map. A disc we
 *   chose must never be able to look like the antenna's reach: when it bites, the
 *   result reports it (`stats.limitingFactor`) and the view draws the ring.
 * - **Points evaluated on a coarser grid than the ground.** `RF.coverageStride` points
 *   at every n-th terrain vertex: landforms need ~15 m vertices to look like land,
 *   while a link boundary is kilometres wide. Walking 121 800 of them measured 734 ms
 *   in Node; the stride is what makes whole-map evaluation interactive.
 *
 * A point whose **free-space loss alone** already breaks the budget is flagged
 * `budgetExcluded` and no ray is walked for it. That is not an approximation of the
 * answer: diffraction and clutter only ever subtract, so such a point cannot link and
 * the value stored is the upper bound it failed to beat. `tests/unit/coverage.test.js`
 * proves the shortcut leaves the linked set identical; keep that test true.
 *
 * Alongside the decibels each walked point records the state of its **first Fresnel
 * zone**: how much of the zone the ground leaves clear on the way from the mast to a
 * receiver at `RF.fresnelRxHeightM`, and whether that meets the
 * `RF.fresnelClearFraction` criterion. That is a reliability flag, not another loss
 * term - the dB already come from the same Fresnel/Kirchhoff ratio, and charging it
 * twice would punish the same ridge twice.
 *
 * This is the hot loop of the application: keep it allocation-free per cell.
 */

import { RF } from '../config.js';
import { toCompass } from '../math/vec3.js';
import { clamp, mean, percentile } from '../math/scalar.js';
import { freeSpaceLossDb, levelIndexFor, levelMarginsDb } from './rf.js';
import { diffractionLossDb, rayProfile } from './los.js';

export const SECTOR_COUNT = 8;
export const SECTOR_LABELS = Object.freeze(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);

/** Cells closer than this many cell widths are the transmitter's own footprint. */
const NEAR_FIELD_SKIP_FACTOR = 0.6;

/** Clearance ratios are stored capped: 100 zone radii means "nothing to judge". */
const CLEARANCE_CAP = 100;

/** Compass sector index (0 = N, clockwise) for an azimuth in degrees. */
export function sectorIndexForAzimuth(azimuthDeg) {
  const shifted = (((azimuthDeg + 22.5) % 360) + 360) % 360;
  return Math.floor(shifted / (360 / SECTOR_COUNT)) % SECTOR_COUNT;
}

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
  const sectors = [];
  for (let i = 0; i < SECTOR_COUNT; i += 1) {
    sectors.push({
      label: SECTOR_LABELS[i],
      azimuthDeg: i * (360 / SECTOR_COUNT),
      evaluated: 0,
      linked: 0,
      bestDbm: -Infinity,
      maxRangeM: 0,
    });
  }

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

      let obstruction = 0;
      let ratio = CLEARANCE_CAP;
      let zoneClear = false;
      if (!excluded) {
        const steps = clamp(Math.round(horizontal / field.cellSize) * 2, 12, RF.profileSamples);
        // The zone is judged against a receiver standing `rxHeightM` above the point -
        // see RF.fresnelRxHeightM for why a terminal on the ground makes the criterion
        // meaningless. The ray the loss is charged against stays the one that ends on
        // the ground, so moving the assumption does not quietly move the decibels.
        const zone = { x, y: h + rxHeightM, z };
        const zoneProfile = rayProfile(field, from, zone, {
          samples: steps, freqHz, guard: RF.fresnelEndpointGuard,
        });
        obstruction = useDiffraction
          ? (() => {
            const groundProfile = rxHeightM === 0
              ? zoneProfile
              : rayProfile(field, from, { x, y: h, z }, { samples: steps });
            return diffractionLossDb(groundProfile.maxExcess, groundProfile.d1, groundProfile.d2, freqHz);
          })()
          : 0;
        ratio = Number.isFinite(zoneProfile.minClearance)
          ? Math.min(CLEARANCE_CAP, zoneProfile.minClearance)
          : CLEARANCE_CAP;
        zoneClear = ratio >= fresnelClearFraction;
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
      const sector = sectors[sectorIndexForAzimuth(azimuthDeg)];
      sector.evaluated += 1;
      if (value > sector.bestDbm) sector.bestDbm = value;
      if (value >= rxSensitivityDbm) {
        sector.linked += 1;
        if (horizontal > sector.maxRangeM) sector.maxRangeM = horizontal;
        linkedCells += 1;
        if (horizontal > maxLinkedRangeM) {
          maxLinkedRangeM = horizontal;
          maxLinkedBearingDeg = azimuthDeg;
        }
      }
    }
  }

  const stats = {
    cells,
    /** Terrain vertices this grid steps over, and what one coverage cell measures. */
    coverageStride: gridStride,
    coverageCellSizeM: cellSpan,
    evaluatedCells,
    linkedCells,
    /** Points where free-space loss alone lost the link; no ray was walked there. */
    budgetExcludedCells,
    linkAvailabilityPct: evaluatedCells === 0 ? 0 : (100 * linkedCells) / evaluatedCells,
    blockedCells,
    blockedPct: evaluatedCells === 0 ? 0 : (100 * blockedCells) / evaluatedCells,
    /** Evaluated cells whose first Fresnel zone meets the clearance criterion. */
    fresnelClearCells,
    fresnelClearPct: evaluatedCells === 0 ? 0 : (100 * fresnelClearCells) / evaluatedCells,
    /** The three buckets the zone colour ramp paints, mutually exclusive and total. */
    fresnelPartialCells,
    fresnelCutCells,
    /** Cells that make the link budget and still have the zone cut: links that work
        on paper and misbehave in the field. */
    fresnelObstructedLinkedCells,
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
    sectors: sectors.map((sector) => ({
      ...sector,
      linkedPct: sector.evaluated === 0 ? 0 : (100 * sector.linked) / sector.evaluated,
      bestDbm: Number.isFinite(sector.bestDbm) ? sector.bestDbm : 0,
    })),
    sensitivityDbm: rxSensitivityDbm,
    margins,
    maxRangeM,
    /** The work area, named so the HUD can say when it - not the link - is the limit. */
    studyRangeM: maxRangeM,
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
