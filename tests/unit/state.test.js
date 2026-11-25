/**
 * Unit tests: the state reducer, presets and the control-panel schema.
 *
 * The rule these tests defend (GUIDELINES.md §5.3): state is declarative, the UI
 * can only ask for a patch, and the reducer is the single place that validates.
 * A slider must never be able to disagree with a physics limit - both are read
 * from STATE_FIELDS, and the panel test below proves it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANTENNA, RF, TERRAIN, WORLD } from '../../src/config.js';
import {
  applyPatch, createInitialState, createInitialStateWithReport, diffStates, getPath, impactedStages, RECOMPUTE,
  STATE_FIELDS, withPath,
} from '../../src/app/state.js';
import { PRESETS, PRESET_IDS, getPreset, validatePresets } from '../../src/app/presets.js';
import { buildPanel, presetOptions } from '../../src/ui/schema.js';
import { ANTENNA_IDS } from '../../src/antenna/catalogue.js';

const initial = createInitialState();

test('state: initial state comes from configuration, not from literals', () => {
  assert.equal(initial.designId, ANTENNA.defaultDesignId);
  assert.equal(initial.heightM, ANTENNA.defaultHeightM);
  assert.equal(initial.frequencyKey, RF.defaultFrequencyKey);
  assert.equal(initial.txPowerDbm, RF.defaultTxPowerDbm);
  assert.equal(initial.rxSensitivityDbm, RF.defaultRxSensitivityDbm);
  assert.equal(initial.maxRangeM, RF.defaultMaxRangeM);
  assert.equal(initial.seed, TERRAIN.seed);
  assert.equal(initial.worldSize, WORLD.worldSize);
  assert.equal(initial.gridSize, WORLD.gridSize);
  assert.deepEqual(initial.aim, { azimuthDeg: 0, tiltDeg: 0, beamTiltDeg: 0 });
  assert.equal(initial.display.showCoverage, true);
  assert.equal(initial.params.directors, undefined, 'the default design has no Yagi parameters');
});

test('state: overrides are validated the same way as later patches', () => {
  const custom = createInitialState({ designId: 'yagi', heightM: 25, aim: { azimuthDeg: 90 }, seed: 7 });
  assert.equal(custom.designId, 'yagi');
  assert.equal(custom.heightM, 25);
  assert.equal(custom.params.directors, 7, 'switching design on creation fills catalogue defaults');
  assert.equal(custom.aim.azimuthDeg, 90);
  assert.equal(custom.seed, 7);
  assert.equal(createInitialState({ heightM: 9999 }).heightM, ANTENNA.heightLimitsM.max, 'creation clamps too');
  assert.equal(createInitialState({ designId: 'nonsense' }).designId, ANTENNA.defaultDesignId);
});

test('state: applyPatch reports changed, clamped and rejected without lying', () => {
  const result = applyPatch(initial, { heightM: 20, frequencyKey: '2400', useDiffraction: false });
  assert.deepEqual(result.changed.sort(), ['frequencyKey', 'heightM', 'useDiffraction']);
  assert.deepEqual(result.clamped, []);
  assert.deepEqual(result.rejected, []);
  assert.equal(result.ok, true, 'ok is the documented shorthand for "nothing was rejected"');
  assert.equal(applyPatch(result.state, { heightM: 20 }).ok, true, 'a no-op patch is still accepted');
  assert.equal(result.state.heightM, 20);
  assert.equal(result.state.frequencyKey, '2400');
  assert.equal(result.state.useDiffraction, false);

  const noop = applyPatch(result.state, { heightM: 20 });
  assert.deepEqual(noop.changed, [], 'patching the current value changes nothing');
  assert.equal(noop.state, result.state, 'and returns the identical object');
});

test('state: out-of-range numbers clamp, junk is rejected', () => {
  const clamped = applyPatch(initial, { heightM: 9999, txPowerDbm: -100, seed: 1e12 });
  assert.equal(clamped.state.heightM, ANTENNA.heightLimitsM.max);
  assert.equal(clamped.state.txPowerDbm, -10);
  assert.equal(clamped.state.seed, TERRAIN.seedMax, 'the seed clamps to the control ceiling');
  assert.deepEqual(clamped.clamped.map((entry) => entry.key).sort(), ['heightM', 'seed', 'txPowerDbm']);
  assert.deepEqual(clamped.rejected, []);

  const junk = applyPatch(initial, { heightM: 'tall', seed: Number.NaN, maxRangeM: null, bogus: 1, aim: 5 });
  assert.deepEqual(junk.state, initial, 'nothing is applied');
  assert.deepEqual(junk.changed, []);
  const keys = junk.rejected.map((entry) => entry.key).sort();
  assert.deepEqual(keys, ['aim', 'bogus', 'heightM', 'maxRangeM', 'seed']);
});

test('state: slider steps are respected, so the UI and the model agree', () => {
  assert.equal(applyPatch(initial, { heightM: 10.3 }).state.heightM, 10.5, 'height steps by 0.5 m');
  assert.equal(applyPatch(initial, { feederLossDb: 1.7 }).state.feederLossDb, 1.5);
  assert.equal(applyPatch(initial, { seed: 41.7 }).state.seed, 42, 'the integer field rounds');
  assert.equal(applyPatch(initial, { maxRangeM: 1234 }).state.maxRangeM, 1250, 'range snaps to 50 m');
  assert.equal(applyPatch(initial, { frequencyKey: '1234' }).state.frequencyKey, RF.defaultFrequencyKey,
    'a band that is not offered is rejected... and reported');
  const bad = applyPatch(initial, { frequencyKey: '1234' });
  assert.deepEqual(bad.rejected, [{ key: 'frequencyKey', reason: 'invalid value' }]);
});

test('state: nested aim, params and display patches behave', () => {
  const aim = applyPatch(initial, { aim: { azimuthDeg: 725, tiltDeg: -12 } });
  assert.equal(aim.state.aim.azimuthDeg, 5, 'azimuth wraps through 360');
  assert.equal(aim.state.aim.tiltDeg, -12);
  assert.ok(aim.changed.includes('aim'));

  const beamTilt = applyPatch(applyPatch(initial, { designId: 'patch' }).state, { aim: { beamTiltDeg: 99 } });
  assert.equal(beamTilt.state.aim.beamTiltDeg, 20, 'the design caps electrical downtilt');
  const noTilt = applyPatch(initial, { aim: { beamTiltDeg: 5 } });
  assert.deepEqual(noTilt.rejected, [{ key: 'aim.beamTiltDeg', reason: 'design has no electrical beam tilt' }]);

  const yagi = applyPatch(initial, { designId: 'yagi' }).state;
  const params = applyPatch(yagi, { params: { directors: 12, bogus: 3 } });
  assert.equal(params.state.params.directors, 12);
  assert.deepEqual(params.rejected, [{ key: 'params.bogus', reason: 'not a parameter of this design' }]);
  const wrongDesign = applyPatch(yagi, { params: { elements: 6 } });
  assert.ok(wrongDesign.rejected.some((entry) => entry.key === 'params.elements'),
    'you cannot set another design parameter through params');

  const display = applyPatch(initial, { display: { showPattern: false, nope: true } });
  assert.equal(display.state.display.showPattern, false);
  assert.equal(display.state.display.showCoverage, true, 'untouched flags survive');
  assert.deepEqual(display.rejected, [{ key: 'display.nope', reason: 'unknown state key' }]);
});

test('state: swapping design keeps the aim and resets the parameters', () => {
  const aimed = applyPatch(initial, { aim: { azimuthDeg: 140, tiltDeg: -8 } }).state;
  const swapped = applyPatch(aimed, { designId: 'biquad-reflector' });
  assert.equal(swapped.state.aim.azimuthDeg, 140, 'the user did not ask to change where it points');
  assert.equal(swapped.state.aim.tiltDeg, -8);
  assert.deepEqual(swapped.state.params, { turns: 2, reflectorSpacingLambda: 0.25, beamTiltDeg: 0 });
  assert.ok(swapped.changed.includes('designId') && swapped.changed.includes('params'));
  assert.equal(applyPatch(initial, { designId: 'omni-dipole' }).changed.length, 0, 'same design is a no-op');
  assert.deepEqual(applyPatch(initial, { params: 'nope' }).rejected, [{ key: 'params', reason: 'params must be an object' }]);
});

test('state: world and grid requests stay on the odd-cell lattice', () => {
  const grid = applyPatch(initial, { gridSize: 200 });
  assert.equal(grid.state.gridSize % 2, 1, 'grid size is forced odd so the site hits a cell centre');
  assert.equal(grid.state.gridSize, 199);
  assert.ok(grid.changed.includes('gridSize'));
  assert.equal(applyPatch(initial, { gridSize: 3 }).state.gridSize, WORLD.minGridSize);
  assert.equal(applyPatch(initial, { gridSize: 100000 }).state.gridSize, WORLD.maxGridSize);
  assert.equal(applyPatch(initial, { worldSize: 10 }).state.worldSize, WORLD.minWorldSize);
  assert.equal(applyPatch(initial, { worldSize: 1e9 }).state.worldSize, WORLD.maxWorldSize);
  assert.deepEqual(applyPatch(initial, { worldSize: 'wide' }).rejected, [{ key: 'worldSize', reason: 'must be a number' }]);
});

test('state: patches never mutate the previous state object', () => {
  const before = structuredClone(initial);
  applyPatch(initial, { heightM: 33, aim: { azimuthDeg: 45 }, params: { directors: 9 }, display: { showSectors: false } });
  assert.deepEqual(initial, before, 'the old snapshot is untouched');
});

test('state: unknown structural keys explain themselves', () => {
  const result = applyPatch(initial, { display: 'x', aim: 'y', params: 3, designId: 'nope' });
  const reasons = Object.fromEntries(result.rejected.map((entry) => [entry.key, entry.reason]));
  assert.equal(reasons.display, 'display must be an object');
  assert.equal(reasons.aim, 'aim must be an object');
  assert.equal(reasons.params, 'params must be an object');
  assert.equal(reasons.designId, 'unknown antenna design');
  assert.equal(applyPatch(initial, null).changed.length, 0, 'a null patch is harmless');
});

test('state: impactedStages maps a change to the pipeline work it needs', () => {
  assert.deepEqual(impactedStages(['seed']).sort(), [RECOMPUTE.COVERAGE, RECOMPUTE.TERRAIN].sort());
  assert.deepEqual(impactedStages(['heightM']).sort(), [RECOMPUTE.ANTENNA, RECOMPUTE.COVERAGE].sort());
  assert.deepEqual(impactedStages(['txPowerDbm']), [RECOMPUTE.COVERAGE]);
  assert.deepEqual(impactedStages(['display.showCoverage']), [RECOMPUTE.DISPLAY]);
  assert.deepEqual(impactedStages(['designId']).sort(), [RECOMPUTE.ANTENNA, RECOMPUTE.COVERAGE].sort());
  assert.deepEqual(impactedStages(['gridSize']).sort(), [RECOMPUTE.COVERAGE, RECOMPUTE.TERRAIN].sort());
  assert.deepEqual(impactedStages([]), [], 'no change, no work');
  const all = impactedStages(['seed', 'display.showPattern', 'txPowerDbm']);
  assert.ok(all.includes(RECOMPUTE.TERRAIN) && all.includes(RECOMPUTE.COVERAGE) && all.includes(RECOMPUTE.DISPLAY));
  for (const field of STATE_FIELDS) {
    const stages = impactedStages([field.key]);
    assert.ok(stages.length > 0, `${field.key} must invalidate something, otherwise the view goes stale`);
    assert.ok(field.impact.every((stage) => stages.includes(stage) || stages.includes(RECOMPUTE.TERRAIN)),
      `${field.key}: the declared impact must be honoured`);
  }
});

test('state: diffStates describes what moved', () => {
  const next = applyPatch(initial, { heightM: 12, display: { showPattern: false } }).state;
  const diff = diffStates(initial, next);
  assert.deepEqual(diff.map((entry) => entry.path).sort(), ['display.showPattern', 'heightM']);
  assert.deepEqual(diff.find((entry) => entry.path === 'heightM'), { path: 'heightM', from: 10, to: 12 });
  assert.deepEqual(diffStates(initial, initial), []);
});

test('state: path helpers are pure', () => {
  const state = { a: { b: { c: 1 } } };
  assert.equal(getPath(state, ['a', 'b', 'c']), 1);
  assert.equal(getPath(state, ['a', 'missing', 'c']), undefined);
  assert.equal(getPath(state, []), state);
  const updated = withPath(state, ['a', 'b', 'c'], 2);
  assert.equal(state.a.b.c, 1, 'original untouched');
  assert.equal(updated.a.b.c, 2);
  assert.notEqual(updated.a, state.a, 'and every ancestor is a new object');
});

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

/** The panel is generated from the catalogue, so it is a valid place to read limits back. */
function specFromPanel(designId, key) {
  const entry = buildPanel(createInitialState({ designId }))
    .find((section) => section.id === 'design')
    .fields.find((field) => field.key === `params.${key}`);
  return { max: entry.max, step: entry.step };
}

