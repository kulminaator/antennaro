/**
 * Unit tests: the control panel is generated from state and catalogue, never typed.
 *
 * Layer: test (unit).
 *
 * The panel is a projection of STATE_FIELDS and the antenna catalogue, so every test
 * here reads a control back out of buildPanel() and compares it against the source it
 * claims to mirror. A hand-typed min/max or a silently missing row is exactly the drift
 * that lets the UI lie about the model.
 
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANTENNA, RF } from '../../src/config.js';
import { applyPatch, createInitialState, STATE_FIELDS } from '../../src/app/state.js';
import { buildPanel } from '../../src/ui/schema.js';
import { ANTENNA_IDS } from '../../src/antenna/catalogue.js';

const initial = createInitialState();

test('schema: the panel exposes every control declared in STATE_FIELDS', () => {
  const panel = buildPanel(initial);
  const keys = panel.flatMap((section) => section.fields.map((field) => field.key));
  assert.equal(new Set(keys).size, keys.length, 'no duplicate control');
  for (const field of STATE_FIELDS) {
    assert.ok(keys.includes(field.key), `${field.key} is in STATE_FIELDS but has no control`);
  }
  for (const section of panel) {
    assert.ok(section.id && section.title, 'every section is addressable and titled');
    assert.ok(section.fields.length > 0, `${section.id}: empty section`);
  }
});

/** The panel is generated from the catalogue, so it is a valid place to read limits back. */
function specFromPanel(designId, key) {
  const entry = buildPanel(createInitialState({ designId }))
    .find((section) => section.id === 'design')
    .fields.find((field) => field.key === `params.${key}`);
  return { max: entry.max, step: entry.step };
}

test('schema: controls mirror state values and catalogue limits', () => {
  const state = applyPatch(initial, { designId: 'yagi', heightM: 22, aim: { azimuthDeg: 45 } }).state;
  const panel = buildPanel(state);
  const byKey = Object.fromEntries(panel.flatMap((section) => section.fields.map((field) => [field.key, field])));

  assert.equal(byKey.heightM.value, 22);
  assert.equal(byKey.heightM.min, ANTENNA.heightLimitsM.min);
  assert.equal(byKey.heightM.max, ANTENNA.heightLimitsM.max);
  assert.equal(byKey['aim.azimuthDeg'].value, 45);
  assert.equal(byKey['aim.azimuthDeg'].disabled, false, 'a Yagi aims in azimuth');
  const omniPanel = buildPanel(initial);
  const omniAim = omniPanel.flatMap((section) => section.fields).find((field) => field.key === 'aim.azimuthDeg');
  assert.equal(omniAim.disabled, true, 'an omni still turns its hardware, but the beam does not move');

  const directors = byKey['params.directors'];
  assert.equal(directors.kind, 'int');
  assert.equal(directors.value, 7);
  const spec = specFromPanel('yagi', 'directors');
  assert.equal(directors.max, spec.max, 'the slider limit IS the catalogue limit');
  assert.equal(directors.step, spec.step);

  const band = byKey.frequencyKey;
  assert.equal(band.kind, 'select');
  assert.deepEqual(band.options.map((option) => option.value), Object.keys(RF.frequenciesHz));
  assert.equal(byKey.designId.options.length, ANTENNA_IDS.length);
  assert.equal(byKey.designId.value, 'yagi');

  const patch = applyPatch(initial, { display: { showSectors: false } }).state;
  assert.equal(buildPanel(patch).flatMap((s) => s.fields).find((f) => f.key === 'display.showSectors').value, false);
  assert.throws(() => buildPanel({ ...initial, designId: 'ghost' }), RangeError);
});

test('panel: the placement group exposes both site offsets', () => {
  const group = buildPanel(createInitialState()).find((section) => section.id === 'placement');
  const keys = group.fields.map((field) => field.key);
  assert.deepEqual(keys.slice(0, 2), ['site.x', 'site.z'], 'the offsets lead the placement group');
  for (const key of ['site.x', 'site.z']) {
    const field = group.fields.find((candidate) => candidate.key === key);
    assert.equal(field.min, ANTENNA.siteLimitsM.min, 'the slider limit IS the reducer limit');
    assert.equal(field.max, ANTENNA.siteLimitsM.max);
    assert.equal(field.step, ANTENNA.siteStepM);
  }
});
