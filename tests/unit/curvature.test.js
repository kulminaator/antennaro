/**
 * Unit tests: the round earth, as the coverage sweep reports it.
 *
 * The curvature figures are user-facing claims, and the interesting one is a negative:
 * on a 5.2 km map the earth cannot be what ends a link, so the app must not be allowed to
 * imply that it is. These tests measure the extreme case - the lowest mast the panel
 * allows, a featureless plane, a budget that could cross a continent - and require that
 * the sweep still finishes on the edge of the map, not on the curve. They also pin that
 * the numbers in `coverage().stats` are the ones `rf.js` computes, so the read-out and the
 * physics cannot drift into two different stories about the same ray.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RF, TERRAIN, WORLD } from '../../src/config.js';
import { HeightField } from '../../src/terrain/heightfield.js';
import { resolveSite } from '../../src/terrain/site.js';
import { createAntennaModel } from '../../src/antenna/model.js';
import { createDefaultParams } from '../../src/antenna/catalogue.js';
import { createInitialState, applyPatch } from '../../src/app/state.js';
import { computeCoverage } from '../../src/propagation/coverage.js';
import { earthBulgeM, radioHorizonM, wavelengthM } from '../../src/propagation/rf.js';

/** A plane: no ridge, no valley, nothing between the mast and the far corner but the earth. */
function planeField() {
  const field = new HeightField({
    size: WORLD.gridSize, worldSize: WORLD.worldSize, cellSizeM: TERRAIN.cellSizeM,
  });
  field.heights.fill(0);
  return field;
}

function sweep(field, patch) {
  const state = applyPatch(createInitialState(), patch).state;
  const site = resolveSite(field, { x: state.site.x, z: state.site.z, heightM: state.heightM });
  const model = createAntennaModel({
    designId: state.designId, params: createDefaultParams(state.designId),
    aim: state.aim, wavelength: wavelengthM(868e6),
  });
  const coverage = computeCoverage({
    field, site, model, freqHz: 868e6, txPowerDbm: state.txPowerDbm,
    feederLossDb: state.feederLossDb, rxSensitivityDbm: state.rxSensitivityDbm,
    maxRangeM: state.maxRangeM, clutterLossDb: 0, useDiffraction: true,
    rxHeightM: state.zoneRxHeightM,
  });
  return { coverage, stats: coverage.stats, site };
}

const LOUDEST = Object.freeze({
  designId: 'omni-collinear', txPowerDbm: 43, rxSensitivityDbm: -124, maxRangeM: WORLD.worldSize,
});

test('coverage: the earth is never what ends the coverage inside this map', () => {
  const { stats } = sweep(planeField(), { ...LOUDEST, heightM: 0.5 });
  assert.equal(stats.limitingFactor, 'map-edge',
    'the sweep must run off the world, not stop on the curve');
  assert.equal(stats.linkedCells, stats.evaluatedCells,
    'over a plane with this budget every point the sweep looked at has to link');
  assert.ok(stats.maxLinkedRangeM > 3000, `the longest link is ${stats.maxLinkedRangeM} m`);
  assert.ok(stats.earthBulgeUnderMaxLinkM < 0.25,
    `the whole bulge under the longest link is ${stats.earthBulgeUnderMaxLinkM} m - centimetres`);
  assert.ok(stats.radioHorizonM > WORLD.worldSize,
    'and the horizon it quotes is off the map the picture is drawn on');
});

test('coverage: the curvature facts it reports are the ones rf.js computes', () => {
  const field = planeField();
  const { stats, site } = sweep(field, { ...LOUDEST, heightM: 12 });
  const rxHeightM = createInitialState().zoneRxHeightM;
  assert.equal(stats.kFactor, RF.kFactor, 'the row says which earth it used');
  assert.equal(stats.worldSizeM, field.worldSize, 'and the map it was measured against');
  assert.equal(stats.radioHorizonM, radioHorizonM(site.heightM, rxHeightM),
    'the horizon in the stats is the textbook horizon for this mast and terminal');
  assert.equal(
    stats.earthBulgeUnderMaxLinkM,
    earthBulgeM(stats.maxLinkedRangeM / 2, stats.maxLinkedRangeM / 2),
    'the bulge is the mid-path bulge of the longest link, not a number from a handbook',
  );
  // Curvature has to be switched off to be flat, not quietly absent.
  assert.equal(radioHorizonM(2, 1, 0), Infinity, 'a flat earth has no horizon at all');
  assert.ok(radioHorizonM(40, 4) > radioHorizonM(10, 4), 'lifting the mast lengthens the horizon');
});
