/**
 * State field registry: the declarative description of everything the user can
 * control, plus the immutable path helpers the reducer is built on.
 *
 * Layer: L1 (pure data). Kept separate from the reducer (app/state.js) so that
 * the UI schema, the physics limits and the change-impact map all read from one
 * table that contains no logic beyond range clamping metadata.
 */

import { ANTENNA, RF, WORLD } from '../config.js';

/** Which pipeline stages a change to each key invalidates. */
export const RECOMPUTE = Object.freeze({
  TERRAIN: 'terrain',
  ANTENNA: 'antenna',
  COVERAGE: 'coverage',
  DISPLAY: 'display',
});

/** @typedef {{key:string, path:string[], label:string, kind:'range'|'int'|'toggle'|'select', min?:number, max?:number, step?:number, unit?:string, hint?:string, group:string, impact:string[]}} StateField */

/** Ranges that both the UI controls and the reducer read. */
export const STATE_FIELDS = Object.freeze([
  Object.freeze({
    key: 'heightM', path: ['heightM'], label: 'Antenna height', kind: 'range',
    min: ANTENNA.heightLimitsM.min, max: ANTENNA.heightLimitsM.max, step: 0.5, unit: 'm',
    group: 'Placement', impact: [RECOMPUTE.ANTENNA, RECOMPUTE.COVERAGE],
    hint: 'Height of the phase centre above the ground at the site.',
  }),
  Object.freeze({
    key: 'site.x', path: ['site', 'x'], label: 'Site east offset', kind: 'range',
    min: ANTENNA.siteLimitsM.min, max: ANTENNA.siteLimitsM.max, step: ANTENNA.siteStepM, unit: 'm',
    group: 'Placement', impact: [RECOMPUTE.TERRAIN, RECOMPUTE.COVERAGE],
    hint: 'Move the pad and the mast east (+X); negative is west. The flat pad and the coverage move with it.',
  }),
  Object.freeze({
    key: 'site.z', path: ['site', 'z'], label: 'Site south offset', kind: 'range',
    min: ANTENNA.siteLimitsM.min, max: ANTENNA.siteLimitsM.max, step: ANTENNA.siteStepM, unit: 'm',
    group: 'Placement', impact: [RECOMPUTE.TERRAIN, RECOMPUTE.COVERAGE],
    hint: 'Move the pad and the mast south (+Z); negative is north, towards the mountain.',
  }),
  Object.freeze({
    key: 'aim.azimuthDeg', path: ['aim', 'azimuthDeg'], label: 'Azimuth', kind: 'range',
    min: ANTENNA.azimuthLimitsDeg.min, max: ANTENNA.azimuthLimitsDeg.max, step: 1, unit: 'deg',
    group: 'Placement', impact: [RECOMPUTE.ANTENNA, RECOMPUTE.COVERAGE],
    hint: 'Compass bearing of the boresight. 0 = north (mountain side).',
  }),
  Object.freeze({
    key: 'aim.tiltDeg', path: ['aim', 'tiltDeg'], label: 'Mechanical tilt', kind: 'range',
    min: ANTENNA.tiltLimitsDeg.min, max: ANTENNA.tiltLimitsDeg.max, step: 1, unit: 'deg',
    group: 'Placement', impact: [RECOMPUTE.ANTENNA, RECOMPUTE.COVERAGE],
    hint: 'Up is positive, down (downtilt) is negative.',
  }),
  Object.freeze({
    key: 'frequencyKey', path: ['frequencyKey'], label: 'Band', kind: 'select',
    group: 'Radio', impact: [RECOMPUTE.ANTENNA, RECOMPUTE.COVERAGE],
    options: Object.freeze(Object.keys(RF.frequenciesHz).map((k) => ({ value: k, label: `${k} MHz` }))),
  }),
  Object.freeze({
    key: 'txPowerDbm', path: ['txPowerDbm'], label: 'Transmitter power', kind: 'range',
    min: -10, max: 43, step: 1, unit: 'dBm', group: 'Radio', impact: [RECOMPUTE.COVERAGE],
  }),
  Object.freeze({
    key: 'feederLossDb', path: ['feederLossDb'], label: 'Feeder loss', kind: 'range',
    min: 0, max: 10, step: 0.5, unit: 'dB', group: 'Radio', impact: [RECOMPUTE.COVERAGE],
    hint: 'Coax and connector loss between the radio and the antenna.',
  }),
  Object.freeze({
    key: 'rxSensitivityDbm', path: ['rxSensitivityDbm'], label: 'Receiver sensitivity', kind: 'range',
    min: -124, max: -70, step: 1, unit: 'dBm', group: 'Radio', impact: [RECOMPUTE.COVERAGE],
    hint: 'The coverage ramp and "linked" counts are measured against this level.',
  }),
  Object.freeze({
    key: 'maxRangeM', path: ['maxRangeM'], label: 'Evaluation range', kind: 'range',
    min: RF.maxRangeLimitsM.min, max: RF.maxRangeLimitsM.max, step: 50, unit: 'm',
    group: 'Radio', impact: [RECOMPUTE.COVERAGE],
  }),
  Object.freeze({
    key: 'clutterLossDb', path: ['clutterLossDb'], label: 'Clutter loss', kind: 'range',
    min: 0, max: 25, step: 1, unit: 'dB', group: 'Radio', impact: [RECOMPUTE.COVERAGE],
    hint: 'Flat allowance for trees, crops and buildings (none of which are drawn).',
  }),
  Object.freeze({
    key: 'useDiffraction', path: ['useDiffraction'], label: 'Terrain shadowing', kind: 'toggle',
    group: 'Radio', impact: [RECOMPUTE.COVERAGE],
    hint: 'Off = pure free space, on = knife-edge diffraction over the terrain.',
  }),
  Object.freeze({
    key: 'seed', path: ['seed'], label: 'Terrain seed', kind: 'int',
    min: 1, max: 999999, step: 1, group: 'Terrain', impact: [RECOMPUTE.TERRAIN, RECOMPUTE.COVERAGE],
  }),
  Object.freeze({
    key: 'display.showCoverage', path: ['display', 'showCoverage'], label: 'Coverage overlay', kind: 'toggle',
    group: 'Display', impact: [RECOMPUTE.DISPLAY],
  }),
  Object.freeze({
    key: 'display.showPattern', path: ['display', 'showPattern'], label: 'Radiation pattern', kind: 'toggle',
    group: 'Display', impact: [RECOMPUTE.DISPLAY],
  }),
  Object.freeze({
    key: 'display.showWireframe', path: ['display', 'showWireframe'], label: 'Terrain mesh', kind: 'toggle',
    group: 'Display', impact: [RECOMPUTE.DISPLAY],
  }),
  Object.freeze({
    key: 'display.showSectors', path: ['display', 'showSectors'], label: 'Zone labels', kind: 'toggle',
    group: 'Display', impact: [RECOMPUTE.DISPLAY],
  }),
]);

export const STATE_FIELD_BY_KEY = Object.freeze(
  STATE_FIELDS.reduce((acc, field) => {
    acc[field.key] = field;
    return acc;
  }, {}),
);


/** Read `state` at a path given as an array of keys. Returns undefined if absent. */
export function getPath(state, path) {
  let node = state;
  for (const key of path) {
    if (node === undefined || node === null) return undefined;
    node = node[key];
  }
  return node;
}

/** Return a copy of `state` with `path` replaced by `value` (never mutates). */
export function withPath(state, path, value) {
  if (path.length === 0) return state;
  const [head, ...rest] = path;
  if (rest.length === 0) return { ...state, [head]: value };
  return { ...state, [head]: withPath(state?.[head] ?? {}, rest, value) };
}
