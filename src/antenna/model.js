/**
 * Antenna model: catalogue entry + parameters + aim, resolved into something the
 * rest of the app can query for gain in any direction.
 *
 * Layer: L2 (domain service, still pure). This is the only module that composes
 * catalogue maths, aiming frames and geometry descriptors, and it is the object
 * the coverage engine and the lobe renderer read.
 *
 * Everything returned is in world units unless the name says "local".
 */

import { ANTENNA } from '../config.js';
import { PI, clamp } from '../math/scalar.js';
import { worldToLocalAngles, localAnglesToDirection, createAimFrame, normaliseAim, effectiveTiltDeg, describeAim } from './aim.js';
import { getAntennaEntry, normaliseParams, patternSpec } from './catalogue.js';
import { buildAntennaGeometry, conductorLengthM } from './geometryspec.js';
import {
  PATTERN_FLOOR_DB, azimuthDb, beamwidthFromShape, collinearDb, dipoleDb,
  elevationDb, frontToBackFromPattern, lobeRadius,
} from './pattern.js';

/** Azimuth shape descriptor from the catalogue -> attenuation function. */
export function resolveAzimuthFn(spec) {
  if (spec.kind === 'omni') return () => 0;
  return (azimuthRad) => azimuthDb(azimuthRad, spec);
}

/** Elevation shape descriptor from the catalogue -> attenuation function. */
export function resolveElevationFn(spec) {
  if (spec.kind === 'dipole') return (elevationRad) => dipoleDb(elevationRad);
  if (spec.kind === 'collinear') return (elevationRad) => collinearDb(elevationRad, spec.array);
  return (elevationRad) => elevationDb(elevationRad, spec);
}

/**
 * @typedef {ReturnType<typeof createAntennaModel>} AntennaModel
 */

/**
 * @param {{designId:string, params?:Record<string,number>, aim?:{azimuthDeg?:number,tiltDeg?:number,beamTiltDeg?:number}, wavelength:number}} options
 */