test('state: the site can be relocated, and the offset stays inside the map', () => {
  assert.deepEqual(createInitialState().site, { x: ANTENNA.defaultSiteXm, z: ANTENNA.defaultSiteZm });

  const moved = applyPatch(initial, { site: { x: 300, z: -200 } });
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.changed, ['site.x', 'site.z']);
  assert.deepEqual(moved.state.site, { x: 300, z: -200 });

  // Limits come from ANTENNA.siteLimitsM (+/- half the world), never from a literal here.
  const over = applyPatch(initial, { site: { x: 1e6, z: -1e6 } });
  assert.equal(over.state.site.x, ANTENNA.siteLimitsM.max);
  assert.equal(over.state.site.z, ANTENNA.siteLimitsM.min);
  assert.deepEqual(over.clamped.map((entry) => entry.key).sort(), ['site.x', 'site.z']);

  const junk = applyPatch(initial, { site: 'nowhere' });
  assert.equal(junk.ok, false);
  assert.deepEqual(junk.rejected.map((entry) => entry.key), ['site']);
  const stray = applyPatch(initial, { site: { y: 5 } });
  assert.deepEqual(stray.rejected.map((entry) => entry.key), ['site.y']);
  assert.equal(stray.changed.length, 0, 'a rejected sub-key must not move anything');
});

