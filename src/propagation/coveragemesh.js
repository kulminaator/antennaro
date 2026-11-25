/**
 * Coverage grid -> draped translucent overlay.
 *
 * Layer: L4 (render adapter). The overlay reuses the terrain vertex layout and
 * writes RGBA vertex colours: band colour with alpha 1, "not evaluated" with
 * alpha 0 so the terrain shows through instead of lying to the user.
 */

import * as THREE from 'three';
import { VIEW } from '../config.js';
import { coverageRgb } from '../palette.js';

/** Cells that miss the link budget are painted faintly, so the ground still shows. */
const NO_LINK_ALPHA = 0.22;

function buildGeometry(field) {
  const vertexCount = field.size * field.size;
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(vertexCount * 3);
  const colour = new Float32Array(vertexCount * 4);
  const index = vertexCount > 65535 ? new Uint32Array((field.size - 1) * (field.size - 1) * 6)
    : new Uint16Array((field.size - 1) * (field.size - 1) * 6);

  let p = 0;
  for (let iz = 0; iz < field.size; iz += 1) {
    const z = field.worldZ(iz);
    for (let ix = 0; ix < field.size; ix += 1) {
      position[p] = field.worldX(ix);
      position[p + 1] = field.heights[field.index(ix, iz)] + VIEW.coverageOffsetM;
      position[p + 2] = z;
      p += 3;
    }
  }
  let q = 0;
  for (let iz = 0; iz < field.size - 1; iz += 1) {
    for (let ix = 0; ix < field.size - 1; ix += 1) {
      const a = field.index(ix, iz);
      const b = field.index(ix + 1, iz);
      const c = field.index(ix, iz + 1);
      const d = field.index(ix + 1, iz + 1);
      index[q] = a;
      index[q + 1] = c;
      index[q + 2] = b;
      index[q + 3] = b;
      index[q + 4] = c;
      index[q + 5] = d;
      q += 6;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 4));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return geometry;
}

/**
 * @param {import('../terrain/heightfield.js').HeightField} field
 * @returns {{mesh:THREE.Mesh, update:(field:object, coverage:object)=>void, dispose:()=>void}}
 */
export function createCoverageOverlay(field) {
  const geometry = buildGeometry(field);
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'coverage';
  mesh.renderOrder = 2;

  const colour = geometry.attributes.color;
  const position = geometry.attributes.position;

  /** Refresh the drape after the terrain changed (heights only, same grid). */
  function reposition(sourceField) {
    if (sourceField.size !== field.size) {
      throw new RangeError(`overlay grid ${field.size} does not match terrain ${sourceField.size}`);
    }
    const target = position.array;
    for (let iz = 0; iz < sourceField.size; iz += 1) {
      for (let ix = 0; ix < sourceField.size; ix += 1) {
        const index = sourceField.index(ix, iz);
        target[index * 3 + 1] = sourceField.heights[index] + VIEW.coverageOffsetM;
      }
    }
    position.needsUpdate = true;
    geometry.computeBoundingSphere();
  }

  /** Repaint from a coverage result. Requires the same field as at construction. */
  function update(sourceField, coverage) {
    if (sourceField.size !== coverage.size) {
      throw new RangeError(`coverage grid ${coverage.size} does not match terrain ${sourceField.size}`);
    }
    const target = colour.array;
    const lastBand = coverage.margins.length;
    for (let i = 0; i < sourceField.size * sourceField.size; i += 1) {
      if (coverage.evaluated[i] === 1) {
        const band = coverage.level[i];
        const rgb = coverageRgb(band);
        target[i * 4] = rgb[0];
        target[i * 4 + 1] = rgb[1];
        target[i * 4 + 2] = rgb[2];
        target[i * 4 + 3] = band >= lastBand ? NO_LINK_ALPHA : 1;
      } else {
        // Outside the study area: fully transparent, the terrain speaks for itself.
        target[i * 4] = 0;
        target[i * 4 + 1] = 0;
        target[i * 4 + 2] = 0;
        target[i * 4 + 3] = 0;
      }
    }
    colour.needsUpdate = true;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { mesh, reposition, update, dispose };
}
