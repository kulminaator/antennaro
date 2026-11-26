/**
 * Radiation-pattern primitives.
 *
 * Layer: L1 (pure domain). Angles in radians, levels in dB (relative unless the
 * name says dBi/dBm). Single-purpose, allocation-free, side-effect free so the
 * maths can be property-tested in Node.
 *
 * Model: patterns are separable, i.e.
 *   G(az, el) = Gpeak + H(az) + V(el)      with H <= 0 and V <= 0
 * which is the standard engineering approximation for base-station and ham
 * antennas. `H` is the azimuth (H-)plane, `V` the elevation (E-)plane.
 *
 * Deliberate simplifications (see GUIDELINES.md §14 roadmap):
 *  - no ground-reflection / multipath model,
 *  - no polarisation mismatch,
 *  - pattern is treated as frequency-independent across the tuned band.
 */

import { HALF_PI, TAU, bump, clamp, dbToLin, radToDeg, wrapDeg180 } from '../math/scalar.js';

/** Anything quieter than this is treated as "no radiation" for clipping/drawing. */
export const PATTERN_FLOOR_DB = -40;

/** cos^p main-lobe attenuation (dB, <= 0) with the -3 dB point at bw/2. */
export function mainLobeDb(offsetRad, beamwidthRad) {
  const half = clamp(beamwidthRad, 1e-3, Math.PI - 1e-3) / 2;
  const cosHalf = Math.cos(half);
  if (cosHalf <= 0 || cosHalf >= 1) return PATTERN_FLOOR_DB;
  const p = -3 / (20 * Math.log10(cosHalf)); // solves 20*log10(cos(half)^p) = -3
  const c = Math.cos(clamp(offsetRad, -HALF_PI, HALF_PI));
  if (c <= 0) return PATTERN_FLOOR_DB;
  return clamp(20 * p * Math.log10(c), PATTERN_FLOOR_DB, 0);
}

/**
 * One lumpy sidelobe: peaks near `levelDb` at `centreRad`, decaying over `widthRad`.
 * The `ripple` term keeps the sidelobe train from looking like a single bump.
 */
export function sidelobeDb(offsetRad, { levelDb = -18, centreRad = HALF_PI, widthRad = 0.5, ripple = 0.45 } = {}) {
  const h = Math.abs(offsetRad);
  const wobble = 10 * Math.log10(Math.max(1e-3, 1 - ripple + ripple * Math.cos(h * 7)));
  const shape = 10 * Math.log10(Math.max(1e-9, bump(h - centreRad, widthRad)));
  return levelDb + wobble + shape;
}

/** Broad back lobe; reaches `-backToFrontDb` exactly at 180 deg off boresight. */
export function backLobeDb(offsetRad, { backToFrontDb = 20, widthRad = 0.55 } = {}) {
  const h = Math.abs(offsetRad);
  return PATTERN_FLOOR_DB + (-backToFrontDb - PATTERN_FLOOR_DB) * bump(h - Math.PI, widthRad);
}

/**
 * Azimuth-plane pattern: main lobe, sidelobes around the broadside/beam-axis
 * region and an optional back lobe. Never positive, 0 dB at boresight.
 * @param {number} offsetRad signed angle from boresight
 * @param {{beamwidthDeg:number, backToFrontDb?:number, sidelobeDb?:number, floorDb?:number}} spec
 */
export function azimuthDb(offsetRad, spec) {
  const floorDb = spec.floorDb ?? PATTERN_FLOOR_DB;
  const beamwidthDeg = spec.beamwidthDeg ?? 360;
  if (beamwidthDeg >= 359.999) return 0; // 'no shape in this plane' is exactly flat
  const levels = [mainLobeDb(offsetRad, (beamwidthDeg * Math.PI) / 180)];
  if (beamwidthDeg < 170) {
    if (spec.sidelobeDb !== undefined) {
      levels.push(sidelobeDb(offsetRad, { levelDb: spec.sidelobeDb, centreRad: HALF_PI * 0.95 }));
      levels.push(sidelobeDb(offsetRad, { levelDb: spec.sidelobeDb, centreRad: HALF_PI * 1.55 }));
    }
    if (spec.backToFrontDb !== undefined) {
      levels.push(backLobeDb(offsetRad, { backToFrontDb: spec.backToFrontDb }));
    }
  }
  return clamp(Math.max(...levels), floorDb, 0);
}

/**
 * Elevation-plane pattern. `elevationRad` is signed, 0 = horizon, + = up.
 * `shapeFn` (optional) overrides the generic lobe, e.g. dipole or collinear.
 */
export function elevationDb(elevationRad, spec, shapeFn) {
  const floorDb = spec.floorDb ?? PATTERN_FLOOR_DB;
  if (!shapeFn && (spec.beamwidthDeg ?? 360) >= 359.999) return 0;
  const shape = shapeFn
    ? shapeFn(elevationRad)
    : mainLobeDb(elevationRad, ((spec.beamwidthDeg ?? 360) * Math.PI) / 180);
  return clamp(shape, floorDb, 0);
}

/**
 * Free-space half-wave dipole shape. `elevationRad` measured from the horizon
 * plane (+90 deg = along the element axis). 0 dB at the horizon, null on axis.
 */
export function dipoleDb(elevationRad) {
  const theta = HALF_PI - clamp(elevationRad, -HALF_PI, HALF_PI); // angle from element axis
  const sinTheta = Math.max(1e-6, Math.sin(theta));
  const e = Math.cos((Math.PI / 2) * Math.cos(theta)) / sinTheta;
  return clamp(20 * Math.log10(Math.max(1e-6, Math.min(1, e))), PATTERN_FLOOR_DB, 0);
}

