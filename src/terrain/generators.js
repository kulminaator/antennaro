/**
 * Terrain generation: four zones around the map centre.
 *
 * Layer: L1 (pure domain). `heightAt` is a pure function of (x, z, context), so
 * the same seed always yields the same ground and any point can be queried
 * without building a grid first.
 *
 * Layout (compass azimuths, metres above the datum, measured from the map centre):
 *   north (-Z)  mountain, and behind it a taller distant range
 *   east  (+X)  flat field
 *   south (+Z)  valley with raised rims
 *   west  (-X)  land with bumps
 *
 * The ground belongs to the map, and to nothing else: the generators do not take a
 * site position, because where the antenna stands must not reshape the world. There
 * used to be a flattened **site pad** under the mast, cut level with the ground the
 * mast stood on. On gentle ground that read as a workmen's platform; on steep ground
 * it was a landform - with the mast on the shoulder of the northern ridge it filled
 * the slope by 99.7 m only 57 m away, and that plateau travelled with the mast, so
 * dragging the antenna moved a hill and shadowed the map behind its new cliff. The
 * mast now simply stands on the surface it was placed on (see `terrain/site.js`).
 *
 * Zone heights cross-fade over `TERRAIN.blendBand` of the angular sector, which
 * keeps the surface C0-continuous without hard seams.
 */

import { TERRAIN, WORLD } from '../config.js';
import { bump, clamp, smoothstep, wrapDeg180 } from '../math/scalar.js';
import { fbm2, hash2i, ridgedFbm2 } from '../math/noise.js';
import { HeightField } from './heightfield.js';

export const ZONES = Object.freeze({
  MOUNTAIN: 'mountain',
  FLAT: 'flat',
  VALLEY: 'valley',
  BUMPS: 'bumps',
});

/** Display order + which compass direction each zone occupies. */
export const ZONE_LAYOUT = Object.freeze([
  Object.freeze({ id: ZONES.MOUNTAIN, label: 'Mountain + distant range', azimuthDeg: 0 }),
  Object.freeze({ id: ZONES.FLAT, label: 'Flat field', azimuthDeg: 90 }),
  Object.freeze({ id: ZONES.VALLEY, label: 'Valley', azimuthDeg: 180 }),
  Object.freeze({ id: ZONES.BUMPS, label: 'Bumpy land', azimuthDeg: 270 }),
]);

/** Build the immutable evaluation context passed to every height function. */
export function createTerrainContext({ seed = TERRAIN.seed, worldSize = WORLD.worldSize } = {}) {
  return Object.freeze({
    seed: seed | 0,
    worldSize,
    half: worldSize / 2,
    blendHalfDeg: clamp(TERRAIN.blendBand, 0.02, 0.45) * 45,
  });
}

/** Normalised angular weights for the four zones. Always sums to 1. */
export function sectorWeights(x, z, ctx) {
  const az = (Math.atan2(x, -z) * 180) / Math.PI; // [0, 360) clockwise from north
  const weights = {};
  let total = 0;
  for (const zone of ZONE_LAYOUT) {
    // Zone centres sit 90 deg apart, so the seam between neighbours is at 45 deg.
    const delta = Math.abs(wrapDeg180(az - zone.azimuthDeg));
    const w = 1 - smoothstep(45 - ctx.blendHalfDeg, 45 + ctx.blendHalfDeg, delta);
    weights[zone.id] = w;
    total += w;
  }
  if (total <= 0) weights[ZONE_LAYOUT[0].id] = 1;
  else for (const zone of ZONE_LAYOUT) weights[zone.id] /= total;
  return weights;
}

/** Dominant zone at a world position (the one with the largest weight). */
export function zoneAt(x, z, ctx) {
  const weights = sectorWeights(x, z, ctx);
  let best = ZONE_LAYOUT[0].id;
  let bestW = -Infinity;
  for (const zone of ZONE_LAYOUT) {
    if (weights[zone.id] > bestW) {
      bestW = weights[zone.id];
      best = zone.id;
    }
  }
  return best;
}

/** Low-amplitude regional undulation shared by every zone. */
function regional(x, z, ctx) {
  // The noise frequencies below are per metre and stay that way: they are texture,
  // sized to the grid cells that resolve them, not landforms sized to the map.
  return TERRAIN.regionalAmplitude * fbm2(x * TERRAIN.regionalFrequency, z * TERRAIN.regionalFrequency, {
    seed: ctx.seed,
    octaves: 4,
  });
}

function flatHeight(x, z, ctx) {
  const wiggle = (fbm2(x * 0.004, z * 0.004, { seed: ctx.seed + 11, octaves: 3 }) - 0.5) * 2;
  return regional(x, z, ctx) + wiggle * TERRAIN.flat.roughness;
}

function valleyHeight(x, z, ctx) {
  const cfg = TERRAIN.valley;
  const meander = cfg.meander * ((fbm2(z * 0.0012, 12.5, { seed: ctx.seed + 21, octaves: 2 }) - 0.5) * 2);
  const lateral = Math.abs(x - meander);
  // A valley runs away from the site, not through it: the floor and its rims fade
  // out north of the centre so the channel stays in the southern half of the map.
  const meridional = smoothstep(cfg.northLimit, cfg.southLimit, z / ctx.half);
  const floor = cfg.depth * meridional * bump(lateral, cfg.halfWidth);
  const rim = cfg.rimHeight * meridional * smoothstep(cfg.halfWidth, cfg.halfWidth * 2.1, lateral)
    * (1 - smoothstep(cfg.rimWidth, cfg.rimWidth * 1.9, lateral));
  return regional(x, z, ctx) + rim - floor;
}

