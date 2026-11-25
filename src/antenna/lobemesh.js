/**
 * Radiation pattern -> translucent 3D lobe.
 *
 * Layer: L4 (render adapter). The lobe is drawn around the phase centre in the
 * antenna's own frame; the controller rotates the parent group with the aim
 * frame, so this module never needs to know where the antenna points.
 * Radius is a monotone function of gain (see pattern.lobeRadius) with a fixed
 * clip depth, because a linear dB-to-metre mapping is unreadable.
 */

import * as THREE from 'three';
import { ANTENNA } from '../config.js';
import { patternRgb } from '../palette.js';

/**
 * @param {import('../antenna/model.js').AntennaModel} model
 * @param {{scale?:number, dynamicRangeDb?:number, opacity?:number}} [options]
 * @returns {{mesh:THREE.Mesh, update:(model:object)=>void, dispose:()=>void, peakScale:number}}
 */
export function createLobeMesh(model, options = {}) {
  const scale = options.scale ?? ANTENNA.lobeScale;
  const dynamicRangeDb = options.dynamicRangeDb ?? ANTENNA.lobeDynamicRangeDb;
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: options.opacity ?? 0.45,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  let geometry = build(model, scale, dynamicRangeDb);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'radiation-pattern';
  mesh.renderOrder = 3;

  function build(target, targetScale, range) {
    const sample = target.sampleSphere({
      rings: ANTENNA.lobeRings,
      columns: ANTENNA.lobeColumns,
      dynamicRangeDb: range,
    });
    const { rows, cols, dirs, db, radius } = sample;
    const positions = new Float32Array(rows * cols * 3);
    const colours = new Float32Array(rows * cols * 3);
    for (let i = 0; i < rows * cols; i += 1) {
      const r = radius[i] * targetScale;
      positions[i * 3] = dirs[i * 3] * r;
      positions[i * 3 + 1] = dirs[i * 3 + 1] * r;
      positions[i * 3 + 2] = dirs[i * 3 + 2] * r;
      const rgb = patternRgb(db[i], target.peakGainDbi, range);
      colours[i * 3] = rgb[0];
      colours[i * 3 + 1] = rgb[1];
      colours[i * 3 + 2] = rgb[2];
    }
    const indices = [];
    for (let r = 0; r < rows - 1; r += 1) {
      for (let c = 0; c < cols - 1; c += 1) {
        const a = r * cols + c;
        const b = a + 1;
        const cc = a + cols;
        const d = cc + 1;
        indices.push(a, cc, b, b, cc, d);
      }
    }
    const built = new THREE.BufferGeometry();
    built.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    built.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    built.setIndex(indices);
    built.computeBoundingSphere();
    return built;
  }

  /** Rebuild the surface after the design, parameters or aim changed. */
  function update(nextModel) {
    const next = build(nextModel, scale, dynamicRangeDb);
    mesh.geometry.dispose();
    mesh.geometry = next;
    geometry = next;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { mesh, update, dispose, peakScale: scale };
}
