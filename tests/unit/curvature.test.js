/**
 * Unit tests: the round earth, as the coverage sweep reports it.
 *
 * The curvature figures are user-facing claims, and both halves of the honest answer are
 * worth pinning, because they pull in opposite directions:
 *
 * - Over a 5.2 km map the earth is never what **ends** coverage. Even the lowest mast the
 *   panel allows, on a featureless plane with a budget that could cross a continent, runs
 *   off the edge of the world with every point linked.
 * - That is not because the earth is irrelevant. With the same lowest mast it hides the
 *   far corners of this map, and the ring where it starts hiding them is the horizon
 *   distance the rf maths predicts. Only the *cost* is small - centimetres of obstruction
 *   is a few dB, not a cliff.
 *
 * Over a plane the earth is the only thing that can obstruct anything, which is what makes
 * these tests clean: a positive `obstructionDb` on a plane can only have come from the
 * curvature. They also pin that the numbers in `coverage().stats` are the ones `rf.js`
 * computes, so the read-out and the physics cannot tell two stories about the same ray.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANTENNA, RF, TERRAIN, WORLD } from '../../src/config.js';
import { farthestGroundDistanceM } from '../../src/math/vec3.js';
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

/** The farthest and nearest links the sweep can be asked to make, from a legal site. */
function obstructedByEarth(coverage) {
  const ring = { cells: 0, nearestM: Infinity, farthestM: 0 };
  for (let i = 0; i < coverage.obstructionDb.length; i += 1) {
    if (!coverage.evaluated[i] || coverage.budgetExcluded[i]) continue;
    if (coverage.obstructionDb[i] <= 0) continue;
    ring.cells += 1;
    ring.nearestM = Math.min(ring.nearestM, coverage.distanceM[i]);
    ring.farthestM = Math.max(ring.farthestM, coverage.distanceM[i]);
  }
  return ring;
}

test('coverage: the earth does hide part of this map, from the mast height that can see it', () => {
  // `sqrt(2 k R h)` is the distance at which a mast of `h` loses a terminal standing on
  // the ground; `tests/unit/raycurvature.test.js` proves the ray walk agrees with it.
  const shadowDistanceOf = (heightM) => Math.sqrt(2 * RF.kFactor * RF.earthRadiusM * heightM);
  const low = ANTENNA.heightLimitsM.min;
  const lowShadowM = shadowDistanceOf(low);
  const mapReach = farthestGroundDistanceM(
    { x: ANTENNA.siteLimitsM.min, z: ANTENNA.siteLimitsM.min }, WORLD.worldSize / 2);
  assert.ok(lowShadowM < mapReach,
    `this test needs a mast whose earth shadow falls inside the map: ${lowShadowM} m vs ${mapReach} m`);

  const { stats, coverage } = sweep(planeField(), { ...LOUDEST, heightM: low });
  const ring = obstructedByEarth(coverage);
  assert.ok(ring.cells > 0, 'over a plane a positive obstruction can only be the earth');
  assert.ok(ring.farthestM > lowShadowM,
    `the earth should still be biting at the far end: ${ring.farthestM} m vs ${lowShadowM} m`);
  assert.ok(ring.nearestM > lowShadowM * 0.9,
    `and it should not begin before the horizon: ${ring.nearestM} m vs ${lowShadowM} m`);
  // Why the earth ends nothing: it costs decibels, and the budget here has room for them.
  assert.equal(stats.limitingFactor, 'map-edge', 'the picture still ends at the map');
  assert.ok(stats.linkedCells === stats.evaluatedCells,
    `${ring.cells} obstructed cells and every one of them still links`);

  // A mast a few metres up has the whole map inside its own horizon, and the earth then
  // obstructs nothing at all - which is the configuration every screenshot shows.
  const tall = sweep(planeField(), { ...LOUDEST, heightM: ANTENNA.heightLimitsM.max });
  const tallRing = obstructedByEarth(tall.coverage);
  assert.equal(tallRing.cells, 0, 'a 40 m mast sees the whole map over the curvature');
  assert.ok(shadowDistanceOf(ANTENNA.heightLimitsM.max) > mapReach, 'and the maths agrees');

  // The zone verdict is stated for a terminal up on a pole, and that terminal's horizon is
  // off this map for every legal mast, so the zone can never be earth-limited.
  for (const heightM of [low, ANTENNA.heightLimitsM.max]) {
    assert.ok(radioHorizonM(heightM, createInitialState().zoneRxHeightM) > mapReach,
      `the ${heightM} m mast's zone terminal can see past the map`);
  }
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

test('coverage: the curvature facts carry the horizon a terminal on the ground has', () => {
  const field = planeField();
  const tall = sweep(field, { ...LOUDEST, heightM: 12 });
  assert.equal(tall.stats.groundHorizonM, radioHorizonM(tall.site.heightM, 0),
    'the second horizon is the same formula with the far end on the ground');
  assert.ok(tall.stats.groundHorizonM < tall.stats.radioHorizonM,
    'and it is always the shorter of the two');
  // The reason the row carries it at all: at the lowest mast the comfortable horizon is off
  // this map while the ground-level one is inside it. If a future change makes the map
  // smaller than both, or the low mast's horizon larger than the map, the HUD clause this
  // fact feeds stops applying - and this assertion says so instead of going quiet.
  const low = sweep(field, { ...LOUDEST, heightM: ANTENNA.heightLimitsM.min });
  assert.ok(low.stats.groundHorizonM < low.stats.worldSizeM,
    `a ${ANTENNA.heightLimitsM.min} m mast should lose a ground-level terminal inside the map, `
    + `got ${low.stats.groundHorizonM.toFixed(0)} m of ${low.stats.worldSizeM.toFixed(0)}`);
  assert.ok(low.stats.radioHorizonM > low.stats.worldSizeM,
    'while the horizon for a terminal with any height is still off it');
});