/**
 * Gaussian bumps placed on a jittered lattice. Lattice hashing (instead of a
 * feature list) keeps `heightAt` pure while still giving repeatable hills.
 */
function bumpField(x, z, ctx) {
  const cfg = TERRAIN.bumps;
  const spacing = cfg.radius * cfg.spacingFactor;
  const cx = Math.floor(x / spacing);
  const cz = Math.floor(z / spacing);
  let acc = 0;
  for (let iz = cz - 1; iz <= cz + 1; iz += 1) {
    for (let ix = cx - 1; ix <= cx + 1; ix += 1) {
      if (hash2i(ix, iz, ctx.seed + 4409) > cfg.density) continue;
      const ox = (ix + 0.2 + 0.6 * hash2i(ix, iz, ctx.seed + 313)) * spacing;
      const oz = (iz + 0.2 + 0.6 * hash2i(ix, iz, ctx.seed + 977)) * spacing;
      const amp = cfg.amplitude * (0.35 + 0.65 * hash2i(ix, iz, ctx.seed + 1801));
      acc += amp * bump(Math.hypot(ox - x, oz - z), cfg.radius);
    }
  }
  return acc;
}

function bumpsHeight(x, z, ctx) {
  const cfg = TERRAIN.bumps;
  const fine = (ridgedFbm2(x * 0.006, z * 0.006, { seed: ctx.seed + 77, octaves: 3 }) - 0.5) * 2;
  return regional(x, z, ctx) + bumpField(x, z, ctx) + fine * cfg.fineNoise;
}

/** A gaussian ridge whose crease runs roughly perpendicular to `axisZ`. */
function ridgeHeight(x, axisZ, ctx, { peak, centreZ, width, meanderAmp, meanderFreq, rock }) {
  const centre = centreZ * ctx.half + meanderAmp * Math.sin(x * meanderFreq);
  const along = (axisZ - centre) / width;
  const base = peak * Math.exp(-along * along);
  const rocky = base > peak * 0.05 ? rock * ridgedFbm2(x * 0.004, axisZ * 0.004, { seed: ctx.seed + 555, octaves: 4 }) : 0;
  return base + rocky * Math.min(1, base / peak);
}

function mountainHeight(x, z, ctx) {
  const cfg = TERRAIN.mountain;
  const near = ridgeHeight(x, z, ctx, {
    peak: cfg.peak,
    centreZ: cfg.centreZ,
    width: cfg.width,
    meanderAmp: cfg.meanderM,
    meanderFreq: cfg.curvature,
    rock: cfg.rockM,
  });
  const distant = ridgeHeight(x, z, ctx, {
    peak: cfg.distantPeak,
    centreZ: cfg.distantCentreZ,
    width: cfg.distantWidth,
    meanderAmp: cfg.distantMeanderM,
    meanderFreq: cfg.curvature * 0.6,
    rock: cfg.distantRockM,
  });
  return regional(x, z, ctx) + near + distant;
}

/** Zone id -> elevation function. Exposed for tests and future editing tools. */
export const ZONE_HEIGHT_FN = Object.freeze({
  [ZONES.FLAT]: flatHeight,
  [ZONES.VALLEY]: valleyHeight,
  [ZONES.BUMPS]: bumpsHeight,
  [ZONES.MOUNTAIN]: mountainHeight,
});

/**
 * Elevation in metres above the datum at a world position: the four zone heights
 * cross-faded by their sector weights. Nothing else - in particular no grading
 * around the antenna, so `heightAt` cannot depend on where the mast stands.
 */
export function heightAt(x, z, ctx) {
  const weights = sectorWeights(x, z, ctx);
  let h = 0;
  for (const zone of ZONE_LAYOUT) {
    const w = weights[zone.id];
    if (w > 0) h += w * ZONE_HEIGHT_FN[zone.id](x, z, ctx);
  }
  return h;
}

/**
 * @param {{size?:number, worldSize?:number, seed?:number}} [options]
 * @returns {HeightField}
 */
export function generateTerrain(options = {}) {
  const {
    size = WORLD.gridSize, worldSize = WORLD.worldSize, seed = TERRAIN.seed,
  } = options;
  const ctx = createTerrainContext({ seed, worldSize });
  const field = new HeightField({ size, worldSize });
  return field.fillFromFunction((x, z) => heightAt(x, z, ctx));
}

/**
 * Straight-line elevation profile from the origin towards a compass azimuth.
 * Handy for tests, debug plots and the range read-outs.
 * @returns {Array<{x:number, z:number, y:number, distance:number}>}
 */
export function profileAlong(field, azimuthDeg, { from = 0, to = field.half, steps = 64 } = {}) {
  const rad = (azimuthDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dz = -Math.cos(rad);
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const distance = from + ((to - from) * i) / steps;
    const x = dx * distance;
    const z = dz * distance;
    out.push({ x, z, y: field.sample(x, z), distance });
  }
  return out;
}
