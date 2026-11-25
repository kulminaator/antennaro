/**
 * One path, two questions: what does the ground cost, and how much first Fresnel
 * zone is left?
 *
 * Layer: L1 (pure domain). Extracted from `coverage.js` because the coverage loop
 * asks this of tens of thousands of points and the answer has one subtlety worth
 * stating in one place: the **loss** is charged against the ray that ends on the
 * cell's own ground, while the **zone** is judged against a receiver standing a few
 * metres above it (`RF.fresnelRxHeightM`). Those are two different rays on purpose -
 * moving the receiver-height assumption must change the reliability verdict and never
 * the decibels.
 */

import { RF } from '../config.js';
import { diffractionLossDb, rayProfile } from './los.js';

/**
 * @param {import('../terrain/heightfield.js').HeightField} field
 * @param {{x:number, y:number, z:number}} from the transmitting phase centre
 * @param {{x:number, y:number, z:number}} to the receiving point, ground level
 * @param {{freqHz:number, samples:number, rxHeightM?:number, guard?:number}} options
 * @returns {{obstructionDb:number, clearanceRatio:number}} the diffraction loss the
 *   terrain costs this path, and the worst first-zone clearance found along it, in
 *   units of the first-zone radius (capped by the caller, `Infinity` when nothing
 *   could be judged).
 */
export function tracePath(field, from, to, options) {
  const { freqHz, samples, rxHeightM = RF.fresnelRxHeightM, guard = RF.fresnelEndpointGuard } = options;
  const zone = rxHeightM === 0 ? to : { x: to.x, y: to.y + rxHeightM, z: to.z };
  const zoneProfile = rayProfile(field, from, zone, { samples, freqHz, guard });
  // The loss ray keeps the default (unguarded) profile: the endpoint guard is a device
  // for *judging* a zone near an antenna, and silently applying it here would move the
  // decibels whenever the criterion's tuning changes.
  const groundProfile = rxHeightM === 0
    ? zoneProfile
    : rayProfile(field, from, to, { samples, freqHz });
  return {
    obstructionDb: diffractionLossDb(groundProfile.maxExcess, groundProfile.d1, groundProfile.d2, freqHz),
    clearanceRatio: zoneProfile.minClearance,
  };
}
