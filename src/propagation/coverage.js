/**
 * Coverage grid: received signal strength for every terrain cell.
 *
 * Layer: L2 (domain service, pure). For each cell it asks the antenna model for
 * gain towards the cell, applies free-space loss, terrain diffraction and an
 * optional clutter margin, then classifies the result against the receiver
 * sensitivity. The result is a bundle of typed arrays that the WebGL overlay
 * paints and the HUD summarises.
 *
 * This is the hot loop of the application: keep it allocation-free per cell.
 */

import { RF } from '../config.js';
import { toCompass } from '../math/vec3.js';
import { mean, percentile } from '../math/scalar.js';
import { freeSpaceLossDb, levelIndexFor, levelMarginsDb } from './rf.js';
import { obstructionLossDb } from './los.js';

export const SECTOR_COUNT = 8;
export const SECTOR_LABELS = Object.freeze(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);

/** Cells closer than this many cell widths are the transmitter's own footprint. */
const NEAR_FIELD_SKIP_FACTOR = 0.6;

/** Compass sector index (0 = N, clockwise) for an azimuth in degrees. */
export function sectorIndexForAzimuth(azimuthDeg) {
  const shifted = (((azimuthDeg + 22.5) % 360) + 360) % 360;
  return Math.floor(shifted / (360 / SECTOR_COUNT)) % SECTOR_COUNT;
}

/**
 * @typedef {{x:number, z:number, y:number, groundY:number, heightM:number}} Site
 */

/**
 * Evaluate the whole grid.
 * @param {{field:import('../terrain/heightfield.js').HeightField, site:Site,
 *   model:import('../antenna/model.js').AntennaModel, freqHz:number,
 *   txPowerDbm?:number, feederLossDb?:number, rxSensitivityDbm?:number,
 *   maxRangeM?:number, clutterLossDb?:number, useDiffraction?:boolean}} options
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
  } = options;

  const cells = field.size * field.size;
  const rssi = new Float32Array(cells);
  const level = new Uint8Array(cells).fill(255);
  const evaluated = new Uint8Array(cells);
  const distanceM = new Float32Array(cells);
  const obstructionDb = new Float32Array(cells);

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
  const skipWithin = field.cellSize * NEAR_FIELD_SKIP_FACTOR;
  let linkedCells = 0;
  let evaluatedCells = 0;
  let blockedCells = 0;
  let bestDbm = -Infinity;
  let worstDbm = Infinity;
  let maxLinkedRangeM = 0;
  let maxLinkedBearingDeg = 0;

  field.forEachCell((x, z, h, index) => {
    const dx = x - site.x;
    const dz = z - site.z;
    const horizontal = Math.hypot(dx, dz);
    if (horizontal < skipWithin || horizontal > maxRangeM) return;

    const dy = h - site.y;
    const slant = Math.hypot(horizontal, dy);
    const gainDbi = model.gainDbiForDirection({ x: dx, y: dy, z: dz });
    const obstruction = useDiffraction
      ? obstructionLossDb(field, { x: site.x, y: site.y, z: site.z }, { x, y: h, z }, freqHz)
      : 0;
    const pathLoss = freeSpaceLossDb(slant, freqHz);
    const value = txPowerDbm - feederLossDb + gainDbi - pathLoss - obstruction - clutterLossDb;

    evaluated[index] = 1;
    rssi[index] = value;
    distanceM[index] = horizontal;
    obstructionDb[index] = obstruction;
    const band = levelIndexFor(value, rxSensitivityDbm, margins);
    level[index] = band;
    levelCounts[band] += 1;
    samples.push(value);
    evaluatedCells += 1;
    if (value > bestDbm) bestDbm = value;
    if (value < worstDbm) worstDbm = value;
    if (obstruction > 6) blockedCells += 1;

    const { azimuthDeg } = toCompass({ x: dx, y: 0, z: dz });
    const sector = sectors[sectorIndexForAzimuth(azimuthDeg)];
    sector.evaluated += 1;
    if (value > sector.bestDbm) sector.bestDbm = value;
    if (value >= rxSensitivityDbm) {
      sector.linked += 1;
      if (horizontal > sector.maxRangeM) sector.maxRangeM = horizontal;
    }

    if (value >= rxSensitivityDbm) {
      linkedCells += 1;
      if (horizontal > maxLinkedRangeM) {
        maxLinkedRangeM = horizontal;
        maxLinkedBearingDeg = azimuthDeg;
      }
    }
  });

  const stats = {
    cells,
    evaluatedCells,
    linkedCells,
    linkAvailabilityPct: evaluatedCells === 0 ? 0 : (100 * linkedCells) / evaluatedCells,
    blockedCells,
    blockedPct: evaluatedCells === 0 ? 0 : (100 * blockedCells) / evaluatedCells,
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
  };

  return {
    size: field.size,
    worldSize: field.worldSize,
    cellSize: field.cellSize,
    rssi,
    level,
    evaluated,
    distanceM,
    obstructionDb,
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

/** Sample the grid at a world position; returns null outside the evaluated area. */
export function sampleCoverage(coverage, field, x, z) {
  const ix = Math.round(field.cellX(x));
  const iz = Math.round(field.cellZ(z));
  if (!field.inBounds(ix, iz)) return null;
  const index = field.index(ix, iz);
  if (!coverage.evaluated[index]) return null;
  return {
    rssiDbm: coverage.rssi[index],
    band: coverage.level[index],
    distanceM: coverage.distanceM[index],
    obstructionDb: coverage.obstructionDb[index],
  };
}
