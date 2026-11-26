/**
 * Unit tests: the display controls - what the panel offers for drawing the picture, and
 * what the reducer accepts.
 *
 * Split out of `state.test.js` (which had outgrown its line budget) because the display
 * switches are a contract of their own: the coverage view is one field with three values,
 * so no combination of toggles can ask for two different maps at once, and every default
 * has to be inside the control that shows it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RF } from '../../src/config.js';
import { PRESETS } from '../../src/app/presets.js';
import { applyPatch, createInitialState, STATE_FIELDS } from '../../src/app/state.js';

const fieldByKey = new Map(STATE_FIELDS.map((field) => [field.key, field]));

test('panel: the coverage view is one field with three honest values', () => {
  const field = fieldByKey.get('display.coverageView');
  assert.ok(field, 'the panel declares the coverage view');
  assert.equal(field.kind, 'select');
  const values = field.options.map((option) => option.value);
  assert.deepEqual(values, ['bands', 'gradient', 'zone']);
  // The rule that caught the seed bug: a default has to be inside its own control.
  assert.ok(values.includes(createInitialState().display.coverageView),
    `the default ${createInitialState().display.coverageView} is not one of the panel's options`);

  for (const value of values) {
    const result = applyPatch(createInitialState(), { display: { coverageView: value } });
    assert.deepEqual(result.rejected, [], `${value} should be accepted`);
    assert.equal(result.state.display.coverageView, value);
  }
  const bogus = applyPatch(createInitialState(), { display: { coverageView: 'rainbow' } });
  assert.equal(bogus.state.display.coverageView, createInitialState().display.coverageView,
    'an unknown view leaves the picture alone');
  assert.deepEqual(bogus.rejected.map((entry) => [entry.key, entry.reason]),
    [['display.coverageView', 'invalid value']], 'and says why, in the report');

  // The volume switch is now only the volume; it must not be able to repaint the drape.
  const volume = fieldByKey.get('display.showFresnel');
  assert.equal(volume.label, 'Fresnel zone volume');
  const hint = volume.hint ?? '';
  assert.ok(!/instead of/i.test(hint), 'the volume hint must not promise a colouring mode');
  assert.match(hint, /coverage view/i, 'and it must point at the control that does');
});

test('panel: a scenario chooses ground and antenna, never the coverage view', () => {
  for (const preset of PRESETS) {
    assert.ok(!('display' in preset.patch), `${preset.id} would overrule the user's own view`);
    const applied = applyPatch(createInitialState(), preset.patch);
    assert.deepEqual(applied.rejected, [], `${preset.id} must apply cleanly`);
    assert.deepEqual(applied.state.display, createInitialState().display,
      `${preset.id} changed the display block`);
  }
  // And the view the app boots with is one a scenario could be looked at in: the zone
  // demo is reached by the panel or `?fresnel=1`, on top of any preset.
  assert.equal(createInitialState().display.coverageView, RF.defaultCoverageView);
});
