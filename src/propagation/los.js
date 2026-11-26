/**
 * Terrain line-of-sight, single-obstruction diffraction and first-Fresnel-zone
 * clearance.
 *
 * Layer: L1 (pure domain). Given a transmit point in the air and a ground point,
 * work out how much of the ray is buried in the terrain and how much that costs
 * in dB. Model: ray height sampled along the path, over the standard-earth
 * curvature implied by the k-factor, then ITU-R P.526-style single knife-edge
 * diffraction (Maqsood/Lee closed form). It is intentionally deterministic and cheap:
 * this runs once per terrain cell on every parameter change.
 *
 * Which way the curvature goes, because it is the kind of sign that survives for months
 * if nothing asks: a height field is a **planar** datum, so the equivalent-round-earth
 * transform leaves the terrain exactly where it is and bends the **ray** down toward it
 * (`rayProfile` subtracts `earthBulgeM`). Adding the bulge instead lifts the ray over
 * every obstacle and turns the earth into something that helps the link, which is how a
 * 30 km path with a 13 km horizon used to be reported as clear. Both ends stay anchored,
 * because the bulge is 0 when either leg of the path is: the antennas never move.
 *
 * The same walk also reports how much of the **first Fresnel zone** the ground
 * intrudes into, because dB and zone occupancy are one physics seen two ways. With
 * h the height of the ray above the ground at a point that splits the path into
 * d1 + d2, and r1 = sqrt(lambda * d1 * d2 / (d1 + d2)) the first-zone radius there,
 * the Kirchhoff parameter used below is exactly `v = sqrt(2) * h / r1`. So a path
 * can clear the ray (h > 0, small loss) and still have its zone cut (h < 0.6 * r1),
 * which is a link that works on paper and misbehaves in the field. `clearance`
 * below is h / r1, in zone radii.
 */

import { RF } from '../config.js';
import { clamp } from '../math/scalar.js';
import { earthBulgeM, fresnelRadiusM, wavelengthM } from './rf.js';

/**
 * Sample the terrain against the straight ray from `from` (in the air) to `to`.
 * `excess` > 0 means the ground cuts the ray by that many metres. Both ends are excluded
 * from the obstruction search: `maxExcess` is the worst of the samples in between, floored
 * at 0, so a clear path reports 0 and a blocking point somewhere inside the path rather
 * than at the receiver.
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
    freqHz = null,
    guard = 0,
  } = options;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const total = Math.hypot(dx, dy, dz);
  const n = Math.max(2, Math.round(samples));
  const points = new Array(n + 1);
  let maxExcess = -Infinity;
  let maxExcessDistance = 0;
  let minClearance = Infinity;
  let minClearanceDistance = 0;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const x = from.x + dx * t;
    const z = from.z + dz * t;
    const distance = total * t;
    const d1 = distance;
    const d2 = total - distance;
    // The obstacle gains what the ray loses: same transform, one of the two moves.
    const bulge = earthBulgeM(d1, d2, kFactor, earthRadiusM);
    const rayY = from.y + dy * t - bulge;
    const terrainY = i === n ? to.y : field.sample(x, z);
    const excess = i === 0 ? -Infinity : terrainY - rayY;
    // Neither end is an obstacle, and neither end competes for the title. The
    // transmitter is in the air; the ground at the receiver *is* the ray's endpoint, so
    // judging it would make a flat, empty world report its worst obstruction at the
    // receiver - 0 m deep - and hand every clear path a "blocking point" at its own far
    // end. Only the samples in between can cut a ray or a zone.
    const isEnd = i === 0 || i === n;
    const judged = !isEnd && distance > guard * total && distance < (1 - guard) * total;
    const radiusM = freqHz && !isEnd ? fresnelRadiusM(d1, d2, freqHz) : 0;
    const clearance = isEnd || !(radiusM > 0) ? Infinity : (rayY - terrainY) / radiusM;
    points[i] = { x, z, distance, terrainY, rayY, excess, fresnelRadiusM: radiusM, clearance };
    const worst = isEnd ? -Infinity : excess;
    if (worst > maxExcess) {
      maxExcess = worst;
      maxExcessDistance = distance;
    }
    if (judged && clearance < minClearance) {
      minClearance = clearance;
      minClearanceDistance = distance;
    }
  }
  return {
    points,
    maxExcess: Number.isFinite(maxExcess) ? Math.max(0, maxExcess) : 0,
    /**
     * The same worst sample before it was floored, so a caller can tell "clear" from
     * "grazing": a ray that misses the ground everywhere has a negative worst excess,
     * one that touches it exactly has 0, and only then does knife-edge loss begin.
     */
    worstExcess: Number.isFinite(maxExcess) ? maxExcess : -Infinity,
    maxExcessDistance,
    d1: maxExcessDistance,
    d2: Math.max(0, total - maxExcessDistance),
    totalDistance: total,
    minClearance: Number.isFinite(minClearance) ? minClearance : Infinity,
    minClearanceDistance,
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
 *
 * Deliberately does not ask for the Fresnel radius: the loss only needs the worst
 * excess, and this is the hottest function in the app. Call `rayProfile` with a
 * `freqHz` (or `fresnelStatus`) when the zone occupancy is wanted as well.
 * @returns {number} dB of extra loss, 0 when the path is clear
 */
/**
 * What an already-walked profile costs, in dB.
 *
 * A path whose ray misses the ground everywhere costs nothing, and that is decided here
 * rather than by handing `diffractionLossDb` a worst excess of 0: the knife-edge formula
 * returns about 6 dB at exactly 0, which is correct for a ray grazing a summit and wrong
 * for a ray that never came near the ground. Keeping the decision in one function means
 * `obstructionLossDb` and `pathtrace.js` cannot disagree about it.
 */
