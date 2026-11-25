/**
 * Map objects: the scene subtree that represents the ground, the coverage drape
 * and the sector labels. They are built from the same height field, so they are
 * created, refreshed and disposed together.
 *
 * Layer: L4 (render adapter).
 *
 * Grid-size changes need brand-new geometries (and new label anchor heights);
 * everything else is an in-place attribute update. That distinction lives here
 * so the controller can stay out of geometry bookkeeping.
 */

import { VIEW } from '../config.js';
import { createLabels } from './labels.js';
import { createTerrainMesh } from '../terrain/terrainmesh.js';
import { createCoverageOverlay } from '../propagation/coveragemesh.js';
import { ZONE_LAYOUT } from '../terrain/generators.js';

/**
 * @param {import('../terrain/heightfield.js').HeightField} field
 * @param {{add:(object)=>void, remove:(object)=>void}} viewport
 */
export function createMapObjects(field, viewport) {
  let terrain = createTerrainMesh(field, { exaggeration: VIEW.terrainHeightExaggeration });
  let overlay = createCoverageOverlay(field);
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
    viewport.add(labels.group);
  }

  function removeAll() {
    viewport.remove(terrain.group);
    viewport.remove(overlay.mesh);
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
    addAll();
    return true;
  }

  function dispose() {
    removeAll();
    terrain.dispose();
    overlay.dispose();
    labels.dispose();
  }

  return {
    refresh,
    dispose,
    get terrain() { return terrain; },
    get overlay() { return overlay; },
    get labels() { return labels; },
  };
}
