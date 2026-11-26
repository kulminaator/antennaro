/**
 * Application state: the single declarative description of everything the user
 * can control, plus a pure reducer that validates patches.
 *
 * Layer: L2 (domain service, pure). The UI never mutates state and the renderer
 * never reads it directly: UI dispatches patches, the controller consumes the
 * new state and decides what must be recomputed.
 *
 * `STATE_FIELDS` is the ONE source of truth for names, units and ranges: the
 * control panel and the validator both derive from it, so a slider can never
 * disagree with the physics limit.
 */

import { ANTENNA, RF, TERRAIN, WORLD } from '../config.js';
import { createDefaultAim, createDefaultParams, getAntennaEntry, isKnownAntennaId } from '../antenna/catalogue.js';
import { clamp, wrapDeg360 } from '../math/scalar.js';
import { RECOMPUTE, STATE_FIELDS, STATE_FIELD_BY_KEY, getPath, withPath } from './fields.js';

/** Keys that are not user-facing sliders but still live in state. */
const STRUCTURAL_KEYS = Object.freeze(['designId', 'params', 'aim', 'display', 'site']);

/**
 * Build the initial state. Antenna-specific fields come from the catalogue so a
 * new design cannot forget a default.
 * @param {Partial<ReturnType<typeof baseState>>} [overrides]
 */
export function createInitialState(overrides = {}) {
  return createInitialStateWithReport(overrides).state;
}

/**
 * Same, but keeps the reducer's verdict on the requested values.
 *
 * A shared link or a test harness can ask for something outside the model - `?range=9000`
 * on a map we only sweep to 3800 m. Silently answering with the clamped number would let
 * a screenshot look like physics when it is a limit of ours, so the boot record says what
 * was asked for and what was applied.
 *
 * @returns {{state:Record<string,unknown>, clamped:Array, rejected:Array}}
 */
export function createInitialStateWithReport(overrides = {}) {
  const result = applyPatch(baseState(ANTENNA.defaultDesignId), overrides);
  return { state: result.state, clamped: result.clamped, rejected: result.rejected };
}

function baseState(designId) {
  const entry = getAntennaEntry(designId);
  if (!entry) throw new RangeError(`unknown antenna design: ${designId}`);
  return {
    designId,
    params: createDefaultParams(designId),
    aim: { ...createDefaultAim(designId) },
    heightM: ANTENNA.defaultHeightM,
    site: { x: ANTENNA.defaultSiteXm, z: ANTENNA.defaultSiteZm },
    frequencyKey: RF.defaultFrequencyKey,
    txPowerDbm: RF.defaultTxPowerDbm,
    feederLossDb: 1.5,
    rxSensitivityDbm: RF.defaultRxSensitivityDbm,
    zoneRxHeightM: RF.fresnelRxHeightM,
    maxRangeM: RF.defaultMaxRangeM,
    clutterLossDb: RF.clutterLossDb,
    useDiffraction: true,
    seed: TERRAIN.seed,
    worldSize: WORLD.worldSize,
    gridSize: WORLD.gridSize,
    display: {
      showCoverage: true,
      showPattern: true,
      /** `'bands' | 'gradient' | 'zone'` - see `RF.defaultCoverageView`. */
      coverageView: RF.defaultCoverageView,
      showFresnel: false,
      showWireframe: false,
      showSectors: true,
    },
  };
}

/** Accept numbers and numeric strings only: null, booleans and '' are junk, not 0. */
function toNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }
  return undefined;
}

function coerce(field, raw) {
  if (field.kind === 'toggle') return Boolean(raw);
  if (field.kind === 'select') {
    const match = (field.options ?? []).find((option) => option.value === String(raw));
    return match ? match.value : undefined;
  }
  const value = toNumber(raw);
  if (value === undefined) return undefined;
  const clamped = clamp(value, field.min, field.max);
  if (field.kind === 'int') return Math.round(clamped);
  const step = field.step || 1;
  return Number((Math.round(clamped / step) * step).toFixed(6));
}

/**
 * Apply a patch.
 * Unknown keys are rejected, out-of-range numbers are clamped, and both are
 * reported so the UI (and tests) can see what happened.
 * @param {ReturnType<typeof baseState>} state
 * @param {Record<string, unknown>|null} patch flat map of dotted keys, e.g. {'aim.tiltDeg': -5}
 * @returns {{state:object, changed:string[], clamped:Array<{key:string,from:number,to:number}>, rejected:Array<{key:string,reason:string}>}}
 */
