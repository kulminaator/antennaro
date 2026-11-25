/**
 * Browser test surface: a small, stable API hung off `window.__sim`.
 *
 * Layer: L5 (UI adapter). Browser tests must drive the app through this object,
 * never by scraping DOM ids or clicking at coordinates: DOM layout changes must
 * not break tests, and the controller API must not change under them.
 *
 * Everything exposed here is read-only snapshots plus a handful of deterministic
 * commands (`patch`, `settle`, `step`, and the `grabSite`/`dragSiteTo`/`releaseSite`
 * drag cycle). No timers, no randomness, no synthetic mouse events.
 */

import { APP } from '../config.js';
import { sampleCoverage } from '../propagation/coverage.js';
import { cameraPose, pickGround } from './pick.js';

/**
 * @param {{controller:object, errors:Array<{message:string, at:number}>, version?:string}} options
 * @returns {object} the installed API object
 */
export function installTestApi(options) {
  const { controller, errors } = options;

  /**
   * Sample the drawing surface to prove the frame is not blank.
   * Reads the WebGL canvas through a 2D canvas, so it needs no GPU readback.
   */
  function pixelStats({ samples = 24 } = {}) {
    const source = controller.viewport.renderer.domElement;
    const canvas = document.createElement('canvas');
    canvas.width = samples;
    canvas.height = samples;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, samples, samples);
    const data = ctx.getImageData(0, 0, samples, samples).data;
    const colours = new Set();
    let luminance = 0;
    for (let i = 0; i < data.length; i += 4) {
      const key = `${data[i] >> 4}:${data[i + 1] >> 4}:${data[i + 2] >> 4}`;
      colours.add(key);
      luminance += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    const pixels = data.length / 4;
    return {
      pixels,
      distinctColours: colours.size,
      meanLuminance: luminance / pixels,
      nonBackgroundFraction: nonBackground(data),
    };
  }

  /** Fraction of sampled pixels that differ from the scene background colour. */
  function nonBackground(data) {
    const source = controller.viewport.renderer.domElement;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, 1, 1);
    const corner = ctx.getImageData(0, 0, 1, 1).data;
    let differing = 0;
    for (let i = 0; i < data.length; i += 4) {
      const delta = Math.abs(data[i] - corner[0]) + Math.abs(data[i + 1] - corner[1]) + Math.abs(data[i + 2] - corner[2]);
      if (delta > 12) differing += 1;
    }
    return differing / (data.length / 4);
  }

  const api = {
    version: options.version ?? APP.version,
    app: APP.id,
    /** Errors collected by the global error handler since page load. */
    errors,
    state: () => structuredClone(controller.state()),
    patch: (next) => controller.patch(next),
    action: (request) => controller.action(request),
    /** Force every pending rebuild and paint one frame. */
    settle: (frames = 1) => {
      controller.settle(frames);
      return controller.stats();
    },
    /** Advance the animation loop without waiting for rAF scheduling. */
    step: (frames = 1) => controller.step(frames),
    stats: () => controller.stats(),
    scene: () => controller.sceneInfo(),
    camera: () => controller.cameraState(),
    setCamera: (next) => {
      controller.setCamera(next);
      return controller.cameraState();
    },
    antenna: () => controller.antennaSummary(),
    coverage: () => controller.coverageStats(),
    /** RSSI at a world position, or null when the cell is outside the study area. */
    rssiAt: (x, z) => {
      const coverage = controller.coverage();
      if (!coverage) return null;
      return sampleCoverage(coverage, controller.terrainField(), x, z);
    },
    /**
     * The first Fresnel zone in one object: the criterion and the assumption the
     * numbers are stated for, the three buckets the colour ramp paints, the worst
     * offender, and what the drawn volume is doing. Same source as the HUD row.
     */
    fresnel: () => {
      const stats = controller.coverageStats();
      if (!stats) return null;
      const info = controller.fresnelInfo();
      return {
        clearFraction: stats.fresnelClearFraction,
        rxHeightM: stats.fresnelRxHeightM,
        clearCells: stats.fresnelClearCells,
        partialCells: stats.fresnelPartialCells,
        cutCells: stats.fresnelCutCells,
        evaluatedCells: stats.evaluatedCells,
        clearPct: stats.fresnelClearPct,
        linkedCells: stats.linkedCells,
        obstructedLinkedCells: stats.fresnelObstructedLinkedCells,
        worstClearance: stats.worstClearance,
        worstClearanceDistanceM: stats.worstClearanceDistanceM,
        volume: { visible: info.visible, vertices: info.vertices },
        link: info.link,
      };
    },
    terrain: () => controller.terrainField().stats(),
    heightAt: (x, z) => controller.terrainField().sample(x, z),
    /**
     * Ground point under a pointer position in NDC (-1..1, y up), or null when the
     * pointer looks at sky. The plane is the ground the mast stands on, which is
     * exactly what a relocation drag slides along.
     */
    pick: (ndcX, ndcY) => {
      const camera = controller.viewport.camera;
      const pose = cameraPose({
        ...controller.cameraState(), fovDeg: camera.fov, aspect: camera.aspect,
      });
      return pickGround(pose, ndcX, ndcY, controller.site().groundY);
    },
    /**
     * Where the mast stands: {x, z, groundY, heightM, y}. This is the site the
     * pipeline last built, so after a patch or a drag call `settle()` first -
     * `state().site` is the instant answer, `site()` is the physical one.
     */
    site: () => structuredClone(controller.site()),
    /** Start a relocation drag as if the pointer were on the mast. */
    grabSite: () => controller.grabSite(),
    /** Move the grabbed site to a pointer position in NDC (-1..1, y up). */
    dragSiteTo: (ndcX, ndcY) => controller.dragSiteTo(ndcX, ndcY),
    /** Finish the drag; the site patch has been committed by then. */
    releaseSite: () => controller.releaseSite(),
    /** {active, planeY, last} of the drag adapter. */
    dragState: () => controller.dragState(),
    rf: () => controller.rf(),
    pixelStats,
    /** Control-panel widget keys currently rendered. */
    controls: () => (globalThis.__simControls ? globalThis.__simControls.fieldKeys() : []),
    dispose: () => controller.dispose(),
  };

  globalThis.__sim = api;
  return api;
}
