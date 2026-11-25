/**
 * Scene controller: owns the viewport and turns state into pixels.
 *
 * Layer: L5 (composition). One of the few modules allowed to touch three.js
 * (see GUIDELINES.md §5): it is where domain results get attached to the scene
 * graph. It holds no user-visible decisions of its own - everything is driven by
 * state that arrives through `patch()`.
 *
 * Pipeline per change:
 *   patch -> applyPatch -> impactedStages -> dirty flags -> staged rebuild in the
 *   frame loop (terrain -> antenna -> coverage) -> render.
 * Expensive stages are throttled so dragging a slider stays responsive; `settle()`
 * runs exactly the same code path with the throttle disabled (used by tests and
 * when loading a preset).
 */

import { VIEW } from '../config.js';
import { EVENTS, createEventBus } from '../core/eventbus.js';
import { createFrameLoop } from '../core/loop.js';
import { createAntennaModel } from '../antenna/model.js';
import { createAntennaRig } from '../antenna/rigmesh.js';
import { generateTerrain } from '../terrain/generators.js';
import { resolveSite } from '../terrain/site.js';
import { createMapObjects } from './mapmesh.js';
import { createFresnelMesh } from '../propagation/fresnelmesh.js';
import { resolveFrequencyHz, wavelengthM } from '../propagation/rf.js';
import { applyPatch, createInitialState, impactedStages, RECOMPUTE } from './state.js';
import { createActions } from './actions.js';
import { createReports } from './reports.js';
import { createLabels } from './labels.js';
import { createOrbitControls } from './orbit.js';
import { createSiteRelocator } from './relocate.js';
import { createViewport } from './viewport.js';

/** Minimum time between two coverage recomputes while a slider is being dragged. */
export const COVERAGE_THROTTLE_MS = 55;

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * @param {{canvas:HTMLCanvasElement, initialState?:object, bus?:object,
 *   autoStart?:boolean, coverageThrottleMs?:number, preserveDrawingBuffer?:boolean}} options
 */