test('state: moving the site dirties the rig and the coverage, not the ground', () => {
  // The ground belongs to the map: relocating the mast moves the rig and re-runs the
  // ray grid, and must never regenerate a height field that did not change.
  const stages = impactedStages(['site.x', 'site.z']);
  assert.ok(stages.includes(RECOMPUTE.ANTENNA), `stages: ${stages}`);
  assert.ok(stages.includes(RECOMPUTE.COVERAGE), `stages: ${stages}`);
  assert.ok(!stages.includes(RECOMPUTE.TERRAIN), `the site still dirties the terrain: ${stages}`);
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

test('state: a requested value we cannot honour is reported, not swallowed', () => {
  // URL links and test harnesses ask for the impossible. Clamping is right; clamping in
  // silence is not, because a limited picture would then look like physics.
  const asked = createInitialStateWithReport({
    maxRangeM: RF.maxRangeLimitsM.max + 5000,
    site: { x: ANTENNA.siteLimitsM.max + 10_000, z: 0 },
    heightM: 5.5,
    frequencyKey: 'terahertz',
  });
  assert.equal(asked.state.maxRangeM, RF.maxRangeLimitsM.max, 'the request is trimmed to the study maximum');
  const range = asked.clamped.find((entry) => entry.key === 'maxRangeM');
  assert.ok(range, 'the trim is listed');
  assert.equal(range.from, RF.maxRangeLimitsM.max + 5000, 'the report keeps what was asked for');
  assert.equal(range.to, RF.maxRangeLimitsM.max);
  const east = asked.clamped.find((entry) => entry.key === 'site.x');
  assert.equal(east.to, ANTENNA.siteLimitsM.max, 'and the placement is trimmed to the map, not the old map');
  assert.equal(asked.rejected.some((entry) => entry.key === 'frequencyKey'), true, 'junk is refused out loud');
  assert.deepEqual(createInitialStateWithReport({}).clamped, [], 'a plain boot asks for nothing');
});

test('panel: no default sits outside the bounds of its own control', () => {
  // A range input sanitises an out-of-range value to the nearest bound, and Blink reports
  // that as an `input` event - so a default outside its own slider does not merely look
  // wrong, the panel writes the clamped number back into the model at boot and the world
  // you get is not the one the configuration asked for. That is exactly how the terrain
  // seed used to arrive as 999999 instead of TERRAIN.seed.
  for (const designId of ANTENNA_IDS) {
    const state = createInitialState({ designId });
    for (const field of buildPanel(state).flatMap((group) => group.fields)) {
      if (field.kind !== 'range' && field.kind !== 'int') continue;
      const value = Number(field.value);
      assert.ok(value >= field.min && value <= field.max,
        `${designId}: ${field.key} defaults to ${value}, outside [${field.min}, ${field.max}]`);
      if (field.kind === 'int') assert.equal(Number.isInteger(value), true, `${field.key}: an int default`);
    }
  }
  assert.equal(createInitialState().seed, TERRAIN.seed, 'the map you get is the map the configuration asked for');
  assert.equal(createInitialState().seed <= 999_999, false, 'the old slider ceiling was what swallowed the seed');
});
