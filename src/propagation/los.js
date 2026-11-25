/**
 * Terrain line-of-sight and single-obstruction diffraction.
 *
 * Layer: L1 (pure domain). Given a transmit point in the air and a ground point,
 * work out how much of the ray is buried in the terrain and how much that costs
 * in dB. Model: ray height sampled along the path, standard-earth bulge from the
 * k-factor, then ITU-R P.526-style single knife-edge diffraction (Maqsood/Lee
 * closed form). It is intentionally deterministic and cheap: this runs once per
 * terrain cell on every parameter change.
 */

import { RF } from '../config.js';
import { clamp } from '../math/scalar.js';
import { wavelengthM } from './rf.js';

/**
 * Sample the terrain against the straight ray from `from` (in the air) to `to`.
 * `excess` > 0 means the ground cuts the ray by that many metres.
 * @param {import('../terrain/heightfield.js').HeightField} field
 * @param {{x:number,y:number,z:number}} from
 * @param {{x:number,y:number,z:number}} to
 * @param {{samples?:number, kFactor?:number, earthRadiusM?:number}} [options]
 * @returns {{points:Array<{x:number,z:number,distance:number,terrainY:number,rayY:number,excess:number}>,
 *   maxExcess:number, maxExcessDistance:number, d1:number, d2:number, totalDistance:number}}
 */
export function rayProfile(field, from, to, options = {}) {
  const {
    samples = RF.profileSamples,
    kFactor = RF.kFactor,
    earthRadiusM = RF.earthRadiusM,
  } = options;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const total = Math.hypot(dx, dy, dz);
  const n = Math.max(2, Math.round(samples));
  const points = new Array(n + 1);
  let maxExcess = -Infinity;
  let maxExcessDistance = 0;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const x = from.x + dx * t;
    const z = from.z + dz * t;
    const distance = total * t;
    const d1 = distance;
    const d2 = total - distance;
    const bulge = (kFactor > 0 && total > 0) ? (d1 * d2) / (2 * kFactor * earthRadiusM) : 0;
    const rayY = from.y + dy * t + bulge;
    const terrainY = i === n ? to.y : field.sample(x, z);
    const excess = i === 0 ? -Infinity : terrainY - rayY;
    points[i] = { x, z, distance, terrainY, rayY, excess };
    if (excess > maxExcess) {
      maxExcess = excess;
      maxExcessDistance = distance;
    }
  }
  return {
    points,
    maxExcess: Number.isFinite(maxExcess) ? maxExcess : 0,
    maxExcessDistance,
    d1: maxExcessDistance,
    d2: Math.max(0, total - maxExcessDistance),
    totalDistance: total,
  };
}

/**
 * Diffraction loss (dB, >= 0) for a knife edge of height `excessM` that sits
 * `d1` from the transmitter and `d2` from the receiver.
 * Monotone increasing in `excessM`; 0 dB when the edge is well below the ray.
 */
export function diffractionLossDb(excessM, d1, d2, freqHz) {
  if (excessM === undefined || excessM === null) return 0;
  if (d1 <= 0 || d2 <= 0) return 0;
  const lambda = wavelengthM(freqHz);
  const total = d1 + d2;
  if (!(lambda > 0) || total <= 0) return 0;
  const v = excessM * Math.sqrt(2 / (lambda * (d1 * d2) / total));
  if (v < -0.78) return 0;
  const loss = 6.9 + 20 * Math.log10(Math.sqrt(Math.pow(v - 0.1, 2) + 1) + v - 0.1);
  return Math.max(0, loss);
}

/**
 * Total obstruction loss between an airborne point and a ground point.
 * The most obstructed sample dominates (single-edge approximation).
 * @returns {number} dB of extra loss, 0 when the path is clear
 */
export function obstructionLossDb(field, from, to, freqHz, options = {}) {
  const { minDistanceM = 1, samples } = options;
  const horizontal = Math.hypot(to.x - from.x, to.z - from.z);
  if (horizontal < minDistanceM) return 0;
  // One sample per terrain cell along the path is enough; more is wasted work.
  const steps = options.samples ?? clamp(Math.round(horizontal / field.cellSize) * 2, 12, RF.profileSamples);
  const profile = rayProfile(field, from, to, { ...options, samples: steps });
  return diffractionLossDb(profile.maxExcess, profile.d1, profile.d2, freqHz);
}

/** True when the ray clears the terrain everywhere (no positive excess). */
export function hasLineOfSight(field, from, to, options = {}) {
  const horizontal = Math.hypot(to.x - from.x, to.z - from.z);
  if (horizontal < (options.minDistanceM ?? 1)) return true;
  const profile = rayProfile(field, from, to, options);
  return profile.maxExcess <= 0;
}

/**
 * Minimum antenna height (metres above local ground) that clears the horizon in
 * a given direction. Used by the "what would it take?" read-out.
 * @returns {{clearanceM:number, requiredHeightM:number, blockingDistanceM:number}}
 */
export function requiredHeightForClearance(field, from, to, options = {}) {
  const profile = rayProfile(field, from, to, options);
  const clearance = options.clearanceM ?? 0;
  if (profile.maxExcess <= clearance) {
    return { clearanceM: clearance, requiredHeightM: 0, blockingDistanceM: profile.maxExcessDistance };
  }
  return {
    clearanceM: clearance,
    requiredHeightM: profile.maxExcess - clearance,
    blockingDistanceM: profile.maxExcessDistance,
  };
}