export function createController(options) {
  const bus = options.bus ?? createEventBus();
  const throttleMs = options.coverageThrottleMs ?? COVERAGE_THROTTLE_MS;
  let state = createInitialState(options.initialState ?? {});

  const viewport = createViewport({
    canvas: options.canvas,
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? true,
    antialias: options.antialias ?? true,
  });
  // The relocator comes first: it is the gate the orbit controls ask before they
  // take a pointer gesture, so it has to exist when orbit is built.
  const relocator = createSiteRelocator({
    domElement: options.canvas,
    viewport,
    // Resolved lazily: the pipeline rebuilds `site` on every terrain pass.
    getSite: () => site,
    onMove: (next) => patch({ site: { x: next.x, z: next.z } }),
  });
  const orbit = createOrbitControls({
    domElement: options.canvas, viewport, intercept: (event) => relocator.intercept(event),
  });

  let field = generateTerrain({
    size: state.gridSize, worldSize: state.worldSize, seed: state.seed, siteX: state.site.x, siteZ: state.site.z,
  });
  let fieldSignature = terrainSignature();
  const mapObjects = createMapObjects(field, viewport);
  const rig = createAntennaRig();
  viewport.add(rig.group);
  const fresnel = createFresnelMesh(viewport.scene);

  /** @type {import('../antenna/model.js').AntennaModel|null} */
  let model = null;
  let site = currentSite();

  /** Coverage recompute plus the summary objects the HUD, legend and tests read. */
  const reports = createReports({
    getState: () => state,
    getModel: () => model,
    getField: () => field,
    getSite: () => site,
    getRigInfo: () => rig.info(),
    getMapObjects: () => mapObjects,
    getViewportInfo: () => viewport.info(),
    getCameraState: () => viewport.cameraState(),
    onCoverage: (coverage) => {
      mapObjects.overlay.update(field, coverage, { zoneView: state.display.showFresnel === true });
      // The volume rides the same inputs as the grid - site, aim, height, frequency,
      // range and receiver assumption - so it is rebuilt here rather than tracked.
      fresnel.update(reports.fresnelLink());
      lastCoverageMs = now();
      bus.emit(EVENTS.COVERAGE_READY, coverage);
    },
  });

  const dirty = { terrain: true, antenna: true, coverage: true };
  let lastCoverageMs = 0;
  let lastZoneView = false;

  /** Everything the height field depends on - including where the pad sits. */
  function terrainSignature() {
    return `${state.gridSize}:${state.worldSize}:${state.seed}:${state.site.x}:${state.site.z}`;
  }

  /** The mast's footprint: the state's site position on the current ground. */
  function currentSite() {
    return resolveSite(field, { x: state.site.x, z: state.site.z, heightM: state.heightM });
  }

  function rebuildTerrain() {
    const signature = terrainSignature();
    if (signature !== fieldSignature) {
      field = generateTerrain({
        size: state.gridSize, worldSize: state.worldSize, seed: state.seed, siteX: state.site.x, siteZ: state.site.z,
      });
      fieldSignature = signature;
      mapObjects.refresh(field, viewport);
    }
    site = currentSite();
    rig.place(model, site);
    bus.emit(EVENTS.TERRAIN_REBUILT, { size: field.size, stats: field.stats() });
  }

  function rebuildAntenna() {
    model = createAntennaModel({
      designId: state.designId,
      params: state.params,
      aim: state.aim,
      wavelength: wavelengthM(resolveFrequencyHz(state.frequencyKey)),
    });
    site = currentSite();
    rig.setModel(model, site);
    bus.emit(EVENTS.ANTENNA_REBUILT, model.summary());
  }

  function applyVisibility() {
    mapObjects.overlay.mesh.visible = state.display.showCoverage;
    rig.setPatternVisible(state.display.showPattern);
    mapObjects.terrain.setWireframe(state.display.showWireframe);
    mapObjects.labels.group.visible = state.display.showSectors;
    fresnel.setVisible(state.display.showFresnel === true);
    // The zone shares the coverage drape rather than adding a second one, so turning
    // it over means repainting the drape in the other language.
    const zoneView = state.display.showFresnel === true;
    if (zoneView !== lastZoneView) {
      lastZoneView = zoneView;
      const coverage = reports.coverage();
      if (coverage) mapObjects.overlay.update(field, coverage, { zoneView });
    }
  }

  /** One staged pass. `force` disables the coverage throttle. */
  function pump(force = false) {
    let worked = false;
    if (dirty.terrain) {
      rebuildTerrain();
      dirty.terrain = false;
      dirty.antenna = true;
      worked = true;
    }
    if (dirty.antenna) {
      rebuildAntenna();
      dirty.antenna = false;
      dirty.coverage = true;
      worked = true;
    }
    if (dirty.coverage && (force || now() - lastCoverageMs >= throttleMs)) {
      site = currentSite();
      reports.recomputeCoverage(site);
      dirty.coverage = false;
      worked = true;
    }
    return worked;
  }

  const loop = createFrameLoop({
    autoStart: options.autoStart ?? true,
    onFrame: () => {
      pump(false);
      applyVisibility();
      viewport.render();
      loop.noteRender();
      bus.emit(EVENTS.FRAME, loop.stats());
    },
  });

  function markDirty(stages) {
    if (stages.includes(RECOMPUTE.TERRAIN)) {
      dirty.terrain = true;
      dirty.antenna = true;
      dirty.coverage = true;
    }
    if (stages.includes(RECOMPUTE.ANTENNA)) {
      dirty.antenna = true;
      dirty.coverage = true;
    }
    if (stages.includes(RECOMPUTE.COVERAGE)) dirty.coverage = true;
  }

  /**
   * Validate + apply a patch, then mark what must be recomputed.
   * @returns {{state:object, changed:string[], clamped:Array, rejected:Array, stages:string[]}}
   */
  function patch(next) {
    const result = applyPatch(state, next);
    state = result.state;
    const stages = impactedStages(result.changed);
    markDirty(stages);
    bus.emit(EVENTS.STATE_CHANGED, {
      state,
      changed: result.changed,
      clamped: result.clamped,
      rejected: result.rejected,
      stages,
    });
    return { ...result, stages };
  }

  /** Run every pending rebuild now, then paint: the state tests assert against. */
  function settle(frames = 1) {
    let guard = 0;
    while (pump(true) && guard < 8) guard += 1;
    applyVisibility();
    viewport.resize();
    viewport.render();
    if (frames > 1) loop.step(frames - 1);
    return loop.stats();
  }

  const action = createActions({
    getState: () => state,
    setState: (next) => { state = next; },
    patch,
    settle,
    markAllDirty: () => {
      dirty.terrain = true;
      dirty.antenna = true;
      dirty.coverage = true;
    },
    resetCamera: (center) => viewport.resetCamera(center),
    getSite: () => site,
    savePng,
    bus,
  });

  /** Paint and hand back a PNG data URL (works thanks to preserveDrawingBuffer). */
  function savePng() {
    settle();
    const dataUrl = options.canvas.toDataURL('image/png');
    if (typeof document !== 'undefined') {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `antenna-sim-${state.designId}-${Date.now()}.png`;
      link.click();
    }
    return { ok: true, dataUrl };
  }

  if (typeof globalThis.ResizeObserver === 'function' && options.canvas) {
    const observer = new globalThis.ResizeObserver(() => viewport.resize());
    observer.observe(options.canvas);
    bus.on('dispose', () => observer.disconnect());
  }

  settle();

  return {
    bus,
    viewport,
    state: () => state,
    patch,
    action,
    settle,
    resize: () => viewport.resize(),
    savePng,
    start: loop.start,
    stop: loop.stop,
    step: loop.step,
    stats: loop.stats,
    sceneInfo: reports.sceneInfo,
    model: () => model,
    coverage: reports.coverage,
    coverageStats: reports.coverageStats,
    antennaSummary: reports.antennaSummary,
    rf: reports.rf,
    cameraState: () => viewport.cameraState(),
    setCamera: (next) => viewport.setCamera(next),
    grabSite: () => relocator.beginAtSite(),
    dragSiteTo: (ndcX, ndcY) => relocator.dragToNdc(ndcX, ndcY),
    releaseSite: () => relocator.release(),
    dragState: () => relocator.state(),
    terrainField: () => field,
    site: () => site,
    dispose() {
      bus.emit('dispose');
      loop.stop();
      orbit.dispose();
      relocator.dispose();
      rig.dispose();
      fresnel.dispose();
      mapObjects.dispose();
      viewport.dispose();
    },
  };
}