export function applyPatch(state, patch) {
  const changed = [];
  const clamped = [];
  const rejected = [];
  if (!patch || typeof patch !== 'object') return { ok: false, state, changed, clamped, rejected };

  let next = state;

  for (const [key, rawValue] of Object.entries(patch)) {
    const field = STATE_FIELD_BY_KEY[key];
    if (field) {
      const value = coerce(field, rawValue);
      if (value === undefined) {
        rejected.push({ key, reason: 'invalid value' });
        continue;
      }
      if ((field.kind === 'range' || field.kind === 'int') && Number.isFinite(Number(rawValue))) {
        const numeric = Number(rawValue);
        if (numeric !== value && (numeric < field.min || numeric > field.max)) {
          clamped.push({ key, from: numeric, to: value });
        }
      }
      if (getPath(next, field.path) !== value) {
        next = withPath(next, field.path, value);
        changed.push(key);
      }
      continue;
    }

    if (key === 'designId') {
      if (!isKnownAntennaId(String(rawValue))) {
        rejected.push({ key, reason: 'unknown antenna design' });
        continue;
      }
      const id = String(rawValue);
      if (next.designId !== id) {
        // Swapping design resets design-specific parameters and the electrical
        // downtilt, but keeps where the user pointed the antenna.
        next = {
          ...next,
          designId: id,
          params: createDefaultParams(id),
          aim: { ...next.aim, beamTiltDeg: createDefaultAim(id).beamTiltDeg },
        };
        changed.push('designId', 'params', 'aim');
      }
      continue;
    }

    if (key === 'params') {
      if (!rawValue || typeof rawValue !== 'object') {
        rejected.push({ key, reason: 'params must be an object' });
        continue;
      }
      const entry = getAntennaEntry(next.designId);
      const merged = { ...next.params };
      for (const spec of entry.paramSpecs) {
        if (rawValue[spec.key] === undefined) continue;
        const coerced = coerce({ kind: spec.step >= 1 ? 'int' : 'range', min: spec.min, max: spec.max, step: spec.step }, rawValue[spec.key]);
        if (coerced === undefined) {
          rejected.push({ key: `params.${spec.key}`, reason: 'invalid value' });
        } else if (merged[spec.key] !== coerced) {
          merged[spec.key] = coerced;
        }
      }
      for (const keyName of Object.keys(rawValue)) {
        if (!entry.paramSpecs.some((spec) => spec.key === keyName)) {
          rejected.push({ key: `params.${keyName}`, reason: 'not a parameter of this design' });
        }
      }
      if (JSON.stringify(merged) !== JSON.stringify(next.params)) {
        next = { ...next, params: merged };
        changed.push('params');
      }
      continue;
    }

    if (key === 'aim') {
      if (!rawValue || typeof rawValue !== 'object') {
        rejected.push({ key, reason: 'aim must be an object' });
        continue;
      }
      const sub = {};
      if (rawValue.azimuthDeg !== undefined) sub['aim.azimuthDeg'] = wrapDeg360(rawValue.azimuthDeg);
      if (rawValue.tiltDeg !== undefined) sub['aim.tiltDeg'] = rawValue.tiltDeg;
      const nested = applyPatch(next, sub);
      next = nested.state;
      changed.push(...nested.changed);
      rejected.push(...nested.rejected);
      clamped.push(...nested.clamped);
      if (rawValue.beamTiltDeg !== undefined) {
        // Electrical downtilt belongs to the design, not to the generic aim limits.
        const spec = getAntennaEntry(next.designId).paramSpecs.find((s) => s.key === 'beamTiltDeg');
        if (!spec) {
          rejected.push({ key: 'aim.beamTiltDeg', reason: 'design has no electrical beam tilt' });
        } else {
          const wanted = toNumber(rawValue.beamTiltDeg);
          if (wanted === undefined) {
            rejected.push({ key: 'aim.beamTiltDeg', reason: 'invalid value' });
          } else {
            const value = clamp(Math.round(wanted), spec.min, spec.max);
            if (next.aim.beamTiltDeg !== value) {
              next = { ...next, aim: { ...next.aim, beamTiltDeg: value } };
              changed.push('aim');
            }
          }
        }
      }
      if (nested.changed.length > 0) changed.push('aim');
      continue;
    }

    if (key === 'display') {
      if (!rawValue || typeof rawValue !== 'object') {
        rejected.push({ key, reason: 'display must be an object' });
        continue;
      }
      const displayPatch = {};
      for (const [name, value] of Object.entries(rawValue)) displayPatch[`display.${name}`] = value;
      const nested = applyPatch(next, displayPatch);
      next = nested.state;
      changed.push(...nested.changed);
      rejected.push(...nested.rejected);
      clamped.push(...nested.clamped);
      continue;
    }

    if (key === 'site') {
      if (!rawValue || typeof rawValue !== 'object') {
        rejected.push({ key, reason: 'site must be an object' });
        continue;
      }
      const sitePatch = {};
      for (const [name, value] of Object.entries(rawValue)) sitePatch[`site.${name}`] = value;
      const nested = applyPatch(next, sitePatch);
      next = nested.state;
      changed.push(...nested.changed);
      rejected.push(...nested.rejected);
      clamped.push(...nested.clamped);
      continue;
    }

    if (key === 'worldSize' || key === 'gridSize') {
      const limits = key === 'worldSize'
        ? { min: WORLD.minWorldSize, max: WORLD.maxWorldSize }
        : { min: WORLD.minGridSize, max: WORLD.maxGridSize };
      const value = toNumber(rawValue);
      if (value === undefined) {
        rejected.push({ key, reason: 'must be a number' });
        continue;
      }
      const clampedValue = clamp(Math.round(value), limits.min, key === 'gridSize' ? makeOdd(limits.max) : limits.max);
      const finalValue = key === 'gridSize' ? makeOdd(clampedValue) : clampedValue;
      if (next[key] !== finalValue) {
        next = { ...next, [key]: finalValue };
        changed.push(key);
      }
      continue;
    }

    if (!STRUCTURAL_KEYS.includes(key)) rejected.push({ key, reason: 'unknown state key' });
    else rejected.push({ key, reason: 'set this through aim/params/display or designId' });
  }

  return {
    ok: rejected.length === 0,
    state: next,
    changed: Array.from(new Set(changed)),
    clamped,
    rejected,
  };
}

