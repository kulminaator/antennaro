/**
 * Unit tests: the scenarios the UI offers.
 *
 * Layer: test (unit).
 *
 * A preset is a patch applied to the default state, so it must pass the reducer's
 * validation like any other patch - and it must differ from its siblings in a way the
 * map can show, or two menu entries describe the same simulation.
 
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyPatch, createInitialState, getPath } from '../../src/app/state.js';
import { PRESETS, PRESET_IDS, getPreset, validatePresets } from '../../src/app/presets.js';
import { presetOptions } from '../../src/ui/schema.js';
import { ANTENNA_IDS } from '../../src/antenna/catalogue.js';

const initial = createInitialState();

test('presets: every scenario applies cleanly to the default state', () => {
  assert.ok(PRESETS.length >= 4, 'there should be a handful of stories to tell');
  assert.equal(new Set(PRESET_IDS).size, PRESET_IDS.length, 'preset ids are unique');
  for (const preset of PRESETS) {
    assert.ok(preset.label.length > 3, `${preset.id}: needs a label`);
    assert.ok(preset.description.length > 20, `${preset.id}: the dropdown shows the description`);
    assert.ok(ANTENNA_IDS.includes(preset.patch.designId), `${preset.id}: unknown design`);
  }
  assert.deepEqual(validatePresets(applyPatch, initial), [], 'no preset may be rejected or clamped');

  for (const preset of PRESETS) {
    const result = applyPatch(initial, preset.patch);
    assert.equal(result.state.designId, preset.patch.designId, `${preset.id}: design applied`);
    assert.equal(result.state.heightM, preset.patch.heightM, `${preset.id}: height applied`);
    assert.ok(result.changed.length > 2, `${preset.id}: a preset must actually change things`);
    assert.ok(getPath(result.state, ['aim', 'azimuthDeg']) >= 0);
  }
  assert.equal(getPreset('nope'), undefined);
  assert.ok(getPreset(PRESET_IDS[0]));
});

test('presets: the scenarios really do point at different parts of the map', () => {
  const azimuths = PRESETS.map((preset) => getPreset(preset.id).patch.aim.azimuthDeg);
  assert.ok(new Set(azimuths).size >= 4, 'the presets should showcase different directions');
  const heights = PRESETS.map((preset) => preset.patch.heightM);
  assert.ok(Math.max(...heights) - Math.min(...heights) >= 10, 'and different mast heights');
  const options = presetOptions();
  assert.deepEqual(options.map((option) => option.value), PRESET_IDS);
  for (const option of options) assert.ok(option.label && option.hint);
});
