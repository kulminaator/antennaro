/**
 * The antenna site: where the mast stands and how high the phase centre is.
 *
 * Layer: L1 (pure domain). Kept in one place because the terrain mesh, the
 * coverage grid, the mast drawing and the HUD all need the same numbers.
 *
 * `groundY` is the field's own bilinear sample at the site - the same interpolation
 * the terrain mesh drapes and the coverage grid reads - so the mast foot is exactly
 * the surface you can see: it cannot float above it or sink into it. There is no
 * graded platform under it (see `terrain/generators.js` for why the pad was removed),
 * which means `heightM` is measured from real ground. On a ridge flank that is blunt
 * arithmetic: put a 10 m mast 30 m below a ridge top and the phase centre sits below
 * the ridge, and coverage says so. The map does not move out of the antenna's way.
 */

import { clamp } from '../math/scalar.js';

/**
 * @typedef {{x:number, z:number, groundY:number, heightM:number, y:number}} Site
 */

/**
 * Place the mast foot on the ground at (x, z), clamped to the map, and put the phase
 * centre `heightM` above it.
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
