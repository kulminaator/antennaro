/**
 * Scalar math helpers.
 *
 * Layer: L0 (pure). Deterministic, allocation-free, no globals.
 * Angles: functions suffixed `Rad` take/return radians, `Deg` take/return degrees.
 */

export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const HALF_PI = Math.PI / 2;
export const DEG_PER_RAD = 180 / Math.PI;
export const RAD_PER_DEG = Math.PI / 180;

/** Clamp `v` into [lo, hi]. NaN returns `lo` so bad inputs degrade predictably. */
export function clamp(v, lo, hi) {
  if (!(v >= lo)) return lo;
  if (v > hi) return hi;
  return v;
}

export function clamp01(v) {
  return clamp(v, 0, 1);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function inverseLerp(a, b, v) {
  if (a === b) return 0;
  return (v - a) / (b - a);
}

/** Hermite smoothstep; returns 0 below edge0, 1 above edge1. */
export function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function degToRad(deg) {
  return deg * RAD_PER_DEG;
}

export function radToDeg(rad) {
  return rad * DEG_PER_RAD;
}

/** Wrap an angle into [0, 360). */
export function wrapDeg360(deg) {
  const v = deg % 360;
  return v < 0 ? v + 360 : v;
}

/** Wrap an angle into [-180, 180). */
export function wrapDeg180(deg) {
  return ((wrapDeg360(deg) + 180) % 360) - 180;
}

/** Wrap an angle into [-PI, PI). */
export function wrapRadPI(rad) {
  return wrapDeg180(radToDeg(rad)) * RAD_PER_DEG;
}

/** Power ratio -> decibels. Zero/negative input maps to a very large attenuation. */
export function linToDb(lin) {
  if (!(lin > 0)) return -Infinity;
  return 10 * Math.log10(lin);
}

/** Decibels -> power ratio. -Infinity maps to 0. */
export function dbToLin(db) {
  if (db === -Infinity) return 0;
  return Math.pow(10, db / 10);
}

export function sum(values) {
  let acc = 0;
  for (let i = 0; i < values.length; i += 1) acc += values[i];
  return acc;
}

export function mean(values) {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

export function extremes(values) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
}

/** Linear-interpolated percentile over an unsorted numeric array (does not mutate it). */
export function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const t = clamp01(p) * (sorted.length - 1);
  const lo = Math.floor(t);
  const hi = Math.ceil(t);
  return lo === hi ? sorted[lo] : lerp(sorted[lo], sorted[hi], t - lo);
}

/** Unit-amplitude gaussian bump, used to sculpt terrain features. */
export function bump(x, sigma) {
  if (sigma <= 0) return 0;
  const t = x / sigma;
  return Math.exp(-t * t);
}

export function roundTo(v, digits = 3) {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

export function approxEqual(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Format a decibel value for display; keeps the sign aligned so columns line up. */
export function formatDb(db, digits = 1) {
  if (!Number.isFinite(db)) return '--';
  const s = db.toFixed(digits);
  return db >= 0 ? `+${s}` : s;
}
