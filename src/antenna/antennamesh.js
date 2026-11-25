/**
 * Antenna descriptors -> three.js objects, plus the mast and the aim frame.
 *
 * Layer: L4 (render adapter). Physical dimensions are metres, which at UHF is a
 * decimetre-scale object on a kilometre-scale map, so the structure is drawn
 * with an explicit visual scale (logged in the HUD as "not to scale"). The mast
 * is always drawn at true scale because it encodes the antenna height.
 */

import * as THREE from 'three';
import { VIEW } from '../config.js';

const UP = new THREE.Vector3(0, 1, 0);

const MATERIALS = {
  metal: () => new THREE.MeshStandardMaterial({ color: 0xd7dde4, metalness: 0.85, roughness: 0.35 }),
  element: () => new THREE.MeshStandardMaterial({ color: 0xc0c8d2, metalness: 0.7, roughness: 0.45 }),
  reflector: () => new THREE.MeshStandardMaterial({
    color: 0x8b93a1, metalness: 0.5, roughness: 0.6, side: THREE.DoubleSide,
  }),
  radome: () => new THREE.MeshStandardMaterial({
    color: 0xf1f5fb, metalness: 0.05, roughness: 0.8, transparent: true, opacity: 0.32,
  }),
  feed: () => new THREE.MeshStandardMaterial({ color: 0xffb347, metalness: 0.3, roughness: 0.55 }),
  sleeve: () => new THREE.MeshStandardMaterial({ color: 0x6f7885, metalness: 0.6, roughness: 0.5 }),
  boom: () => new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.75, roughness: 0.4 }),
};

function materialFor(kind) {
  return (MATERIALS[kind] ?? MATERIALS.metal)();
}

function cylinderBetween(a, b, radius, material, segments = 8) {
  const from = new THREE.Vector3(a[0], a[1], a[2]);
  const to = new THREE.Vector3(b[0], b[1], b[2]);
  const delta = new THREE.Vector3().subVectors(to, from);
  const length = delta.length();
  if (length < 1e-6) return null;
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments, 1, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(from).addScaledVector(delta, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, delta.clone().normalize());
  return mesh;
}

/**
 * Scale factor that keeps the hardware visible without letting it swallow the map.
 * @param {number} spanM true physical span of the structure, metres
 */
export function visualScaleFor(spanM, { span = VIEW.antennaVisualSpanM, max = VIEW.antennaVisualScaleMax } = {}) {
  if (!(spanM > 0)) return 1;
  return Math.min(max, span / spanM);
}

/** three.js matrix that maps local antenna axes (right, up, forward) to world. */
export function frameMatrix(frame) {
  // Basis columns are (axisX, up, forward): a proper rotation. See the note in
  // aim.js:createAimFrame for why local +X is -right.
  return new THREE.Matrix4().makeBasis(
    new THREE.Vector3(frame.axisX.x, frame.axisX.y, frame.axisX.z),
    new THREE.Vector3(frame.up.x, frame.up.y, frame.up.z),
    new THREE.Vector3(frame.forward.x, frame.forward.y, frame.forward.z),
  );
}

/**
 * @param {import('../antenna/geometryspec.js').AntennaGeometry} geometry
 * @param {{scale?:number}} [options] explicit scale; computed from bounds when omitted
 * @returns {{group:THREE.Group, scale:number, dispose:()=>void}}
 */
export function createAntennaMesh(geometry, options = {}) {
  const scale = options.scale ?? visualScaleFor(geometry.bounds.span);
  const group = new THREE.Group();
  group.name = `antenna-${geometry.kind}`;
  const disposables = [];

  for (const part of geometry.parts) {
    if (part.type === 'rod') {
      const material = materialFor(part.role === 'boom' ? 'boom' : 'element');
      const mesh = cylinderBetween(
        [part.from[0] * scale, part.from[1] * scale, part.from[2] * scale],
        [part.to[0] * scale, part.to[1] * scale, part.to[2] * scale],
        part.radius * scale,
        material,
      );
      addRaw(group, mesh, disposables);
    } else if (part.type === 'box') {
      const geometryBox = new THREE.BoxGeometry(part.size[0] * scale, part.size[1] * scale, part.size[2] * scale);
      const mesh = new THREE.Mesh(geometryBox, materialFor(part.kind));
      mesh.position.set(part.centre[0] * scale, part.centre[1] * scale, part.centre[2] * scale);
      addRaw(group, mesh, disposables);
    } else if (part.type === 'loop') {
      const material = materialFor('element');
      for (let i = 1; i < part.points.length; i += 1) {
        const mesh = cylinderBetween(
          [part.points[i - 1][0] * scale, part.points[i - 1][1] * scale, part.points[i - 1][2] * scale],
          [part.points[i][0] * scale, part.points[i][1] * scale, part.points[i][2] * scale],
          part.radius * scale,
          material,
          6,
        );
        addRaw(group, mesh, disposables);
      }
    }
  }

  function dispose() {
    for (const item of disposables) item.dispose();
    disposables.length = 0;
  }

  return { group, scale, dispose };
}

function addRaw(group, mesh, disposables) {
  if (!mesh) return;
  group.add(mesh);
  disposables.push(mesh.geometry);
  disposables.push(mesh.material);
}

/** Vertical mast from the ground up to the antenna, drawn at true scale. */
export function createMast(heightM, { radiusM = 0.35, colour = 0x535b66 } = {}) {
  const height = Math.max(0.5, heightM);
  const geometry = new THREE.CylinderGeometry(radiusM, radiusM * 1.25, height, 10, 1, false);
  const material = new THREE.MeshStandardMaterial({ color: colour, metalness: 0.3, roughness: 0.8 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'mast';
  mesh.position.y = height / 2; // group is placed at ground level
  return {
    mesh,
    setHeight(value) {
      const next = Math.max(0.5, value);
      mesh.geometry.dispose();
      mesh.geometry = new THREE.CylinderGeometry(radiusM, radiusM * 1.25, next, 10, 1, false);
      mesh.position.y = next / 2;
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
