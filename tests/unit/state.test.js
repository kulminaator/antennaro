/**
 * Unit tests: the state reducer's contract with everything above it.
 *
 * Layer: test (unit).
 *
 * The rule these tests defend (GUIDELINES.md section 5.3): state is declarative, the
 * UI can only ask for a patch, and the reducer is the single place that validates.
 * The panel-defaults test at the end belongs here rather than in panel.test.js because
 * what it checks is a reducer bound meeting the DOM's sanitising behaviour - the seed
 * once arrived as 999999 instead of TERRAIN.seed and the app simulated a different map
 * from the one config asked for, silently, for months. GUIDELINES section 4 names this
 * file for that assertion.
 
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANTENNA, RF, TERRAIN, WORLD } from '../../src/config.js';
import { applyPatch, createInitialState, createInitialStateWithReport } from '../../src/app/state.js';
import { buildPanel } from '../../src/ui/schema.js';
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
