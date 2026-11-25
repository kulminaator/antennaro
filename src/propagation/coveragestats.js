/**
 * Directional tally for the coverage sweep.
 *
 * Layer: L2 (domain service, pure). The eight compass sectors answer "which way is it
 * working": the HUD's direction table shows how much of each sector links and how far
 * the link reaches there. Split out of `coverage.js` so the sweep loop stays the only
 * thing that file has to be about - it is the hot path of the whole application.
 */

import { fromCompass, rayBoxExitDistance } from '../math/vec3.js';

export const SECTOR_COUNT = 8;
export const SECTOR_LABELS = Object.freeze(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);

/** Compass sector index (0 = N, clockwise) for an azimuth in degrees. */
export function sectorIndexForAzimuth(azimuthDeg) {
  const shifted = (((azimuthDeg + 22.5) % 360) + 360) % 360;
  return Math.floor(shifted / (360 / SECTOR_COUNT)) % SECTOR_COUNT;
}

/**
 * Say where each direction's sweep stopped looking, so a range in the direction table
 * can be marked as a border rather than a maximum.
 *
 * Two boundaries end the search: our study range, and the edge of the map. A direction
 * whose farthest link lies within one coverage cell of the nearer of them did not run
 * out of link - it ran out of map or of work area - and `clippedBy` names which.
 *
 * @param {object[]} sectors the tally's summary
 * @param {{siteX:number, siteZ:number, half:number, studyRangeM:number, cellSpan:number}} options
 */
export function markClippedSectors(sectors, options) {
  const { siteX, siteZ, half, studyRangeM, cellSpan } = options;
  return sectors.map((sector) => {
    const edgeM = rayBoxExitDistance(
      { x: siteX, z: siteZ },
      fromCompass(sector.azimuthDeg, 0),
      half,
    );
    const isEdge = edgeM <= studyRangeM;
    const limitM = isEdge ? edgeM : studyRangeM;
    return {
      ...sector,
      /** Distance from the mast to the boundary that ends the search in this direction. */
      limitM,
      limitKind: isEdge ? 'map-edge' : 'study-range',
      clippedBy: sector.maxRangeM > 0 && sector.maxRangeM >= limitM - cellSpan
        ? (isEdge ? 'map-edge' : 'study-range')
        : null,
    };
  });
}

/**
 * Name the thing that stopped the coverage from growing.
 *
 * Three circles are in play and the user cannot tell them apart by looking: the link's
 * own budget, the study area we were asked to evaluate, and the edge of the map. Only
 * the first is a property of the antenna, so the result says which one bites - and a
 * circle only counts as the limit if links actually lie on it, otherwise it is measured
 * and kept quiet about.
 *
 * @param {{linkedCells:number, budgetRangeM:number, studyRangeM:number,
 *   nearestMapEdgeM:number, clippedByRangeCells:number, clippedByMapCells:number}} options
 * @returns {{budgetRangeM:number, studyRangeM:number, nearestMapEdgeM:number,
 *   clippedByRangeCells:number, clippedByMapCells:number,
 *   limitingFactor:'budget'|'study-range'|'map-edge'}}
 */
export function describeLimits(options) {
  const {
    linkedCells, budgetRangeM, studyRangeM, nearestMapEdgeM, clippedByRangeCells, clippedByMapCells,
  } = options;
  let limitingFactor = 'budget';
  if (linkedCells > 0 && clippedByMapCells > 0 && nearestMapEdgeM <= Math.min(budgetRangeM, studyRangeM)) {
    limitingFactor = 'map-edge';
  } else if (linkedCells > 0 && clippedByRangeCells > 0 && studyRangeM <= budgetRangeM) {
    limitingFactor = 'study-range';
  }
  return {
    /** Free-space reach of the boresight: what this budget buys over flat ground. A
        radius, so it can be compared against the two areas drawn on the map. */
    budgetRangeM,
    studyRangeM,
    /** Distance from the mast to the nearest edge of the world. */
    nearestMapEdgeM,
    /** Linked points within one coverage cell of the study-range ring / the map edge. */
    clippedByRangeCells,
    clippedByMapCells,
    /** `'budget'` is the answer you want: the drape ends where the link does. */
    limitingFactor,
  };
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
    /** Of those, the points free-space loss alone had already ruled out. */
    excluded: 0,
    linked: 0,
    bestDbm: -Infinity,
    maxRangeM: 0,
  }));

  function record(azimuthDeg, point) {
    const sector = sectors[sectorIndexForAzimuth(azimuthDeg)];
    sector.evaluated += 1;
    if (point.excluded) {
      sector.excluded += 1;
      return;
    }
    if (point.value > sector.bestDbm) sector.bestDbm = point.value;
    if (!point.linked) return;
    sector.linked += 1;
    if (point.horizontal > sector.maxRangeM) sector.maxRangeM = point.horizontal;
  }

  function summary() {
    return sectors.map((sector) => {
      // Percentage of the *possible* ground in this direction that actually links.
      // Dividing by `evaluated` instead would mostly measure how big the map is next
      // to the link: beyond the free-space bound there was never a chance.
      const possible = sector.evaluated - sector.excluded;
      return {
        ...sector,
        linkedPct: possible === 0 ? 0 : (100 * sector.linked) / possible,
        bestDbm: Number.isFinite(sector.bestDbm) ? sector.bestDbm : 0,
      };
    });
  }

  return { record, summary };
}
