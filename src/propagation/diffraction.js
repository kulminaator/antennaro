/**
 * Knife-edge diffraction: the loss for one screen, and Deygout's superposition for several.
 *
 * Layer: L1 (pure domain). Split out of `los.js` because the ray walk and the loss model are
 * two pieces of maths with different lives - `los.js` is at its line budget, and this file is
 * the one a reader of "what does the shadow behind a ridge cost" is looking for.
 *
 * One screen (ITU-R P.526-style, Lee/Maqsood closed form of the Fresnel integral) is a
 * function of one signed number: how far the edge stands above the ray. Several screens do
 * not simply add - that would charge a second ridge standing in the shadow of the first
 * again - so each edge is charged against a line drawn from the transmitter over the
 * highest preceding one, which is Deygout's construction: the first edge sees the true
 * transmitter-to-receiver line, the second sees the line grazed over the first, and an edge
 * that ends up below that line contributes about nothing, because it really is in the
 * shadow. Summing per-edge losses over-estimates slightly against rigorous multiple-edge
 * integrations; it is the standard cheap compromise and it is monotone, which is what a
 * coverage picture needs.
 */

import { RF } from '../config.js';
import { wavelengthM } from './rf.js';

/**
 * Where the Lee/Maqsood fit of the Fresnel integral stops being a fit: v ~ -0.78, about
 * 0.78 first-zone radii clear of the edge. Above it the closed form tracks the integral;
 * below it the true loss has died away into a fraction of a dB and the polynomial runs off
 * into nonsense, so the answer is nothing. Declared next to the maths it bounds - like
 * `PATTERN_FLOOR_DB` in `antenna/pattern.js` - because moving it to config would separate a
 * model from the number that says where it stops being meaningful.
 */
const KIRCHHOFF_FIT_FLOOR_V = -0.78;

/**
 * Diffraction loss (dB, >= 0) for a knife edge `excessM` above the ray, sitting `d1` from
 * the transmitter and `d2` from the receiver.
 *
 * `excessM` is **signed**: positive means the edge stands above the ray (the geometric
 * shadow), negative means the ray clears it by that much. Passing the sign is what makes the
 * shadow start where the physics says it does - a continuous climb from 0 dB at the fit
 * floor, through the textbook 6 dB as the ray grazes the edge, and on into the deep shadow -
 * instead of a step from "no obstruction" to "grazing" the centimetre the ray touches.
 * Monotone increasing in `excessM`, and 0 dB once the edge is far enough below the ray.
 */
export function diffractionLossDb(excessM, d1, d2, freqHz) {
  if (!Number.isFinite(excessM)) return 0;
  if (d1 <= 0 || d2 <= 0) return 0;
  const lambda = wavelengthM(freqHz);
  const total = d1 + d2;
  if (!(lambda > 0) || total <= 0) return 0;
  const v = excessM * Math.sqrt(2 / (lambda * (d1 * d2) / total));
  if (v < KIRCHHOFF_FIT_FLOOR_V) return 0;
  const loss = 6.9 + 20 * Math.log10(Math.sqrt(Math.pow(v - 0.1, 2) + 1) + v - 0.1);
  return Math.max(0, loss);
}

/**
 * The screens a walked profile actually contains, one per contiguous run of obstructing
 * samples, at that run's highest point.
 *
 * The qualification test is the one `worstScreen` in `los.js` uses - a crest inside the
 * diffraction window, or anything above the ray that is not the receiver's own footing - and
 * runs are then collapsed to their top, because a ridge sampled twenty times is one ridge.
 * Without that collapse a long hillside would contribute one edge per sample and the
 * superposition below would charge the same slope twenty times over.
 */