export function profileObstructionDb(profile, freqHz) {
  if (!(profile.worstExcess >= 0)) return 0;
  return diffractionLossDb(profile.maxExcess, profile.d1, profile.d2, freqHz);
}

export function obstructionLossDb(field, from, to, freqHz, options = {}) {
  const { minDistanceM = 1, samples } = options;
  const horizontal = Math.hypot(to.x - from.x, to.z - from.z);
  if (horizontal < minDistanceM) return 0;
  // One sample per terrain cell along the path is enough; more is wasted work.
  const steps = options.samples ?? clamp(Math.round(horizontal / field.cellSize) * 2, 12, RF.profileSamples);
  return profileObstructionDb(rayProfile(field, from, to, { ...options, samples: steps }), freqHz);
}

/** True when the ray clears the terrain everywhere (no positive excess). */
export function hasLineOfSight(field, from, to, options = {}) {
  const horizontal = Math.hypot(to.x - from.x, to.z - from.z);
  if (horizontal < (options.minDistanceM ?? 1)) return true;
  const profile = rayProfile(field, from, to, options);
  return profile.maxExcess <= 0;
}

/**
 * How much of the first Fresnel zone the terrain leaves clear along a path.
 *
 * This is a *reliability* measure, not a second loss term: the dB a path pays are
 * already the Kirchhoff/Lee diffraction loss, which is a function of the same
 * h / r1 ratio. Reporting both is the point - a path can pay 1 dB and still have
 * most of its zone in the ground. Because the zone narrows to nothing at either
 * antenna, the answer is stated for a receiver at `RF.fresnelRxHeightM` and measured
 * outside `RF.fresnelEndpointGuard` of each end: judged against a terminal lying on
 * the ground the criterion always fails and says nothing (see the horizon maths in
 * `src/config.js`).
 *
 * @param {import('../terrain/heightfield.js').HeightField} field
 * @param {{x:number,y:number,z:number}} from airborne end (the antenna)
 * @param {{x:number,y:number,z:number}} to ground end (the cell)
 * @param {number} freqHz
 * @param {{clearFraction?:number, rxHeightM?:number, guard?:number, samples?:number,
 *   minDistanceM?:number}} [options]
 * @returns {{clearanceRatio:number, distanceM:number, radiusM:number, rxHeightM:number,
 *   clearFraction:number, clear:boolean}} `clearanceRatio` is the worst height of
 *   the ray above the ground along the path, in first-zone radii (negative = the
 *   ground rises above the ray). Judged for a receiver at `rxHeightM` above the
 *   ground end.
 */
export function fresnelStatus(field, from, to, freqHz, options = {}) {
  const clearFraction = Number.isFinite(options.clearFraction) ? options.clearFraction : RF.fresnelClearFraction;
  const rxHeightM = Number.isFinite(options.rxHeightM) ? options.rxHeightM : RF.fresnelRxHeightM;
  const guard = Number.isFinite(options.guard) ? options.guard : RF.fresnelEndpointGuard;
  const horizontal = Math.hypot(to.x - from.x, to.z - from.z);
  if (horizontal < (options.minDistanceM ?? 1)) {
    return { clearanceRatio: Infinity, distanceM: 0, radiusM: 0, rxHeightM, clearFraction, clear: true };
  }
  const terminal = { x: to.x, y: to.y + rxHeightM, z: to.z };
  const steps = options.samples ?? clamp(Math.round(horizontal / field.cellSize) * 2, 12, RF.profileSamples);
  const profile = rayProfile(field, from, terminal, { ...options, samples: steps, freqHz, guard });
  const ratio = profile.minClearance;
  return {
    clearanceRatio: ratio,
    distanceM: profile.minClearanceDistance,
    radiusM: fresnelRadiusM(profile.minClearanceDistance, Math.max(0, profile.totalDistance - profile.minClearanceDistance), freqHz),
    rxHeightM,
    clearFraction,
    clear: ratio >= clearFraction,
  };
}

/**
 * Radius of the first Fresnel zone sampled along a straight link of `distanceM`,
 * for drawing the zone as a volume. Zero at both ends (the antennas themselves) and
 * largest at the middle, where `radius` equals `fresnelRadiusM(D/2, D/2, freqHz)`.
 *
 * @param {number} distanceM length of the link
 * @param {number} freqHz
 * @param {number} steps number of samples, ends included
 * @returns {Array<{distance:number, radius:number}>}
 */
export function firstFresnelEnvelope(distanceM, freqHz, steps) {
  const n = Math.max(2, Math.round(steps));
  const out = new Array(n + 1);
  for (let i = 0; i <= n; i += 1) {
    const distance = (distanceM * i) / n;
    out[i] = { distance, radius: fresnelRadiusM(distance, distanceM - distance, freqHz) };
  }
  return out;
}

/**
 * Minimum antenna height (metres above local ground) that clears the horizon in
 * a given direction. Used by the "what would it take?" read-out.
 * @returns {{clearanceM:number, requiredHeightM:number, blockingDistanceM:number}}
 */
export function requiredHeightForClearance(field, from, to, options = {}) {
  const profile = rayProfile(field, from, to, options);
  const clearance = options.clearanceM ?? 0;
  if (profile.worstExcess <= clearance) {
    // Nothing blocks this path, so it has no blocking point to report. Reporting the
    // shallowest interior sample instead would read as "the obstacle is 2 km away"
    // about a path that is clear all the way.
    return { clearanceM: clearance, requiredHeightM: 0, blockingDistanceM: 0 };
  }
  return {
    clearanceM: clearance,
    requiredHeightM: profile.maxExcess - clearance,
    blockingDistanceM: profile.maxExcessDistance,
  };
}
