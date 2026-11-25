/**
 * Control-panel descriptors.
 *
 * Layer: L2 (pure). Turns state + catalogue into a flat, ordered list of widget
 * descriptors. No DOM here: `controls.js` paints these, and unit tests assert
 * that every control maps to a real state key with real limits.
 */

import { ANTENNA_CATALOGUE } from '../antenna/catalogue.js';
import { PRESETS } from '../app/presets.js';
import { getPath, STATE_FIELDS } from '../app/state.js';

/** design-specific params -> widget descriptors */
function paramFields(entry, params) {
  return entry.paramSpecs.map((spec) => ({
    key: `params.${spec.key}`,
    label: spec.label,
    kind: spec.step >= 1 ? 'int' : 'range',
    value: params[spec.key] ?? spec.default,
    min: spec.min,
    max: spec.max,
    step: spec.step,
    unit: spec.unit,
    hint: spec.hint,
  }));
}

function fieldByKey(state, key) {
  const field = STATE_FIELDS.find((candidate) => candidate.key === key);
  if (!field) throw new RangeError(`unknown state key in panel: ${key}`);
  return {
    key: field.key,
    label: field.label,
    kind: field.kind,
    value: getPath(state, field.path),
    min: field.min,
    max: field.max,
    step: field.step,
    unit: field.unit,
    hint: field.hint,
    options: field.options,
  };
}

/**
 * @param {object} state application state
 * @returns {Array<{id:string, title:string, note?:string, fields:object[]}>}
 */
export function buildPanel(state) {
  const entry = ANTENNA_CATALOGUE.find((candidate) => candidate.id === state.designId);
  if (!entry) throw new RangeError(`unknown antenna design: ${state.designId}`);
  const aimEnabled = entry.aimsInAzimuth;

  return [
    {
      id: 'design',
      title: 'Antenna design',
      note: entry.summary,
      fields: [
        {
          key: 'designId',
          label: 'Design',
          kind: 'select',
          value: state.designId,
          options: ANTENNA_CATALOGUE.map((candidate) => ({
            value: candidate.id,
            label: `${candidate.label} (${candidate.family === 'omni' ? 'omni' : 'beam'})`,
          })),
        },
        ...paramFields(entry, state.params),
      ],
    },
    {
      id: 'placement',
      title: 'Placement and aim',
      note: `${aimEnabled
        ? 'The beam is a template: the model combines an H-plane and an E-plane cut.'
        : 'This design radiates equally in all compass directions, so azimuth only turns the hardware.'} `
        + 'Drag the mast on the map, or use the two offset sliders to move the whole site.',
      fields: [
        fieldByKey(state, 'site.x'),
        fieldByKey(state, 'site.z'),
        fieldByKey(state, 'heightM'),
        { ...fieldByKey(state, 'aim.azimuthDeg'), disabled: !aimEnabled },
        fieldByKey(state, 'aim.tiltDeg'),
      ],
    },
    {
      id: 'radio',
      title: 'Radio and link budget',
      fields: [
        fieldByKey(state, 'frequencyKey'),
        fieldByKey(state, 'txPowerDbm'),
        fieldByKey(state, 'feederLossDb'),
        fieldByKey(state, 'rxSensitivityDbm'),
        fieldByKey(state, 'zoneRxHeightM'),
        fieldByKey(state, 'maxRangeM'),
        fieldByKey(state, 'clutterLossDb'),
        fieldByKey(state, 'useDiffraction'),
      ],
    },
    {
      id: 'terrain',
      title: 'Terrain',
      note: 'North: mountain with a taller range behind. East: flat field. South: valley. West: bumps.',
      fields: [fieldByKey(state, 'seed')],
    },
    {
      id: 'display',
      title: 'Display',
      fields: [
        fieldByKey(state, 'display.showCoverage'),
        fieldByKey(state, 'display.showPattern'),
        fieldByKey(state, 'display.showFresnel'),
        fieldByKey(state, 'display.showWireframe'),
        fieldByKey(state, 'display.showSectors'),
      ],
    },
  ];
}

/** Dropdown entries for the preset selector. */
export function presetOptions() {
  return PRESETS.map((preset) => ({ value: preset.id, label: preset.label, hint: preset.description }));
}
