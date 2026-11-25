/**
 * The antenna site: where the mast stands and how high the phase centre is.
 *
 * Layer: L1 (pure domain). Kept in one place because the terrain mesh, the
 * coverage grid, the mast drawing and the HUD all need the same numbers.
 */

import { clamp } from '../math/scalar.js';

/**
 * @typedef {{x:number, z:number, groundY:number, heightM:number, y:number}} Site
 */

/**
 * @param {import('./heightfield.js').HeightField} field
 * @param {{x?:number, z?:number, heightM?:number}} [options]
 * @returns {Site}
 */
export function resolveSite(field, options = {}) {
  const x = Number.isFinite(options.x) ? clamp(options.x, -field.half, field.half) : 0;
  const z = Number.isFinite(options.z) ? clamp(options.z, -field.half, field.half) : 0;
  const heightM = Math.max(0, Number.isFinite(options.heightM) ? options.heightM : 0);
  const groundY = field.sample(x, z);
  return Object.freeze({ x, z, groundY, heightM, y: groundY + heightM });
}

/** Distance and bearing from the site to a world position. */
export function rangeFromSite(site, x, z) {
  const dx = x - site.x;
  const dz = z - site.z;
  return {
    horizontalM: Math.hypot(dx, dz),
    azimuthDeg: (Math.atan2(dx, -dz) * 180) / Math.PI,
  };
}
