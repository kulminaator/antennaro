/**
 * Directional tally for the coverage sweep.
 *
 * Layer: L2 (domain service, pure). The eight compass sectors answer "which way is it
 * working": the HUD's direction table shows how much of each sector links and how far
 * the link reaches there. Split out of `coverage.js` so the sweep loop stays the only
 * thing that file has to be about - it is the hot path of the whole application.
 */

export const SECTOR_COUNT = 8;
export const SECTOR_LABELS = Object.freeze(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);

/** Compass sector index (0 = N, clockwise) for an azimuth in degrees. */
export function sectorIndexForAzimuth(azimuthDeg) {
  const shifted = (((azimuthDeg + 22.5) % 360) + 360) % 360;
  return Math.floor(shifted / (360 / SECTOR_COUNT)) % SECTOR_COUNT;
}

/**
 * A mutable tally, filled during the sweep and summarised afterwards.
 * @returns {{record:(azimuthDeg:number, point:{linked:boolean, horizontal:number,
 *   value:number})=>void, summary:()=>object[]}}
 */
export function createSectorTally() {
  const sectors = SECTOR_LABELS.map((label, i) => ({
    label,
    azimuthDeg: i * (360 / SECTOR_COUNT),
    evaluated: 0,
    linked: 0,
    bestDbm: -Infinity,
    maxRangeM: 0,
  }));

  function record(azimuthDeg, point) {
    const sector = sectors[sectorIndexForAzimuth(azimuthDeg)];
    sector.evaluated += 1;
    if (point.value > sector.bestDbm) sector.bestDbm = point.value;
    if (!point.linked) return;
    sector.linked += 1;
    if (point.horizontal > sector.maxRangeM) sector.maxRangeM = point.horizontal;
  }

  function summary() {
    return sectors.map((sector) => ({
      ...sector,
      linkedPct: sector.evaluated === 0 ? 0 : (100 * sector.linked) / sector.evaluated,
      bestDbm: Number.isFinite(sector.bestDbm) ? sector.bestDbm : 0,
    }));
  }

  return { record, summary };
}
