/**
 * Physical antenna geometry descriptors.
 *
 * Layer: L1 (pure domain). These builders describe *what the hardware looks
 * like* as a list of primitives in metres, in the antenna's local frame:
 *   +Z = boresight, +Y = up, +X = local x (the antenna's left as seen from
 *   behind - see the handedness note in aim.js). All hardware here is left/right
 *   symmetric, so the distinction is only visible in debug dumps.
 * They deliberately know nothing about three.js - `antennamesh.js` turns the
 * descriptors into meshes, so element counts, lengths and boom dimensions stay
 * unit-testable without a browser.
 */

import { clamp } from '../math/scalar.js';

/** Smallest drawable rod radius, metres. */
const MIN_ROD_RADIUS = 0.004;

function rod(from, to, radius, role = 'structure') {
  return { type: 'rod', role, from, to, radius: Math.max(MIN_ROD_RADIUS, radius) };
}

function box(centre, size, kind = 'body', role = 'structure') {
  return { type: 'box', kind, role, centre, size };
}

function loop(points, radius, role = 'element') {
  return { type: 'loop', role, points, radius: Math.max(MIN_ROD_RADIUS, radius) };
}

function squareLoopPoints(side, z) {
  const h = side / 2;
  return [[-h, -h, z], [h, -h, z], [h, h, z], [-h, h, z], [-h, -h, z]];
}

/** Count parts carrying a given role; the numbers the HUD and tests read. */
export function countRole(geometry, role) {
  return geometry.parts.filter((part) => part.role === role).length;
}

/** Bounding box of a descriptor, used for labels and for the visual scale. */
export function geometryBounds(parts) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const visit = (p) => {
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  };
  for (const part of parts) {
    if (part.type === 'rod') {
      visit(part.from);
      visit(part.to);
    } else if (part.type === 'box') {
      visit([part.centre[0] - part.size[0] / 2, part.centre[1] - part.size[1] / 2, part.centre[2] - part.size[2] / 2]);
      visit([part.centre[0] + part.size[0] / 2, part.centre[1] + part.size[1] / 2, part.centre[2] + part.size[2] / 2]);
    } else if (part.type === 'loop') {
      for (const p of part.points) visit(p);
    }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0], span: 0 };
  const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  return { min, max, span };
}

/** Half-wave dipole: two quarter-wave rods and a feed point. */
function dipoleParts(params, lambda) {
  const r = 0.012 * lambda;
  const quarter = lambda / 4;
  return {
    parts: [
      rod([0, -quarter, 0], [0, 0, 0], r, 'element'),
      rod([0, 0, 0], [0, quarter, 0], r, 'element'),
      box([0, 0, 0], [0.08 * lambda, 0.05 * lambda, 0.08 * lambda], 'feed'),
    ],
    meta: { lengthM: lambda / 2, boomLengthM: 0, apertureM: 0.08 * lambda, elements: 1 },
  };
}

/** Collinear stack: N half-wave sections with phasing sleeves between them. */
function collinearParts(params, lambda) {
  const n = Math.max(1, Math.round(params.elements));
  const spacing = clamp(params.spacingLambda, 0.2, 1.5) * lambda;
  const r = 0.012 * lambda;
  const parts = [];
  for (let i = 0; i < n; i += 1) {
    const centre = (i - (n - 1) / 2) * spacing;
    parts.push(rod([0, centre - lambda / 4, 0], [0, centre + lambda / 4, 0], r, 'element'));
    if (i < n - 1) {
      parts.push(box([0, centre + spacing / 2, 0], [0.07 * lambda, 0.1 * lambda, 0.07 * lambda], 'sleeve'));
    }
  }
  parts.push(box([0, (-(n - 1) / 2) * spacing - lambda / 4 - 0.08 * lambda, 0],
    [0.1 * lambda, 0.16 * lambda, 0.1 * lambda], 'feed'));
  return {
    parts,
    meta: { lengthM: (n - 1) * spacing + lambda / 2, boomLengthM: 0, apertureM: 0.1 * lambda, elements: n },
  };
}

/** Yagi: boom along the boresight, reflector behind the driven element, directors ahead. */
function yagiParts(params, lambda) {
  const directors = Math.max(1, Math.round(params.directors));
  const spacing = clamp(params.spacingLambda, 0.15, 0.5) * lambda;
  const boomEnd = directors * spacing + 0.1 * lambda;
  const parts = [
    rod([0, 0, -spacing - 0.05 * lambda], [0, 0, boomEnd], 0.014 * lambda, 'boom'),
    rod([-0.245 * lambda, 0, -spacing], [0.245 * lambda, 0, -spacing], 0.012 * lambda, 'reflector'),
    rod([-0.23 * lambda, 0, 0], [0.23 * lambda, 0, 0], 0.012 * lambda, 'driven'),
    box([0, -0.05 * lambda, 0], [0.08 * lambda, 0.1 * lambda, 0.08 * lambda], 'feed'),
  ];
  for (let k = 1; k <= directors; k += 1) {
    const half = clamp(0.225 * lambda - 0.008 * lambda * k, 0.17 * lambda, 0.24 * lambda);
    parts.push(rod([-half, 0, k * spacing], [half, 0, k * spacing], 0.011 * lambda, 'director'));
  }
  return {
    parts,
    meta: { lengthM: 0.49 * lambda, boomLengthM: boomEnd + spacing, apertureM: 0.49 * lambda, elements: directors + 2 },
  };
}

