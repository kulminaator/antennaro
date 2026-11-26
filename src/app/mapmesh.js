/**
 * Map objects: the scene subtree that represents the ground, the coverage drape,
 * the sector labels and the study-range ring. They are built from the same height
 * field, so they are created, refreshed and disposed together.
 *
 * Layer: L4 (render adapter).
 *
 * Grid-size changes need brand-new geometries (and new label anchor heights);
 * everything else is an in-place attribute update. That distinction lives here
 * so the controller can stay out of geometry bookkeeping.
 */

import * as THREE from 'three';
import { COLOURS, VIEW } from '../config.js';
import { createLabels } from './labels.js';
import { createTerrainMesh } from '../terrain/terrainmesh.js';
import { createCoverageOverlay } from '../propagation/coveragemesh.js';
import { ZONE_LAYOUT } from '../terrain/generators.js';
import { farthestGroundDistanceM } from '../math/vec3.js';

/**
 * The study-range ring: the boundary of the area the coverage sweep was asked to
 * evaluate, drawn on the ground around the mast.
 *
 * It exists so that a limit of ours can never be mistaken for a limit of the antenna.
 * When the coverage blob stops at a circle, the circle is drawn, in a colour the
 * signal ramp never uses; when the study area is wider than the map it could never
 * have bitten, so nothing is drawn - an always-visible circle would train the eye to
 * ignore it. Heights follow the coverage drape's own convention (raw field height plus
 * `VIEW.coverageOffsetM`, see `coveragemesh.js`) with a lift on top, so the line rides
 * the surface it describes instead of being buried by it.
 */
function createRangeRing(field) {
  const samples = Math.max(24, Math.round(VIEW.rangeRingSamples));
  const positions = new Float32Array(samples * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: COLOURS.rangeLimit,
    transparent: true,
    opacity: VIEW.rangeRingOpacity,
    depthWrite: false,
  });
  const mesh = new THREE.LineLoop(geometry, material);
  mesh.name = 'range-ring';
  mesh.renderOrder = 3;
  mesh.visible = false;

  let ground = field;
  let centre = { x: 0, z: 0 };
  let radiusM = 0;
  let shown = false;

  /**
   * A circle wider than all the map there is from this mast can never be what stopped a
   * coverage blob - and "all the map" is measured from the mast, not from the middle of the
   * picture: a mast in a corner has 7354 m of ground to think about, so a work area wider
   * than the half-diagonal is real for it and decoration for a mast at the centre.
   */
  function canBind() {
    return radiusM > 0 && radiusM < farthestGroundDistanceM(centre, ground.half);
  }

  function reshape() {
    const target = geometry.attributes.position.array;
    for (let i = 0; i < samples; i += 1) {
      const angle = (i / samples) * Math.PI * 2;
      const x = centre.x + Math.sin(angle) * radiusM;
      const z = centre.z - Math.cos(angle) * radiusM;
      target[i * 3] = THREE.MathUtils.clamp(x, -ground.half, ground.half);
      target[i * 3 + 1] = ground.sample(x, z) + VIEW.coverageOffsetM + VIEW.rangeRingLiftM;
      target[i * 3 + 2] = THREE.MathUtils.clamp(z, -ground.half, ground.half);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeBoundingSphere();
  }

  /** Move the ring to a mast and a work-area radius (0 hides it). */
  function update(site, radius) {
    centre = { x: site.x, z: site.z };
    radiusM = Number.isFinite(radius) ? Math.max(0, radius) : 0;
    reshape();
    mesh.visible = shown && canBind();
  }

  /** Whether the scene is showing coverage at all; the ring belongs to that overlay. */
  function setShown(flag) {
    shown = flag === true;
    mesh.visible = shown && canBind();
  }

  function setField(nextField) {
    ground = nextField;
    reshape();
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  function info() {
    return { visible: mesh.visible, radiusM, canBind: canBind() };
  }

  return { mesh, update, setShown, setField, dispose, info };
}

/**
 * @param {import('../terrain/heightfield.js').HeightField} field
 * @param {{add:(object)=>void, remove:(object)=>void}} viewport
 */
export function createMapObjects(field, viewport) {
  let terrain = createTerrainMesh(field, { exaggeration: VIEW.terrainHeightExaggeration });
  let overlay = createCoverageOverlay(field);
  let ring = createRangeRing(field);
  let labels = createLabelsFor(field);
  addAll();

  function createLabelsFor(nextField) {
    return createLabels({
      zones: ZONE_LAYOUT,
      half: nextField.half,
      sampleHeight: (x, z) => nextField.sample(x, z),
      exaggeration: VIEW.terrainHeightExaggeration,
    });
  }

  function addAll() {
    viewport.add(terrain.group);
    viewport.add(overlay.mesh);
    viewport.add(ring.mesh);
    viewport.add(labels.group);
  }

  function removeAll() {
    viewport.remove(terrain.group);
    viewport.remove(overlay.mesh);
    viewport.remove(ring.mesh);
    viewport.remove(labels.group);
  }

  /**
   * After a terrain rebuild. Same grid size -> cheap attribute copy; different
   * grid size -> new geometries and new meshes.
   */
  function refresh(nextField) {
    if (nextField.size === terrain.size) {
      terrain.update(nextField);
      overlay.reposition(nextField);
      return false;
    }
    removeAll();
    terrain.dispose();
    overlay.dispose();
    labels.dispose();
    terrain = createTerrainMesh(nextField, { exaggeration: VIEW.terrainHeightExaggeration });
    overlay = createCoverageOverlay(nextField);
    labels = createLabelsFor(nextField);
    ring.setField(nextField);
    addAll();
    return true;
  }

  function dispose() {
    removeAll();
    terrain.dispose();
    overlay.dispose();
    ring.dispose();
    labels.dispose();
  }

  return {
    refresh,
    dispose,
    get terrain() { return terrain; },
    get overlay() { return overlay; },
    get ring() { return ring; },
    get labels() { return labels; },
  };
}