function screenEdges(points, total, guard, nearEndM) {
  const inWindow = (point) => point.distance > guard * total && point.distance < (1 - guard) * total;
  const obstructs = (point, i) => {
    if (!(point.distance < total - nearEndM)) return false;
    if (point.excess > 0) return true;
    const prev = points[i - 1];
    const next = points[i + 1];
    return inWindow(prev) && inWindow(point) && inWindow(next)
      && point.excess >= prev.excess && point.excess > next.excess;
  };
  const edges = [];
  let run = null;
  for (let i = 1; i < points.length - 1; i += 1) {
    const point = points[i];
    if (!obstructs(point, i)) {
      if (run) edges.push(run);
      run = null;
      continue;
    }
    if (!run || point.excess > run.excess) {
      run = { excess: point.excess, distance: point.distance };
    }
  }
  if (run) edges.push(run);
  return edges;
}

/**
 * Deygout multi-edge diffraction loss for an already-walked profile, in dB.
 *
 * `points` is the array `rayProfile` returns, so the edges come from the same samples the
 * picture is painted from: contiguous obstructing samples are one edge at their top, then
 * each edge is charged against the line from the transmitter over the steepest edge before
 * it. Two things fall out of that construction and both are the point of it: an edge behind
 * a taller one contributes almost nothing, and two well-separated ridges cost more than one
 * without costing twice as much.
 *
 * With one edge this is exactly `diffractionLossDb` for that edge - `profileObstructionDb`
 * and this function cannot disagree on a single-obstruction path. `RF.diffractionEdgeLimit`
 * caps how many edges are charged, keeping the tallest, because a profile over broken ground
 * can present dozens and the sum is dominated by the first few anyway.
 *
 * Two things about this recipe are worth knowing before using it, and both are measured in
 * `tests/unit/multiedge.test.js`. It is floored at what the most significant screen costs on
 * its own, because the raw sum can fall below a screen that is plainly there - a true lower
 * bound, that screen really is in the way. And it is **not monotone in a preceding screen**:
 * raising the near ridge tilts the line it casts over everything behind it, so measured here
 * 8 m of near ridge costs 13.32 dB and 12 m of the same ridge costs 9.99 dB. Measured against
 * the direct ray line every screen height falls as the mast rises, so the wrinkle is the
 * construction's, not the physics's; anything that charges this on a map has to know how often
 * real ground presents two screens before it trusts the sum.
 *
 * @param {Array<{distance:number, excess:number}>} points from `rayProfile`
 * @param {number} totalDistance path length in metres
 * @param {number} freqHz
 * @param {{edgeLimit?:number, guard?:number, nearEndM?:number}} [options]
 * @returns {number} dB of extra loss, 0 when nothing obstructs
 */
export function multiEdgeDiffractionDb(points, totalDistance, freqHz, options = {}) {
  const edgeLimit = Number.isFinite(options.edgeLimit) ? options.edgeLimit : RF.diffractionEdgeLimit;
  const guard = Number.isFinite(options.guard) ? options.guard : RF.diffractionEndpointGuard;
  const nearEndM = Number.isFinite(options.nearEndM) ? options.nearEndM : RF.diffractionNearEndM;
  if (!Array.isArray(points) || points.length < 3 || !(totalDistance > 0)) return 0;
  let edges = screenEdges(points, totalDistance, guard, nearEndM);
  if (edges.length === 0) return 0;
  if (edges.length > edgeLimit) {
    edges = edges.slice().sort((a, b) => b.excess - a.excess).slice(0, edgeLimit)
      .sort((a, b) => a.distance - b.distance);
  }
  let loss = 0;
  let floor = 0;
  let bearing = 0;
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    const d2 = totalDistance - edge.distance;
    // What this screen would cost if it were the only one: a lower bound on the whole path.
    floor = Math.max(floor, diffractionLossDb(edge.excess, edge.distance, d2, freqHz));
    // The first edge sees the true ray line; later ones the line from the transmitter over
    // the steepest edge so far, which at this distance stands bearing * distance above it.
    const screen = i === 0 ? edge.excess : edge.excess - bearing * edge.distance;
    loss += diffractionLossDb(screen, edge.distance, d2, freqHz);
    const edgeBearing = edge.excess / edge.distance;
    if (edgeBearing > bearing) bearing = edgeBearing;
  }
  return Math.max(loss, floor);
}