/** Biquad: two square loops in front of a plate reflector, fed at a corner. */
function biquadParts(params, lambda) {
  const turns = Math.max(1, Math.round(params.turns));
  const side = 0.5 * lambda;
  const r = 0.014 * lambda;
  const spacing = clamp(params.reflectorSpacingLambda, 0.05, 0.5) * lambda;
  const parts = [];
  for (let t = 0; t < turns; t += 1) {
    parts.push(loop(squareLoopPoints(side, -0.03 * lambda * t), r, 'element'));
  }
  parts.push(rod([-side / 2, -side / 2, 0], [0, 0, 0.04 * lambda], r, 'driven'));
  parts.push(box([0, 0, -spacing], [1.2 * lambda, 1.2 * lambda, 0.02 * lambda], 'reflector', 'reflector'));
  return {
    parts,
    meta: { lengthM: side * 4 * turns, boomLengthM: spacing, apertureM: 1.2 * lambda, elements: turns },
  };
}

/** Patch: ground plane, radiating patch, probe and a radome shell. */
function patchParts(params, lambda) {
  const size = clamp(params.sizeLambda, 0.5, 2);
  const pw = 0.5 * lambda * size;
  const ph = 0.42 * lambda * size;
  return {
    parts: [
      box([0, 0, -0.05 * lambda], [1.25 * pw, 1.15 * ph, 0.03 * lambda], 'reflector', 'reflector'),
      box([0, 0, -0.015 * lambda], [pw, ph, 0.02 * lambda], 'body', 'driven'),
      rod([0, 0, -0.05 * lambda], [0, 0, 0.02 * lambda], 0.01 * lambda, 'feed'),
      box([0, 0, 0.07 * lambda], [1.3 * pw, 1.2 * ph, 0.12 * lambda], 'radome'),
    ],
    meta: { lengthM: 0, boomLengthM: 0.12 * lambda, apertureM: Math.max(pw, ph), elements: 1 },
  };
}

const BUILDERS = Object.freeze({
  dipole: dipoleParts,
  collinear: collinearParts,
  yagi: yagiParts,
  biquad: biquadParts,
  patch: patchParts,
});

export const GEOMETRY_KINDS = Object.freeze(Object.keys(BUILDERS));

/**
 * @typedef {{type:'rod', role:string, from:number[], to:number[], radius:number}
 *  | {type:'box', role:string, kind:string, centre:number[], size:number[]}
 *  | {type:'loop', role:string, points:number[][], radius:number}} AntennaPart
 */

/**
 * @typedef {{kind:string, units:'m', parts:AntennaPart[],
 *   bounds:{min:number[],max:number[],span:number},
 *   meta:{lengthM:number, boomLengthM:number, apertureM:number, elements?:number}}} AntennaGeometry
 */

/**
 * Build the physical structure of an antenna.
 * @param {string} kind one of GEOMETRY_KINDS
 * @param {Record<string, number>} params design parameters (see catalogue.js)
 * @param {number} wavelength metres
 * @returns {AntennaGeometry}
 */
export function buildAntennaGeometry(kind, params, wavelength) {
  const builder = BUILDERS[kind];
  if (!builder) throw new RangeError(`unknown antenna geometry kind: ${kind}`);
  if (!(wavelength > 0)) throw new RangeError('wavelength must be > 0');
  if (!params) throw new TypeError('antenna params are required');
  const built = builder(params, wavelength);
  const parts = Object.freeze(built.parts);
  return Object.freeze({
    kind,
    units: 'm',
    parts,
    bounds: geometryBounds(built.parts),
    meta: Object.freeze({ elements: 0, ...built.meta }),
  });
}

/** Total wire length of every rod and loop, metres. Handy sanity metric. */
export function conductorLengthM(geometry) {
  let total = 0;
  for (const part of geometry.parts) {
    if (part.type === 'rod') {
      total += Math.hypot(part.to[0] - part.from[0], part.to[1] - part.from[1], part.to[2] - part.from[2]);
    } else if (part.type === 'loop') {
      for (let i = 1; i < part.points.length; i += 1) {
        const a = part.points[i - 1];
        const b = part.points[i];
        total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      }
    }
  }
  return total;
}
