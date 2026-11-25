/**
 * Height field -> three.js meshes.
 *
 * Layer: L4 (render adapter). This file is allowed to import three.js; nothing
 * above it may assume a renderer exists. It owns terrain surface, wireframe and
 * their materials, and nothing else.
 */

import * as THREE from 'three';
import { terrainRgb } from '../palette.js';

/** Build (or rebuild in place) the surface geometry for a height field. */
function writePositions(field, exaggeration, position) {
  const { size } = field;
  let p = 0;
  for (let iz = 0; iz < size; iz += 1) {
    const z = field.worldZ(iz);
    for (let ix = 0; ix < size; ix += 1) {
      position[p] = field.worldX(ix);
      position[p + 1] = field.heights[field.index(ix, iz)] * exaggeration;
      position[p + 2] = z;
      p += 3;
    }
  }
}

function writeColours(field, exaggeration, colour) {
  const stats = field.stats();
  let p = 0;
  for (let iz = 0; iz < field.size; iz += 1) {
    const z = field.worldZ(iz);
    for (let ix = 0; ix < field.size; ix += 1) {
      const x = field.worldX(ix);
      const rgb = terrainRgb(field.heights[field.index(ix, iz)] * exaggeration, stats.min * exaggeration,
        stats.max * exaggeration, field.slopeDegAt(x, z));
      colour[p] = rgb[0];
      colour[p + 1] = rgb[1];
      colour[p + 2] = rgb[2];
      p += 3;
    }
  }
}

function buildIndex(field, index) {
  const { size } = field;
  let p = 0;
  for (let iz = 0; iz < size - 1; iz += 1) {
    for (let ix = 0; ix < size - 1; ix += 1) {
      const a = field.index(ix, iz);
      const b = field.index(ix + 1, iz);
      const c = field.index(ix, iz + 1);
      const d = field.index(ix + 1, iz + 1);
      index[p] = a;
      index[p + 1] = c;
      index[p + 2] = b;
      index[p + 3] = b;
      index[p + 4] = c;
      index[p + 5] = d;
      p += 6;
    }
  }
}

/** Coarse line grid: cheap alternative to a full wireframe on a dense field. */
function buildWireframe(field, exaggeration, everyN = 4) {
  const points = [];
  const yLift = Math.max(0.4, field.cellSize * 0.05);
  const step = Math.max(1, everyN);
  const y = (ix, iz) => field.heights[field.index(ix, iz)] * exaggeration + yLift;
  for (let iz = 0; iz < field.size; iz += step) {
    for (let ix = 0; ix < field.size; ix += 1) {
      if (ix + 1 >= field.size) continue;
      points.push(field.worldX(ix), y(ix, iz), field.worldZ(iz), field.worldX(ix + 1), y(ix + 1, iz), field.worldZ(iz));
    }
  }
  for (let ix = 0; ix < field.size; ix += step) {
    for (let iz = 0; iz < field.size; iz += 1) {
      if (iz + 1 >= field.size) continue;
      points.push(field.worldX(ix), y(ix, iz), field.worldZ(iz), field.worldX(ix), y(ix, iz + 1), field.worldZ(iz + 1));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.LineBasicMaterial({ color: 0x9fb6c9, transparent: true, opacity: 0.22 });
  return new THREE.LineSegments(geometry, material);
}

/** Dark plinth under the map so the terrain reads as a model, not a floating sheet. */
function buildPlinth(field, exaggeration) {
  const stats = field.stats();
  const depth = Math.max(40, stats.relief * 0.12);
  const geometry = new THREE.BoxGeometry(field.worldSize, depth, field.worldSize);
  const material = new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = stats.min * exaggeration - depth / 2 + 0.5;
  mesh.name = 'terrain-plinth';
  return mesh;
}

/**
 * @param {import('../terrain/heightfield.js').HeightField} field
 * @param {{exaggeration?:number, wireframeStep?:number}} [options]
 * @returns {{group:THREE.Group, surface:THREE.Mesh, wireframe:THREE.LineSegments, size:number,
 *   update:(field:object)=>void, setWireframe:(visible:boolean)=>void, dispose:()=>void}}
 */
export function createTerrainMesh(field, options = {}) {
  const exaggeration = options.exaggeration ?? 1;
  const vertexCount = field.size * field.size;
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(vertexCount * 3);
  const colour = new Float32Array(vertexCount * 3);
  const index = vertexCount > 65535 ? new Uint32Array((field.size - 1) * (field.size - 1) * 6)
    : new Uint16Array((field.size - 1) * (field.size - 1) * 6);

  writePositions(field, exaggeration, position);
  writeColours(field, exaggeration, colour);
  buildIndex(field, index);

  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.96,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const surface = new THREE.Mesh(geometry, material);
  surface.name = 'terrain';

  let wireframe = buildWireframe(field, exaggeration, options.wireframeStep ?? 4);
  wireframe.name = 'terrain-wireframe';
  let plinth = buildPlinth(field, exaggeration);

  const group = new THREE.Group();
  group.name = 'terrain-group';
  group.userData.size = field.size;
  group.add(surface);
  group.add(wireframe);
  group.add(plinth);

  /**
   * Refresh vertex data from a height field of the SAME grid size.
   * Changing the grid size is a rebuild, not an update: the controller creates a
   * new terrain mesh instead of mutating buffers behind the GPU's back.
   */
  function update(nextField) {
    if (nextField.size !== field.size) {
      throw new RangeError(`terrain mesh update needs the same grid size (${field.size}), got ${nextField.size}`);
    }
    writePositions(nextField, exaggeration, position);
    writeColours(nextField, exaggeration, colour);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    group.remove(wireframe);
    wireframe.geometry.dispose();
    wireframe = buildWireframe(nextField, exaggeration, options.wireframeStep ?? 4);
    group.add(wireframe);
    group.remove(plinth);
    plinth.geometry.dispose();
    plinth = buildPlinth(nextField, exaggeration);
    group.add(plinth);
  }

  function setWireframe(visible) {
    wireframe.visible = Boolean(visible);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
    wireframe.geometry.dispose();
    wireframe.material.dispose();
    plinth.geometry.dispose();
    plinth.material.dispose();
  }

  return { group, surface, update, setWireframe, dispose, size: field.size, get wireframe() { return wireframe; } };
}
