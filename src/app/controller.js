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

import { ANTENNA, VIEW } from '../config.js';
import { EVENTS, createEventBus } from '../core/eventbus.js';
import { createFrameLoop } from '../core/loop.js';
import { createAntennaModel } from '../antenna/model.js';
import { createAntennaRig } from '../antenna/rigmesh.js';
import { generateTerrain } from '../terrain/generators.js';
import { resolveSite } from '../terrain/site.js';
import { createMapObjects } from './mapmesh.js';
import { computeCoverage } from '../propagation/coverage.js';
import { resolveFrequencyHz, rfSummary, wavelengthM } from '../propagation/rf.js';
import { applyPatch, createInitialState, impactedStages, RECOMPUTE } from './state.js';
import { getPreset } from './presets.js';
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

  /** @type {import('../antenna/model.js').AntennaModel|null} */
  let model = null;
  /** @type {ReturnType<typeof computeCoverage>|null} */
  let coverage = null;
  let site = currentSite();

  const dirty = { terrain: true, antenna: true, coverage: true };
  let lastCoverageMs = 0;

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

  function recomputeCoverage() {
    if (!model) return;
    site = currentSite();
    coverage = computeCoverage({
      field,
      site,
      model,
      freqHz: resolveFrequencyHz(state.frequencyKey),
      txPowerDbm: state.txPowerDbm,
      feederLossDb: state.feederLossDb,
      rxSensitivityDbm: state.rxSensitivityDbm,
      maxRangeM: state.maxRangeM,
      clutterLossDb: state.clutterLossDb,
      useDiffraction: state.useDiffraction,
    });
    mapObjects.overlay.update(field, coverage);
    lastCoverageMs = now();
    bus.emit(EVENTS.COVERAGE_READY, coverage);
  }

  function applyVisibility() {
    mapObjects.overlay.mesh.visible = state.display.showCoverage;
    rig.setPatternVisible(state.display.showPattern);
    mapObjects.terrain.setWireframe(state.display.showWireframe);
    mapObjects.labels.group.visible = state.display.showSectors;
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
      recomputeCoverage();
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

  function action(request) {
    const { type, value } = request ?? {};
    switch (type) {
      case 'apply-preset': {
        const preset = getPreset(String(value));
        if (!preset) return { ok: false, reason: `unknown preset ${value}` };
        const result = patch(preset.patch);
        settle();
        return { ok: true, preset: preset.id, ...result };
      }
      case 'new-seed': {
        // The only unseeded randomness in the app: a deliberate, user-initiated
        // dice roll. Everything downstream stays seeded and reproducible.
        const seed = 1 + Math.floor(Math.random() * 999998);
        patch({ seed });
        settle();
        return { ok: true, seed };
      }
      case 'reset-site':
        patch({ site: { x: ANTENNA.defaultSiteXm, z: ANTENNA.defaultSiteZm } });
        settle();
        return { ok: true, site: state.site };
      case 'reset-view':
        viewport.resetCamera({ x: site.x, y: site.groundY, z: site.z });
        return { ok: true };
      case 'save-png':
        return savePng();
      case 'reset-all':
        state = createInitialState({});
        dirty.terrain = true;
        dirty.antenna = true;
        dirty.coverage = true;
        viewport.resetCamera();
        settle();
        bus.emit(EVENTS.STATE_CHANGED, { state, changed: ['*'], clamped: [], rejected: [], stages: [RECOMPUTE.TERRAIN] });
        return { ok: true };
      default:
        return { ok: false, reason: `unknown action ${type}` };
    }
  }

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

  function sceneInfo() {
    const rigInfo = rig.info();
    return {
      ...viewport.info(),
      terrainVertices: mapObjects.terrain.surface.geometry.attributes.position.count,
      terrainGrid: field.size,
      sitePosition: [site.x, site.z],
      terrainStats: field.stats(),
      antennaParts: rigInfo.parts,
      antennaVisualScale: rigInfo.visualScale,
      antennaY: rigInfo.bodyY,
      mastHeightM: rigInfo.mastHeightM,
      patternVisible: rigInfo.patternVisible,
      coverageVisible: mapObjects.overlay.mesh.visible,
      labelsVisible: mapObjects.labels.group.visible,
      camera: viewport.cameraState(),
    };
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
    sceneInfo,
    model: () => model,
    coverage: () => coverage,
    coverageStats: () => (coverage ? coverage.stats : null),
    antennaSummary: () => (model ? model.summary() : null),
    rf: () => rfSummary({
      txPowerDbm: state.txPowerDbm,
      peakGainDbi: model ? model.peakGainDbi : 0,
      feederLossDb: state.feederLossDb,
      rxSensitivityDbm: state.rxSensitivityDbm,
      freqHz: resolveFrequencyHz(state.frequencyKey),
    }),
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
      mapObjects.dispose();
      viewport.dispose();
    },
  };
}