export function createAntennaModel(options) {
  const { designId, params = {}, aim = {}, wavelength } = options;
  const entry = getAntennaEntry(designId);
  if (!entry) throw new RangeError(`unknown antenna design: ${designId}`);
  if (!(wavelength > 0)) throw new RangeError('antenna model needs a wavelength > 0');

  const cleanParams = normaliseParams(designId, params);
  const cleanAim = normaliseAim(aim, {
    tiltMinDeg: ANTENNA.tiltLimitsDeg.min,
    tiltMaxDeg: ANTENNA.tiltLimitsDeg.max,
  });
  const spec = patternSpec(designId, cleanParams);
  const hShape = resolveAzimuthFn(spec.azimuth);
  const vShape = resolveElevationFn(spec.elevation);
  const peakGainDbi = entry.gainDbi(cleanParams);
  const frame = createAimFrame(cleanAim);
  const geometry = buildAntennaGeometry(entry.geometryKind, cleanParams, wavelength);
  const boresightDeg = Object.freeze({
    azimuthDeg: cleanAim.azimuthDeg,
    elevationDeg: effectiveTiltDeg(cleanAim),
  });

  /**
   * Pattern attenuation (dB, <= 0) at local antenna angles: the azimuth and
   * elevation shapes add in decibels, then the result is clamped to the pattern
   * floor so that "40 dB down" really is the quietest thing the model can say.
   */
  function relativeDb(azimuthRad, elevationRad) {
    const total = hShape(clamp(azimuthRad, -PI, PI)) + vShape(clamp(elevationRad, -PI / 2, PI / 2));
    return clamp(total, PATTERN_FLOOR_DB, 0);
  }

  /** Absolute gain (dBi) at local antenna angles. */
  function gainDbiAt(azimuthRad, elevationRad) {
    return peakGainDbi + relativeDb(azimuthRad, elevationRad);
  }

  /** Absolute gain (dBi) towards a world direction (any length). */
  function gainDbiForDirection(direction) {
    const local = worldToLocalAngles(frame, direction);
    return gainDbiAt(local.azimuthRad, local.elevationRad);
  }

  /** Attenuation (dB) towards a world direction. */
  function relativeDbForDirection(direction) {
    const local = worldToLocalAngles(frame, direction);
    return relativeDb(local.azimuthRad, local.elevationRad);
  }

  /** Local (azimuth, elevation) angles of a world direction. */
  function localAnglesForDirection(direction) {
    return worldToLocalAngles(frame, direction);
  }

  /** World unit direction for local antenna angles. */
  function directionAt(azimuthRad, elevationRad) {
    return localAnglesToDirection(frame, azimuthRad, elevationRad);
  }

  /**
   * Sample the whole pattern on an azimuth/elevation grid, in the LOCAL frame.
   * Row 0 is el = -90 deg, column 0 is az = -180 deg; both ends are duplicated
   * so a mesh can be stitched without seams.
   * @returns {{rows:number, cols:number, dirs:Float32Array, db:Float32Array, radius:Float32Array}}
   */
  function sampleSphere({ rings = ANTENNA.lobeRings, columns = ANTENNA.lobeColumns, dynamicRangeDb = ANTENNA.lobeDynamicRangeDb } = {}) {
    const rows = Math.max(2, Math.round(rings)) + 1;
    const cols = Math.max(4, Math.round(columns)) + 1;
    const dirs = new Float32Array(rows * cols * 3);
    const db = new Float32Array(rows * cols);
    const radius = new Float32Array(rows * cols);
    let p = 0;
    for (let r = 0; r < rows; r += 1) {
      const el = (-PI / 2) + (PI * r) / (rows - 1);
      const sinEl = Math.sin(el);
      const cosEl = Math.cos(el);
      for (let c = 0; c < cols; c += 1) {
        const az = -PI + (PI * 2 * c) / (cols - 1);
        const value = gainDbiAt(az, el);
        db[p] = value;
        radius[p] = lobeRadius(value, peakGainDbi, dynamicRangeDb);
        dirs[p * 3] = Math.sin(az) * cosEl;
        dirs[p * 3 + 1] = sinEl;
        dirs[p * 3 + 2] = Math.cos(az) * cosEl;
        p += 1;
      }
    }
    return { rows, cols, dirs, db, radius };
  }

  /**
   * Principal-plane cut for plots and tooltips.
   * @param {'azimuth'|'elevation'} plane
   */
  function planeCut(plane = 'azimuth', steps = 181) {
    const n = Math.max(2, Math.round(steps));
    const out = new Array(n);
    for (let i = 0; i < n; i += 1) {
      const deg = plane === 'elevation' ? -90 + (180 * i) / (n - 1) : -180 + (360 * i) / (n - 1);
      const rad = (deg * PI) / 180;
      out[i] = {
        deg,
        dbi: plane === 'elevation' ? gainDbiAt(0, rad) : gainDbiAt(rad, 0),
      };
    }
    return out;
  }

  /** Numbers for the HUD, tooltips and test assertions. */
  function summary() {
    return {
      id: entry.id,
      label: entry.label,
      family: entry.family,
      polarization: entry.polarization,
      aimsInAzimuth: entry.aimsInAzimuth,
      summary: entry.summary,
      typicalUse: entry.typicalUse,
      params: { ...cleanParams },
      paramSpecs: entry.paramSpecs,
      aim: cleanAim,
      aimText: describeAim(cleanAim),
      boresightDeg,
      peakGainDbi,
      hBeamwidthDeg: spec.azimuth.kind === 'omni' ? 360 : beamwidthFromShape(hShape),
      vBeamwidthDeg: beamwidthFromShape(vShape),
      frontToBackDb: spec.azimuth.kind === 'omni' ? 0 : frontToBackFromPattern(hShape),
      sidelobeDb: spec.azimuth.sidelobeDb ?? null,
      floorDb: PATTERN_FLOOR_DB,
      wavelengthM: wavelength,
      elements: geometry.meta.elements,
      boomLengthM: geometry.meta.boomLengthM,
      apertureM: geometry.meta.apertureM,
      conductorLengthM: conductorLengthM(geometry),
      geometryKind: geometry.kind,
    };
  }

  return Object.freeze({
    id: entry.id,
    entry,
    params: cleanParams,
    aim: cleanAim,
    frame,
    geometry,
    wavelength,
    peakGainDbi,
    boresightDeg,
    azimuthSpec: spec.azimuth,
    elevationSpec: spec.elevation,
    relativeDb,
    gainDbiAt,
    gainDbiForDirection,
    relativeDbForDirection,
    localAnglesForDirection,
    directionAt,
    sampleSphere,
    planeCut,
    summary,
  });
}
