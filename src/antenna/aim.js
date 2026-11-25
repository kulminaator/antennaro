/**
 * Antenna aiming: heading, mechanical tilt and electrical beam tilt.
 *
 * Layer: L1 (pure domain). An "aim" is plain data; a "frame" is an orthonormal
 * basis {forward, right, up} expressed in world axes and used to convert world
 * directions into the antenna's local azimuth/elevation angles.
 *
 * Sign conventions:
 *  - aim.azimuthDeg  : compass bearing of the boresight, clockwise from north
 *  - aim.tiltDeg     : mechanical elevation of the boresight, negative = downtilt
 *  - aim.beamTiltDeg : electrical downtilt subtracted from the mechanical tilt
 */

import { clamp, wrapDeg360 } from '../math/scalar.js';
import { AXIS_Y, add, cross, dot, fromCompass, neg, normalize, scale, toCompass } from '../math/vec3.js';

export const DEFAULT_AIM = Object.freeze({ azimuthDeg: 0, tiltDeg: 0, beamTiltDeg: 0 });

const DEGENERATE_DOT = 0.999999;
const COMPASS_POINTS = Object.freeze([
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
]);

/** Sanitise arbitrary input into a usable aim record. */
export function normaliseAim(aim = {}, { tiltMinDeg = -60, tiltMaxDeg = 60 } = {}) {
  const minDeg = tiltMinDeg;
  const maxDeg = tiltMaxDeg;
  return Object.freeze({
    azimuthDeg: wrapDeg360(Number.isFinite(aim.azimuthDeg) ? aim.azimuthDeg : 0),
    tiltDeg: clamp(Number.isFinite(aim.tiltDeg) ? aim.tiltDeg : 0, minDeg, maxDeg),
    beamTiltDeg: clamp(Number.isFinite(aim.beamTiltDeg) ? aim.beamTiltDeg : 0, -20, 45),
  });
}

/** Effective boresight elevation after electrical downtilt. */
export function effectiveTiltDeg(aim) {
  return clamp(aim.tiltDeg - (aim.beamTiltDeg || 0), -89, 89);
}

/** Unit vector pointing along the boresight. */
export function boresightDirection(aim) {
  return fromCompass(aim.azimuthDeg, effectiveTiltDeg(aim));
}

/**
 * Orthonormal local frame of the antenna, expressed in world axes.
 *
 *   forward = boresight
 *   right   = the antenna's right hand side as seen from behind (compass-wise
 *             90 deg clockwise of forward) - kept for HUD text and labels
 *   up      = world-ish up
 *   axisX   = -right, the **local +X** used by pattern maths and by the meshes
 *
 * Why axisX and not right? The world is right-handed, so "right, up, forward"
 * is a LEFT-handed triple: for an antenna pointing north, right x up = south.
 * Sampling the pattern and building the mesh basis from `right` would therefore
 * produce a mirror image (determinant -1) instead of a rotation. Local +X is
 * defined as -right so that (axisX, up, forward) is a proper rotation, and every
 * local-angle conversion below uses axisX consistently. The consequence is only
 * that a positive local azimuth is to the antenna's left - invisible for the
 * azimuth-symmetric catalogue patterns, and exactly right if an asymmetric
 * pattern is ever added.
 */
export function createAimFrame(aim) {
  const forward = boresightDirection(aim);
  // Guard the vertical-boresight singularity with a north-pointing reference.
  const reference = Math.abs(forward.y) > DEGENERATE_DOT ? { x: 0, y: 0, z: -1 } : AXIS_Y;
  const right = normalize(cross(forward, reference));
  const up = normalize(cross(right, forward));
  const axisX = neg(right);
  return Object.freeze({ forward, right, up, axisX });
}

/** World unit direction -> local (azimuth, elevation) angles of the antenna. */
export function worldToLocalAngles(frame, direction) {
  const d = normalize(direction);
  const azimuthRad = Math.atan2(dot(d, frame.axisX), dot(d, frame.forward));
  const upDot = clamp(dot(d, frame.up), -1, 1);
  return { azimuthRad, elevationRad: Math.asin(upDot) };
}

/** Local antenna angles -> world unit direction. */
export function localAnglesToDirection(frame, azimuthRad, elevationRad) {
  const cosEl = Math.cos(elevationRad);
  const sa = Math.sin(azimuthRad) * cosEl;
  const ca = Math.cos(azimuthRad) * cosEl;
  return normalize(add(
    add(scale(frame.forward, ca), scale(frame.axisX, sa)),
    scale(frame.up, Math.sin(elevationRad)),
  ));
}

/** "ENE"-style label for a compass bearing. */
export function compassLabel(azimuthDeg) {
  const idx = Math.round((wrapDeg360(azimuthDeg) % 360) / 22.5) % 16;
  return COMPASS_POINTS[idx];
}

/** Human-readable aim, used by the HUD and the coverage read-out. */
export function describeAim(aim) {
  const eff = effectiveTiltDeg(aim);
  const tiltWord = eff === 0 ? 'level' : eff > 0 ? `${eff.toFixed(0)} deg up` : `${Math.abs(eff).toFixed(0)} deg down`;
  return `${compassLabel(aim.azimuthDeg)} ${wrapDeg360(aim.azimuthDeg).toFixed(0)} deg, ${tiltWord}`;
}

/** Compass bearing of a world position seen from `origin` (2D, ignores height). */
export function bearingTo(origin, target) {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  return wrapDeg360((Math.atan2(dx, -dz) * 180) / Math.PI);
}

/** Elevation angle (deg) of `target` as seen from `origin`, over the slant range. */
export function elevationTo(origin, target) {
  const dy = target.y - origin.y;
  const horizontal = Math.hypot(target.x - origin.x, target.z - origin.z);
  return (Math.atan2(dy, Math.max(1e-6, horizontal)) * 180) / Math.PI;
}

/** Direction (unit) from `origin` to `target`. */
export function directionTo(origin, target) {
  return normalize({ x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z });
}

/** Compass + elevation of a direction, thin re-export so callers need not import vec3. */
export function directionToCompass(direction) {
  return toCompass(direction);
}
