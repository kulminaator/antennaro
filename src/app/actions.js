/**
 * The action channel: button and `window.__sim.action()` requests.
 *
 * Layer: L5 (composition). Buttons do not mutate state; they ask for an action, and
 * this turns the request into the same validated `patch()` + `settle()` path a slider
 * uses, so there is exactly one way anything reaches the model. Everything it needs is
 * handed in, so the controller keeps ownership of state, camera and meshes.
 *
 * No DOM here either: painting a PNG is the controller's job (`savePng` is injected),
 * because only it can reach the canvas.
 */

import { ANTENNA } from '../config.js';
import { EVENTS, createEventBus } from '../core/eventbus.js';
import { createInitialState, RECOMPUTE } from './state.js';
import { getPreset } from './presets.js';

/**
 * @param {{
 *   getState: () => object,
 *   setState: (state: object) => void,
 *   patch: (next: object) => object,
 *   settle: (frames?: number) => void,
 *   markAllDirty: () => void,
 *   resetCamera: (center?: object) => void,
 *   getSite: () => object,
 *   savePng: () => object,
 *   bus?: object,
 * }} deps
 * @returns {(request: {type: string, value?: *}) => object}
 */
export function createActions(deps) {
  const {
    getState, setState, patch, settle, markAllDirty, resetCamera, getSite, savePng,
  } = deps;
  const bus = deps.bus ?? createEventBus();

  return function action(request) {
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
        return { ok: true, site: getState().site };
      case 'reset-view': {
        const site = getSite();
        resetCamera({ x: site.x, y: site.groundY, z: site.z });
        return { ok: true };
      }
      case 'save-png':
        return savePng();
      case 'reset-all':
        setState(createInitialState({}));
        markAllDirty();
        resetCamera();
        settle();
        bus.emit(EVENTS.STATE_CHANGED, {
          state: getState(), changed: ['*'], clamped: [], rejected: [], stages: [RECOMPUTE.TERRAIN],
        });
        return { ok: true };
      default:
        return { ok: false, reason: `unknown action ${type}` };
    }
  };
}