function makeOdd(value) {
  return value % 2 === 0 ? value - 1 : value;
}

const IMPACT_BY_KEY = STATE_FIELDS.reduce((acc, field) => {
  acc[field.key] = field.impact;
  return acc;
}, {});

/**
 * Which pipeline stages a patch invalidates. `coverage` implies the antenna
 * model must also be rebuilt, so the controller can trust this single call.
 * @returns {string[]} subset of RECOMPUTE values
 */
export function impactedStages(changedKeys) {
  const stages = new Set();
  for (const key of changedKeys) {
    if (key === 'designId' || key === 'params' || key === 'aim') {
      stages.add(RECOMPUTE.ANTENNA);
      stages.add(RECOMPUTE.COVERAGE);
      continue;
    }
    if (key === 'worldSize' || key === 'gridSize') {
      stages.add(RECOMPUTE.TERRAIN);
      stages.add(RECOMPUTE.COVERAGE);
      continue;
    }
    for (const stage of IMPACT_BY_KEY[key] ?? []) stages.add(stage);
    if (key === 'heightM' || key === 'frequencyKey') {
      stages.add(RECOMPUTE.ANTENNA);
      stages.add(RECOMPUTE.COVERAGE);
    }
  }
  if (stages.has(RECOMPUTE.TERRAIN) || stages.has(RECOMPUTE.ANTENNA)) stages.add(RECOMPUTE.COVERAGE);
  return Array.from(stages);
}

/** Flat diff of two states, useful for logging, tests and change debugging. */
export function diffStates(before, after) {
  const out = [];
  const walk = (a, b, prefix) => {
    for (const key of Object.keys(b)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const nextValue = b[key];
      if (nextValue && typeof nextValue === 'object' && !Array.isArray(nextValue)) {
        walk(a?.[key] ?? {}, nextValue, path);
      } else if (a?.[key] !== nextValue) {
        out.push({ path, from: a?.[key], to: nextValue });
      }
    }
  };
  walk(before, after, '');
  return out;
}

/** Re-exports so callers can import the reducer and its vocabulary together. */
export { RECOMPUTE, STATE_FIELDS, STATE_FIELD_BY_KEY, getPath, withPath };