/**
 * Sum of point sources with complex currents: AF(mu) = sum(I_n * e^(j*mu*pos_n)).
 * @param {number} mu phase progression, radians per unit element position
 * @param {Array<{position:number, re:number, im:number}>} currents
 */
export function arrayFactorDb(mu, currents) {
  let re = 0;
  let im = 0;
  for (let i = 0; i < currents.length; i += 1) {
    const c = currents[i];
    const cos = Math.cos(mu * c.position);
    const sin = Math.sin(mu * c.position);
    re += c.re * cos - c.im * sin;
    im += c.re * sin + c.im * cos;
  }
  return 20 * Math.log10(Math.max(1e-9, Math.hypot(re, im)));
}

/**
 * Build the current distribution of an N-element in-phase collinear array.
 * Positions are in wavelengths, centred on the array midpoint.
 * @returns {{currents:Array<{position:number,re:number,im:number}>, peakDb:number, elements:number, spacingLambda:number}}
 */
export function createCollinearArray(elements, spacingLambda = 0.5) {
  const n = Math.max(1, Math.round(elements));
  const spacing = clamp(spacingLambda, 0.1, 1.5);
  const currents = [];
  for (let i = 0; i < n; i += 1) {
    currents.push({ position: (i - (n - 1) / 2) * spacing, re: 1, im: 0 });
  }
  return { currents, peakDb: arrayFactorDb(0, currents), elements: n, spacingLambda: spacing };
}

/**
 * Vertical collinear array shape: element pattern times array factor,
 * normalised to 0 dB peak and symmetric above/below the horizon.
 * @param {number} elevationRad
 * @param {ReturnType<typeof createCollinearArray>} array
 */
export function collinearDb(elevationRad, array) {
  const theta = HALF_PI - clamp(elevationRad, -HALF_PI, HALF_PI);
  const mu = TAU * array.spacingLambda * Math.cos(theta);
  const af = clamp(arrayFactorDb(mu, array.currents) - array.peakDb, PATTERN_FLOOR_DB, 0);
  return clamp(af + dipoleDb(elevationRad), PATTERN_FLOOR_DB, 0);
}

/**
 * Full width at -3 dB (deg) of a shape function that is symmetric about 0,
 * found by scanning outwards from boresight. Returns 360 for a truly
 * omnidirectional shape (never crosses -3 dB within +-179 deg).
 */
export function beamwidthFromShape(shapeFn, { maxDeg = 179, steps = 1790 } = {}) {
  for (let i = 1; i <= steps; i += 1) {
    const deg = (maxDeg * i) / steps;
    if (shapeFn((deg * Math.PI) / 180) <= -3) return 2 * deg;
  }
  return 360;
}

/**
 * Kraus's approximation constant, in square degrees: a beam of -3 dB widths
 * `H` and `V` degrees has a directivity of about `41253 / (H * V)`.
 *
 * Named here rather than in `config.js` for the same reason as `PATTERN_FLOOR_DB`:
 * it is the definition of the formula, not a knob. Tuning it would not make a
 * weak antenna stronger, it would make the model lie.
 */
export const KRAUS_CONSTANT_DEG2 = 41253;

/**
 * Directivity (dBi) implied by a pair of -3 dB beamwidths, in degrees.
 *
 * This is what the catalogue turns a drawn beam into a claimed gain with:
 * `gain = krausDirectivityDbi(H, V) + 10*log10(apertureEfficiency)`. Deriving gain
 * from the beam - instead of typing a gain that happens to look good next to it - is
 * the only reason a wide antenna can no longer claim a long reach: 69 x 69 degrees
 * holds 9.4 dBi, and no arithmetic gets to say 12.4.
 *
 * Kraus is an **upper** bound for a main-lobe-dominated pattern (a real build sits
 * under it: taper, feed loss, mismatch), and it is *not valid for an omnidirectional
 * plane* - a 360 degree azimuth cut is not a main lobe, so omni designs take their
 * gain from the array factor instead. See GUIDELINES.md §7 "Antenna pattern".
 */
export function krausDirectivityDbi(hBeamwidthDeg, vBeamwidthDeg) {
  const h = Math.max(0.5, hBeamwidthDeg);
  const v = Math.max(0.5, vBeamwidthDeg);
  return 10 * Math.log10(KRAUS_CONSTANT_DEG2 / (h * v));
}

/**
 * Map a pattern level to a 0..1 radius for drawing the 3D lobe.
 * Monotone in `db`: 1 at the peak gain, 0 at or below the clip level.
 */
export function lobeRadius(db, peakDb, dynamicRangeDb = 30) {
  const floor = peakDb - Math.abs(dynamicRangeDb);
  const t = clamp((db - floor) / Math.max(1e-6, peakDb - floor), 0, 1);
  return Math.pow(t, 0.65);
}

/** Front-to-back ratio (dB) measured from a sampled azimuth pattern. */
export function frontToBackFromPattern(azimuthFn) {
  return azimuthFn(0) - azimuthFn(Math.PI);
}

/** Signed smallest angle (rad) between two azimuth angles. */
export function azimuthOffsetRad(azimuthRad, boresightRad) {
  return (wrapDeg180(radToDeg(azimuthRad) - radToDeg(boresightRad)) * Math.PI) / 180;
}

/** Relative dB plus peak gain -> absolute dBi. */
export function toDbi(relativeDb, peakDbi) {
  return peakDbi + relativeDb;
}

/** Relative dB -> linear power factor (0..1). */
export function relativeFactor(relativeDb) {
  return dbToLin(relativeDb);
}
