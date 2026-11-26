/**
 * Unit tests: what a change invalidates, and how a change is described.
 *
 * Layer: test (unit).
 *
 * Split out of state.test.js by subject rather than by line count: the patch contract
 * stayed there, the recomputation bookkeeping came here. These are the assertions that
 * stop a view going stale - a field that invalidates nothing is a field whose effect
 * the pipeline never hears about.
 
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANTENNA, TERRAIN } from '../../src/config.js';
import {
  applyPatch, createInitialState, diffStates, getPath, impactedStages, RECOMPUTE, STATE_FIELDS, withPath,
} from '../../src/app/state.js';

const initial = createInitialState();

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

test('state: moving the site dirties the rig and the coverage, not the ground', () => {
  // The ground belongs to the map: relocating the mast moves the rig and re-runs the
  // ray grid, and must never regenerate a height field that did not change.
  const stages = impactedStages(['site.x', 'site.z']);
  assert.ok(stages.includes(RECOMPUTE.ANTENNA), `stages: ${stages}`);
  assert.ok(stages.includes(RECOMPUTE.COVERAGE), `stages: ${stages}`);
  assert.ok(!stages.includes(RECOMPUTE.TERRAIN), `the site still dirties the terrain: ${stages}`);
});
