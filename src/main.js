/**
 * Composition root.
 *
 * Layer: L5 (composition). The only module that knows the DOM ids, the only
 * place that decides which adapter implements which role, and the only place
 * that touches `window`. Everything imported from here is already testable
 * without a browser; this file just wires those pieces together.
 *
 * URL parameters (all optional, meant for testing and shareable links):
 *   ?design=yagi&seed=1234&azimuth=90&tilt=-4&height=12&siteX=400&preset=valley-reach
 *   &view=bands|gradient|zone   how the coverage is painted
 *   &fresnel=1       the Fresnel-zone volume on, and the coverage view set to `zone`
 *   &manual=1        do not auto-start the animation loop (headless tests)
 *   &nohud=1         do not create the read-out panel
 */

import { APP } from './config.js';
import { EVENTS, createEventBus } from './core/eventbus.js';
import { createController } from './app/controller.js';
import { installTestApi } from './app/testapi.js';
import { getPreset } from './app/presets.js';
import { createInitialStateWithReport } from './app/state.js';
import { createControls } from './ui/controls.js';
import { createAbout } from './ui/about.js';
import { createHud } from './ui/hud.js';

const HUD_REFRESH_MS = 400;

function readInitialState(params) {
  const initialState = {};
  if (params.get('design')) initialState.designId = String(params.get('design'));
  if (params.get('seed')) initialState.seed = Number(params.get('seed'));
  if (params.get('height')) initialState.heightM = Number(params.get('height'));
  if (params.get('siteX') || params.get('siteZ')) {
    initialState.site = {
      x: Number(params.get('siteX') ?? 0),
      z: Number(params.get('siteZ') ?? 0),
    };
  }
  if (params.get('azimuth') || params.get('tilt')) {
    initialState.aim = {
      azimuthDeg: Number(params.get('azimuth') ?? 0),
      tiltDeg: Number(params.get('tilt') ?? 0),
    };
  }
  if (params.get('frequency')) initialState.frequencyKey = String(params.get('frequency'));
  if (params.get('sensitivity')) initialState.rxSensitivityDbm = Number(params.get('sensitivity'));
  if (params.get('range')) initialState.maxRangeM = Number(params.get('range'));
  // Display switches merge into the defaults instead of replacing them: an earlier
  // version wrote `initialState.display = { showFresnel: true }`, which silently switched
  // the coverage overlay, the pattern and the labels off as well.
  const display = { ...initialState.display };
  if (params.get('view')) display.coverageView = String(params.get('view'));
  if (params.has('fresnel')) {
    const on = params.get('fresnel') !== '0';
    display.showFresnel = on;
    // `?fresnel=1` used to be the only way to reach the zone colours, so it still takes
    // you there; the volume and the view are separate switches now.
    if (on) display.coverageView = 'zone';
  }
  initialState.display = display;
  return initialState;
}

function boot() {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const errors = globalThis.__simErrors ?? [];
  const canvas = document.getElementById('scene');
  if (!canvas) throw new Error('canvas #scene is missing from the page');

  const bus = createEventBus();
  const startup = createInitialStateWithReport(readInitialState(params));
  const controller = createController({
    canvas,
    initialState: startup.state,
    bus,
    autoStart: !params.has('manual'),
  });

  const hud = params.has('nohud')
    ? { update: () => {} }
    : createHud({ root: document.getElementById('hud') });

  // The About dialog is the panel's footer: the button lives in the panel, the dialog is
  // its own element, and neither is app state.
  const about = createAbout({ mount: document.body });
  const controls = createControls({
    root: document.getElementById('panel'),
    getState: controller.state,
    onPatch: (patch) => controller.patch(patch),
    onAction: (request) => controller.action(request),
    footerNodes: [about.trigger],
  });
  globalThis.__simControls = controls;
  globalThis.__simAbout = about;

  function refreshHud() {
    const info = controller.viewport.info();
    const stats = controller.stats();
    hud.update({
      state: controller.state(),
      antenna: controller.antennaSummary(),
      coverage: controller.coverage(),
      rf: controller.rf(),
      view: {
        fps: stats.fps,
        calls: info.calls,
        triangles: info.triangles,
        ...controller.cameraState(),
      },
    });
  }

  bus.on(EVENTS.COVERAGE_READY, refreshHud);
  bus.on(EVENTS.STATE_CHANGED, () => {
    controls.render();
    refreshHud();
  });

  let lastRefresh = 0;
  bus.on(EVENTS.FRAME, (stats) => {
    const now = stats.elapsedMs ?? performance.now();
    if (now - lastRefresh >= HUD_REFRESH_MS) {
      lastRefresh = now;
      refreshHud();
    }
  });

  const presetParam = params.get('preset');
  if (presetParam) controller.action({ type: 'apply-preset', value: presetParam });

  globalThis.addEventListener('keydown', (event) => {
    if (event.target instanceof globalThis.HTMLInputElement) return;
    if (event.key === 'h' || event.key === 'H') globalThis.document.body.classList.toggle('ui-hidden');
  });

  controller.settle();
  refreshHud();

  const api = installTestApi({ controller, errors, version: APP.version });
  api.ready = true;
  // What the URL asked for that the model refused or trimmed, so a limited picture can
  // always be traced back to the request that asked for it.
  const overrides = {
    clamped: startup.clamped.map((entry) => ({ ...entry })),
    rejected: startup.rejected.map((entry) => ({ ...entry })),
  };
  api.boot = { ...globalThis.__simBoot, status: 'ready', version: APP.version, overrides };
  globalThis.__simBoot = { ...globalThis.__simBoot, status: 'ready', version: APP.version, overrides, at: Date.now() };
  globalThis.addEventListener('beforeunload', () => {
    about.dispose();
    controller.dispose();
  });
}

try {
  boot();
} catch (error) {
  const message = error && error.message ? error.message : String(error);
  globalThis.__simBoot = { status: 'error', message, at: Date.now() };
  const banner = document.getElementById('boot-error');
  if (banner) {
    banner.hidden = false;
    banner.textContent = `Startup failed: ${message}`;
  }
  throw error;
}
