/**
 * Coverage grid -> draped translucent overlay.
 *
 * Layer: L4 (render adapter). The overlay is built on the **coverage** grid, which
 * may be a decimation of the terrain grid (`coverage.stride`): the ground is
 * resolved at ~15 m because it has to look like land, while a link boundary is
 * kilometres wide and its ray walks are far too expensive to run per ground vertex.
 * Each coverage vertex is draped onto the terrain height *underneath it*, so the
 * coarser overlay still hugs the real surface.
 *
 * Vertex colours carry the message: RGBA, with alpha 0 where there is nothing to say
 * (outside the study area) so the terrain shows through instead of being lied about.
 * What the alpha means for a failed link is step-owned by the painting rules below.
 */

import * as THREE from 'three';
import { RF, VIEW } from '../config.js';
import { coverageRgb, fresnelZoneRgb } from '../palette.js';

/** Cells that miss the link budget are painted faintly, so the ground still shows. */
const NO_LINK_ALPHA = 0.22;

/** Terrain vertex index a coverage vertex sits on, clamped to the last row/column. */
function terrainIndex(field, stride, gx, gz) {
  const tx = Math.min(gx * stride, field.size - 1);
  const tz = Math.min(gz * stride, field.size - 1);
  return field.index(tx, tz);
}

/**
 * @param {import('../terrain/heightfield.js').HeightField} field
 * @returns {{mesh:THREE.Mesh, update:(field:object, coverage:object, options?:object)=>void,
 *   reposition:(field:object)=>void, dispose:()=>void}}
 */
export function createCoverageOverlay(field) {
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.name = 'coverage';
  mesh.renderOrder = 2;

  /** The grid the geometry currently represents, or null before the first update. */
  let grid = null;

  // Build once up front so the mesh has valid, empty geometry from the first frame;
  // `update` rebuilds it if the coverage result arrives on a different stride.
  const initialStride = Math.max(1, Math.round(RF.coverageStride));

  /** (Re)build the drape geometry for a coverage grid over the given field. */
  function build(sourceField, size, stride) {
    if (grid) {
      mesh.geometry.dispose();
    }
    const vertexCount = size * size;
    const geometry = new THREE.BufferGeometry();
    const position = new Float32Array(vertexCount * 3);
    const colour = new Float32Array(vertexCount * 4);
    const quads = (size - 1) * (size - 1) * 6;
    const indexArray = vertexCount > 65535 ? new Uint32Array(quads) : new Uint16Array(quads);

    let p = 0;
    for (let gz = 0; gz < size; gz += 1) {
      for (let gx = 0; gx < size; gx += 1) {
        const ti = terrainIndex(sourceField, stride, gx, gz);
        position[p] = sourceField.worldX(Math.min(gx * stride, sourceField.size - 1));
        position[p + 1] = sourceField.heights[ti] + VIEW.coverageOffsetM;
        position[p + 2] = sourceField.worldZ(Math.min(gz * stride, sourceField.size - 1));
        p += 3;
      }
    }
    let q = 0;
    for (let gz = 0; gz < size - 1; gz += 1) {
      for (let gx = 0; gx < size - 1; gx += 1) {
        const a = gz * size + gx;
        const b = a + 1;
        const c = a + size;
        const d = c + 1;
        indexArray[q] = a;
        indexArray[q + 1] = c;
        indexArray[q + 2] = b;
        indexArray[q + 3] = b;
        indexArray[q + 4] = c;
        indexArray[q + 5] = d;
        q += 6;
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colour, 4));
    geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
    mesh.geometry = geometry;
    grid = { size, stride, geometry, colour: geometry.attributes.color, position: geometry.attributes.position };
  }

  /** Refresh the drape after the terrain changed (heights only, same grid). */
  function reposition(sourceField) {
    if (!grid) return;
    const target = grid.position.array;
    for (let gz = 0; gz < grid.size; gz += 1) {
      for (let gx = 0; gx < grid.size; gx += 1) {
        const ti = terrainIndex(sourceField, grid.stride, gx, gz);
        target[(gz * grid.size + gx) * 3 + 1] = sourceField.heights[ti] + VIEW.coverageOffsetM;
      }
    }
    grid.position.needsUpdate = true;
    grid.geometry.computeBoundingSphere();
  }

  /**
   * Repaint from a coverage result, building the geometry if the grid changed.
   * @param {object} sourceField
   * @param {object} coverage
   * @param {{zoneView?:boolean}} [options] `zoneView` paints first-Fresnel-zone state
   *   instead of signal bands. A mode rather than a marking laid over the bands: only
   *   a small share of the map meets the clearance criterion, so painting the flag on
   *   top of the RSSI colours would wash the drape in one hue.
   */
  function update(sourceField, coverage, options = {}) {
    const stride = coverage.stride ?? 1;
    if (!grid || grid.size !== coverage.size || grid.stride !== stride) {
      build(sourceField, coverage.size, stride);
    }
    const target = grid.colour.array;
    const lastBand = coverage.margins.length;
    const zoneView = options.zoneView === true;
    const rgb = [0, 0, 0];
    for (let i = 0; i < grid.size * grid.size; i += 1) {
      if (coverage.evaluated[i] === 1) {
        const band = coverage.level[i];
        const source = zoneView
          ? fresnelZoneRgb(coverage.fresnelClearance[i])
          : coverageRgb(band);
        target[i * 4] = source[0];
        target[i * 4 + 1] = source[1];
        target[i * 4 + 2] = source[2];
        target[i * 4 + 3] = band >= lastBand ? NO_LINK_ALPHA : 1;
      } else {
        // Outside the study area: fully transparent, the terrain speaks for itself.
        target[i * 4] = 0;
        target[i * 4 + 1] = 0;
        target[i * 4 + 2] = 0;
        target[i * 4 + 3] = 0;
      }
    }
    grid.colour.needsUpdate = true;
  }

  function dispose() {
    if (grid) grid.geometry.dispose();
    material.dispose();
  }

  build(field, Math.floor((field.size - 1) / initialStride) + 1, initialStride);
  return { mesh, reposition, update, dispose };
}
