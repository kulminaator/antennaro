/**
 * Plain-object 3D vectors.
 *
 * Layer: L0 (pure). The domain deliberately uses `{x, y, z}` records instead of
 * three.js `Vector3` so that every physics module can run in Node without a
 * renderer present. Adapters convert at the boundary (GUIDELINES.md §4).
 *
 * Convention: +X east, +Y up, -Z north. Right-handed.
 */

import { HALF_PI, clamp, wrapDeg360, radToDeg, degToRad } from './scalar.js';

export function v3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function isVec3(v) {
  return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function neg(a) {
  return { x: -a.x, y: -a.y, z: -a.z };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function lengthSq(a) {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function length(a) {
  return Math.sqrt(lengthSq(a));
}

export function distance(a, b) {
  return length(sub(a, b));
}

export function horizontalLength(a) {
  return Math.hypot(a.x, a.z);
}

export function normalize(a) {
  const len = length(a);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

export function lerpVec(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

export function cloneVec(a) {
  return { x: a.x, y: a.y, z: a.z };
}

/**
 * Compass bearing to unit vector.
 * `azimuthDeg` is clockwise from north, `elevationDeg` above the horizon.
 * north (0 deg) -> (0,0,-1), east (90 deg) -> (1,0,0), up (90 deg elev) -> (0,1,0).
 */
export function fromCompass(azimuthDeg, elevationDeg = 0, len = 1) {
  const az = degToRad(azimuthDeg);
  const el = degToRad(elevationDeg);
  const cosEl = Math.cos(el) * len;
  return { x: Math.sin(az) * cosEl, y: Math.sin(el) * len, z: -Math.cos(az) * cosEl };
}

/** Unit vector to compass bearing. Returns azimuth in [0,360) and elevation in [-90,90]. */
export function toCompass(v) {
  const len = length(v);
  if (len === 0) return { azimuthDeg: 0, elevationDeg: 0 };
  return {
    azimuthDeg: wrapDeg360(radToDeg(Math.atan2(v.x, -v.z))),
    elevationDeg: radToDeg(Math.asin(clamp(v.y / len, -1, 1))),
  };
}

/** Angle (radians) between two directions; 0 for identical, PI for opposite. */
export function angularDistance(a, b) {
  const la = length(a);
  const lb = length(b);
  if (la === 0 || lb === 0) return HALF_PI;
  return Math.acos(clamp(dot(a, b) / (la * lb), -1, 1));
}

/**
 * How far a horizontal ray travels before it leaves the square map.
 *
 * The map is `[-half, half]` in both axes; the point is where the ray starts. Answer
 * is metres, and `Infinity` for a degenerate direction. Used to tell "the link ended"
 * from "the world ended": a range measured to this distance is a border of the picture,
 * not a property of the antenna.
 *
 * @param {{x:number, z:number}} origin @param {{x:number, z:number}} direction
 * @param {number} half half the map width, metres
 */
export function rayBoxExitDistance(origin, direction, half) {
  let best = Infinity;
  for (const axis of ['x', 'z']) {
    const d = direction[axis];
    if (Math.abs(d) < 1e-12) continue;
    const wall = d > 0 ? half : -half;
    const t = (wall - origin[axis]) / d;
    if (t >= 0 && t < best) best = t;
  }
  return best;
}

export const AXIS_X = Object.freeze({ x: 1, y: 0, z: 0 });
export const AXIS_Y = Object.freeze({ x: 0, y: 1, z: 0 });
export const AXIS_Z = Object.freeze({ x: 0, y: 0, z: 1 });
