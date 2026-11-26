/**
 * Ready-made scenarios.
 *
 * Layer: L2 (domain data, pure). Each preset is a plain state patch; the UI just
 * offers them as a dropdown and the reducer applies them like any other change.
 * They exist so a first-time user sees an interesting terrain/antenna story in
 * one click instead of having to discover the sliders first.
 *
 * A preset never touches `display`. A scenario is a bit of ground, an antenna and an aim;
 * which of the three coverage views you want to see it in is your business, not the
 * scenario's - and a preset that carried a view would silently overrule `?view=` and
 * `?fresnel=1`, which are applied to the boot state and then patched over by the preset.
 * `tests/unit/display.test.js` holds that line.
 *
 * Every scenario is tuned so that *its own link* is the last thing to give out:
 * the transmit power and receiver sensitivity are chosen so the free-space budget
 * dies inside the map, and the study range is left at the whole map unless the
 * scenario is about a deliberately small work area. A preset whose picture ended at
 * our evaluation cap would show the app, not the antenna - `tests/unit/state.test.js`
 * checks that no preset ends up `limitingFactor: 'study-range'` or `'map-edge'`.
 */

import { ANTENNA_IDS } from '../antenna/catalogue.js';
import { RF } from '../config.js';

/**
 * @typedef {{id:string, label:string, description:string, patch:Record<string,unknown>}} Preset
 */

/** @type {Preset[]} */
export const PRESETS = Object.freeze([
  Object.freeze({
    id: 'site-sector',
    label: 'Sector around the site',
    description: 'Panel with electrical downtilt: the lobe is pushed into the ground, so the '
      + 'served ring sits under the mast instead of reaching the horizon.',
    patch: Object.freeze({
      designId: 'patch',
      params: Object.freeze({ sizeLambda: 1.1, beamTiltDeg: 8 }),
      aim: Object.freeze({ azimuthDeg: 135, tiltDeg: 0 }),
      heightM: 18,
      maxRangeM: RF.defaultMaxRangeM,
      txPowerDbm: 10,
      rxSensitivityDbm: -85,
    }),
  }),
  Object.freeze({
    id: 'valley-reach',
    label: 'Reach down the valley',
    description: 'Long Yagi aimed south, tilted down into the valley floor. The beam dies in '
      + 'the middle of the map, not at its edge.',
    patch: Object.freeze({
      designId: 'yagi',
      params: Object.freeze({ directors: 10, spacingLambda: 0.28, beamTiltDeg: 0 }),
      aim: Object.freeze({ azimuthDeg: 180, tiltDeg: -6 }),
      heightM: 24,
      maxRangeM: RF.defaultMaxRangeM,
      txPowerDbm: 10,
      rxSensitivityDbm: -80,
    }),
  }),
  Object.freeze({
    id: 'flat-field',
    label: 'Down the flat field',
    description: 'Yagi east over the flat field: here the range limit is the link budget, not the ground.',
    patch: Object.freeze({
      designId: 'yagi',
      params: Object.freeze({ directors: 5, spacingLambda: 0.32, beamTiltDeg: 0 }),
      aim: Object.freeze({ azimuthDeg: 90, tiltDeg: 0 }),
      // High enough that the ray to the ground stays inside the first Fresnel zone, so the
      // last link really is the free-space budget: measured 1913 m against a 1913 m budget.
      heightM: 25,
      maxRangeM: RF.defaultMaxRangeM,
      txPowerDbm: 10,
      rxSensitivityDbm: -80,
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
      maxRangeM: RF.defaultMaxRangeM,
      txPowerDbm: 10,
      rxSensitivityDbm: -80,
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
      // The biquad's gain is now derived from its 69-degree beam (8.1 dBi, not the 12.4 it
      // used to claim), so at 25 m the bumps leave almost nothing lit. 32 m and a slightly
      // keener receiver give it 517 linked points - and the story is still the point: a
      // 3.32 km budget, ground that lets it reach 1.36 km.
      heightM: 32,
      maxRangeM: RF.defaultMaxRangeM,
      txPowerDbm: 10,
      rxSensitivityDbm: -85,
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
