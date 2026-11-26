/**
 * Terrain line-of-sight, single-obstruction diffraction and first-Fresnel-zone
 * clearance.
 *
 * Layer: L1 (pure domain). Given a transmit point in the air and a ground point,
 * work out how much of the ray is buried in the terrain and how much that costs
 * in dB. Model: ray height sampled along the path, over the standard-earth
 * curvature implied by the k-factor, then the diffraction loss of `diffraction.js`
 * (ITU-R P.526-style knife edge, Maqsood/Lee closed form, plus Deygout's superposition
 * for more than one screen). It is intentionally deterministic and cheap: this runs once
 * per terrain cell on every parameter change.
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
import { diffractionLossDb } from './diffraction.js';
import { earthBulgeM, fresnelRadiusM, pathSamples } from './rf.js';

/** The loss model lives in `diffraction.js`; it is re-exported for the callers of `los.js`. */
export { diffractionLossDb };

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
 *   maxExcess:number, worstExcess:number, maxExcessDistance:number,
 *   diffractionExcess:number, diffractionDistance:number, totalDistance:number}}
 */
export function rayProfile(field, from, to, options = {}) {
  const horizontal = Math.hypot(to.x - from.x, to.z - from.z);
  const {
    samples = pathSamples(horizontal, field.cellSize),
    kFactor = RF.kFactor,
    earthRadiusM = RF.earthRadiusM,
    freqHz = null,
    guard = 0,
    diffractionGuard = RF.diffractionEndpointGuard,
    diffractionNearEndM = RF.diffractionNearEndM,
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
  const screen = worstScreen(points, total, diffractionGuard, diffractionNearEndM);
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
    /**
     * The signed excess of the sample that the diffraction loss is charged from, and where
     * it sits. This is the profile's answer to "what is in the way", and it is deliberately
     * not the same sample as `maxExcessDistance`: the closest approach of the ray to the
     * ground is a geometric fact, the screen that costs decibels is a modelling decision
     * taken inside the diffraction window.
     */
    diffractionExcess: screen.excess,
    diffractionDistance: screen.distance,
    diffractionD1: screen.distance,
    diffractionD2: Math.max(0, total - screen.distance),
    totalDistance: total,
    minClearance: Number.isFinite(minClearance) ? minClearance : Infinity,
    minClearanceDistance,
  };
}

/**
 * Which sample along a walked ray is the thing in the way, as `{ excess, distance }`, with
 * `excess: -Infinity` when nothing is.
 *
 * Two candidates qualify, and the reason they do is the whole subtlety of charging a path
 * that ends in the ground:
 *
 * - a **crest**: a sample higher, relative to the ray, than both its neighbours inside the
 *   diffraction window. This is a screen in the knife-edge sense, and taking its *signed*
 *   excess is what makes the shadow begin at 0 dB instead of leaping to the grazing 6 dB
 *   the centimetre the ray is touched.
 * - anything **above the ray** (`excess > 0`) that is not within `nearEndM` of the receiver:
 *   a buried ray has an obstruction by definition, crest or not, so a monotone hillside that
 *   swallows the ray, a wall 50 m in front of the antenna, and the edge of the tableland the
 *   receiver is standing on all still get charged.
 *
 * What is deliberately excluded is the ray's dive into its own receiving point. This app's
 * decibels are for a terminal *on the ground*, so the terrain always meets the ray at the
 * last sample; charging that would blame the receiver's own footing for 6 dB on every path
 * on the map, and would rank it above every real ridge, since `d1 d2 / (d1 + d2)` - and so
 * the zone it is judged against - collapses towards zero at an antenna. Excluding the ends
 * by a fraction of the path is not enough for that: the last guarded sample of a flat world
 * is still where the ray is lowest. Requiring a crest is what says "land got in the way",
 * and `nearEndM` is what stops the ground the receiver stands on from being that land - at
 * the receiving end only, because the ray leaves the mast in the air and ground beside the
 * mast is a real obstacle to everything down the path.
 */
function worstScreen(points, total, guard, nearEndM) {
  const best = { excess: -Infinity, distance: 0 };
  const inWindow = (point) => point.distance > guard * total && point.distance < (1 - guard) * total;
  // Only at the receiving end. The ray leaves the mast in the air, so ground an antenna
  // stands in - the lip of the gully it is in, the wall 16 m away - is a genuine obstacle;
  // the ray's own endpoint is the only point that is not.
  const notFooting = (point) => point.distance < total - nearEndM;
  for (let i = 1; i < points.length - 1; i += 1) {
    const point = points[i];
    if (!notFooting(point)) continue;
    const isCrest = inWindow(points[i - 1]) && inWindow(point) && inWindow(points[i + 1])
      && point.excess >= points[i - 1].excess && point.excess > points[i + 1].excess;
    if (!isCrest && !(point.excess > 0)) continue;
    if (point.excess > best.excess) {
      best.excess = point.excess;
      best.distance = point.distance;
    }
  }
  return best;
}

/**
 * What an already-walked profile costs, in dB.
 *
 * The **signed** worst excess is what gets charged, and that is the whole story of this
 * function: `maxExcess` is floored at 0 so that "where is the worst point" has a single
 * answer, but a path whose ray misses the ground by two zone radii is not the same path as
 * one that grazes it, and flooring at 0 used to make them cost the same 0 dB - and then a
 * ray that touched the ground by one centimetre cost 6 dB in one step. Signed, the loss
 * climbs out of 0 dB at the fit floor, passes the textbook 6 dB at the shadow line, and
 * keeps climbing behind it. The screen charged is `profile.diffractionExcess` at
 * `profile.diffractionDistance` - the worst sample inside the diffraction window, not the
 * ray's closest approach to the ground, which is usually the sample where the ray dives
 * into the receiving antenna. `pathtrace.js` charges from here, so nothing can disagree
 * about which excess was charged and where.
 */
export function profileObstructionDb(profile, freqHz) {
  return diffractionLossDb(
    profile.diffractionExcess, profile.diffractionD1, profile.diffractionD2, freqHz,
  );
}

export function obstructionLossDb(field, from, to, freqHz, options = {}) {
  const { minDistanceM = 1, samples } = options;
  const horizontal = Math.hypot(to.x - from.x, to.z - from.z);
  if (horizontal < minDistanceM) return 0;
  // One sample per terrain cell along the path is enough; more is wasted work.
  const steps = options.samples ?? pathSamples(horizontal, field.cellSize);
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
  const steps = options.samples ?? pathSamples(horizontal, field.cellSize);
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
