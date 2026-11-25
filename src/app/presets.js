/**
 * Ready-made scenarios.
 *
 * Layer: L2 (domain data, pure). Each preset is a plain state patch; the UI just
 * offers them as a dropdown and the reducer applies them like any other change.
 * They exist so a first-time user sees an interesting terrain/antenna story in
 * one click instead of having to discover the sliders first.
 */

import { ANTENNA_IDS } from '../antenna/catalogue.js';

/**
 * @typedef {{id:string, label:string, description:string, patch:Record<string,unknown>}} Preset
 */

/** @type {Preset[]} */
export const PRESETS = Object.freeze([
  Object.freeze({
    id: 'site-sector',
    label: 'Sector around the site',
    description: 'Panel with electrical downtilt covering the flattened area around the mast.',
    patch: Object.freeze({
      designId: 'patch',
      params: Object.freeze({ sizeLambda: 1.1, beamTiltDeg: 8 }),
      aim: Object.freeze({ azimuthDeg: 135, tiltDeg: 0 }),
      heightM: 18,
      maxRangeM: 900,
      rxSensitivityDbm: -85,
    }),
  }),
  Object.freeze({
    id: 'valley-reach',
    label: 'Reach down the valley',
    description: 'Long Yagi aimed south, tilted down into the valley floor.',
    patch: Object.freeze({
      designId: 'yagi',
      params: Object.freeze({ directors: 10, spacingLambda: 0.28, beamTiltDeg: 0 }),
      aim: Object.freeze({ azimuthDeg: 180, tiltDeg: -6 }),
      heightM: 24,
      maxRangeM: 1600,
      rxSensitivityDbm: -95,
    }),
  }),
  Object.freeze({
    id: 'flat-field',
    label: 'Down the flat field',
    description: 'Yagi east over the flat field: the range limit is the link budget, not the ground.',
    patch: Object.freeze({
      designId: 'yagi',
      params: Object.freeze({ directors: 5, spacingLambda: 0.32, beamTiltDeg: 0 }),
      aim: Object.freeze({ azimuthDeg: 90, tiltDeg: 0 }),
      heightM: 10,
      maxRangeM: 1800,
      rxSensitivityDbm: -100,
    }),
  }),
  Object.freeze({
    id: 'mountain-shadow',
    label: 'Mountain shadow',
    description: 'High omni looking north: shows the dead zone behind the ridge.',
    patch: Object.freeze({
      designId: 'omni-collinear',
      params: Object.freeze({ elements: 6, spacingLambda: 0.5 }),
      aim: Object.freeze({ azimuthDeg: 0, tiltDeg: 0 }),
      heightM: 32,
      maxRangeM: 2200,
      rxSensitivityDbm: -105,
    }),
  }),
  Object.freeze({
    id: 'bumps-hills',
    label: 'Over the bumps',
    description: 'Biquad west over the bumpy ground: gain helps, grazing rays do not.',
    patch: Object.freeze({
      designId: 'biquad-reflector',
      params: Object.freeze({ turns: 2, reflectorSpacingLambda: 0.25, beamTiltDeg: 0 }),
      aim: Object.freeze({ azimuthDeg: 270, tiltDeg: 2 }),
      heightM: 14,
      maxRangeM: 1200,
      rxSensitivityDbm: -90,
    }),
  }),
]);

export const PRESET_IDS = Object.freeze(PRESETS.map((preset) => preset.id));

/** @returns {Preset|undefined} */
export function getPreset(id) {
  return PRESETS.find((preset) => preset.id === id);
}

/** Guard used by tests: every preset must reference a real design and real ranges. */
export function validatePresets(applyPatchFn, baseState) {
  const problems = [];
  for (const preset of PRESETS) {
    if (!ANTENNA_IDS.includes(preset.patch.designId)) {
      problems.push(`${preset.id}: unknown designId ${preset.patch.designId}`);
    }
    const result = applyPatchFn(baseState, preset.patch);
    if (result.rejected.length > 0) {
      problems.push(`${preset.id}: rejected ${result.rejected.map((r) => r.key).join(', ')}`);
    }
    if (result.clamped.length > 0) {
      problems.push(`${preset.id}: clamped ${result.clamped.map((c) => c.key).join(', ')}`);
    }
  }
  return problems;
}
