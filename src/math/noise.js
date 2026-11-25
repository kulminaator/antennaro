/**
 * Deterministic pseudo-random helpers.
 *
 * Layer: L1 (pure). Every stochastic feature in the app routes through here so a
 * given integer seed always reproduces the same ground. Domain code must never
 * reach for the unseeded generator - see GUIDELINES.md §6.4 (determinism).
 */

import { clamp01 } from './scalar.js';

/** Mix a 32-bit integer to a well-distributed 32-bit integer. */
function mix32(n) {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Hash two integers plus a seed to the half-open interval [0, 1). */
export function hash2i(ix, iz, seed = 0) {
  const h = mix32(Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ mix32(seed | 0));
  return h / 0x100000000;
}

/** mulberry32: small, fast, seedable generator. Returns a function -> [0, 1). */
export function createRandom(seed = 1) {
  let a = (seed | 0) || 1;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Uniform float in [min, max). */
export function randomInRange(rand, min, max) {
  return min + rand() * (max - min);
}

/** Pick one entry of a non-empty array. */
export function pick(rand, items) {
  if (!items || items.length === 0) return undefined;
  return items[Math.floor(rand() * items.length) % items.length];
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

/** Value noise on a unit lattice, C1 continuous, range [0, 1]. */
export function valueNoise2(x, z, seed = 0) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const tz = fade(z - z0);
  const n00 = hash2i(x0, z0, seed);
  const n10 = hash2i(x0 + 1, z0, seed);
  const n01 = hash2i(x0, z0 + 1, seed);
  const n11 = hash2i(x0 + 1, z0 + 1, seed);
  const top = n00 + (n10 - n00) * tx;
  const bottom = n01 + (n11 - n01) * tx;
  return top + (bottom - top) * tz;
}

/**
 * Fractal Brownian motion. Returns [0, 1) for any number of octaves.
 * @param {number} x
 * @param {number} z
 * @param {{seed?:number, octaves?:number, frequency?:number, lacunarity?:number, gain?:number}} [opts]
 */
export function fbm2(x, z, opts = {}) {
  const { seed = 0, octaves = 4, frequency = 1, lacunarity = 2, gain = 0.5 } = opts;
  let amp = 1;
  let freq = frequency;
  let total = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    total += amp * valueNoise2(x * freq, z * freq, seed + i * 7919);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm === 0 ? 0 : total / norm;
}

/** Ridged variant of fbm2: sharp crests, range [0, 1). Good for rock and dunes. */
export function ridgedFbm2(x, z, opts = {}) {
  const { seed = 0, octaves = 4, frequency = 1, lacunarity = 2, gain = 0.5 } = opts;
  let amp = 1;
  let freq = frequency;
  let total = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    const n = 1 - Math.abs(valueNoise2(x * freq, z * freq, seed + i * 6151) * 2 - 1);
    total += amp * n;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm === 0 ? 0 : clamp01(total / norm);
}
