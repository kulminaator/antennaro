/**
 * Unit tests: what the radio configuration does to the served ground.
 *
 * Layer: test (unit).
 *
 * Aiming, power, receiver sensitivity, clutter, downtilt, frequency and determinism: each
 * of these has to move the reachable area in the direction the physics says, by an amount
 * the model can explain, and never as a dice roll. The ground's own behaviour - the wall
 * that blocks a bearing, shadowing switched off, how much curved earth the sweep walked -
 * lives in coverageshadow.test.js.

 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { approxEqual } from '../../src/math/scalar.js';
import { HeightField } from '../../src/terrain/heightfield.js';
import { generateTerrain } from '../../src/terrain/generators.js';
import { resolveSite } from '../../src/terrain/site.js';
import { createAntennaModel } from '../../src/antenna/model.js';
import { createDefaultParams } from '../../src/antenna/catalogue.js';
import { fromCompass } from '../../src/math/vec3.js';
import { sampleCoverage, sectorIndexForAzimuth } from '../../src/propagation/coverage.js';
import { computeCoverage } from '../../src/propagation/coverage.js';
import { earthBulgeM, radioHorizonM, wavelengthM } from '../../src/propagation/rf.js';

const freqHz = 868e6;
const field = generateTerrain({ size: 81, worldSize: 2400, seed: 4242 });
const site = resolveSite(field, { heightM: 12 });

function omni(tiltDeg = 0) {
  return createAntennaModel({ designId: 'omni-dipole', aim: { azimuthDeg: 0, tiltDeg }, wavelength: wavelengthM(freqHz) });
}

function yagi(azimuthDeg) {
  return createAntennaModel({
    designId: 'yagi', params: createDefaultParams('yagi'),
    aim: { azimuthDeg, tiltDeg: 0 }, wavelength: wavelengthM(freqHz),
  });
}

/**
 * Ground flat as a table, and big - comfortably beyond the reach of the link under
 * test, so when the drape stops, it is the link that stopped and not the edge of the
 * world. That distinction is the point of the tests that use it.
 */
function flatField() {
  const flat = new HeightField({ size: 41, worldSize: 8000 }).fillFromFunction(() => 0);
  return { field: flat, site: resolveSite(flat, { heightM: 12 }) };
}

const baseCoverage = computeCoverage({
  field, site, model: omni(), freqHz, txPowerDbm: 10, maxRangeM: 1000,
});

/** The map the user boots into, mast on the centre saddle. */
const map = generateTerrain();
const mapSite = resolveSite(map, { heightM: 12 });

test('coverage: aiming a beam moves the ground it serves', () => {
  // Flat ground, so the pattern is the only thing that differs between the two runs.
  const flat = flatField();
  const options = { field: flat.field, site: flat.site, freqHz, txPowerDbm: 10 };
  const eastRun = computeCoverage({ ...options, model: yagi(90) });
  const northRun = computeCoverage({ ...options, model: yagi(0) });
  const sector = (run, label) => run.stats.sectors.find((s) => s.label === label);
  assert.equal(eastRun.stats.limitingFactor, 'budget',
    'over flat ground on a map big enough, the beam ends where the link ends');
  assert.ok(sector(eastRun, 'E').linkedPct > 90, 'dead ahead is served');
  assert.ok(sector(eastRun, 'W').linkedPct < sector(eastRun, 'E').linkedPct - 60,
    `behind the beam there is little to see: ${sector(eastRun, 'W').linkedPct.toFixed(0)}% vs ${sector(eastRun, 'E').linkedPct.toFixed(0)}%`);
  assert.ok(sector(eastRun, 'E').maxRangeM > 2 * sector(eastRun, 'W').maxRangeM,
    'the front lobe reaches much further than the back');
  assert.ok(sector(eastRun, 'E').linked > sector(northRun, 'E').linked, 'pointing east links more eastern ground');
  assert.ok(sector(northRun, 'N').linked > sector(eastRun, 'N').linked, 'and pointing north links more northern ground');
});

test('coverage: power, receiver and clutter all move the reachable area', () => {
  const options = { field, site, freqHz, txPowerDbm: 10, maxRangeM: 2400, budgetPrefilter: false };
  const eastRun = computeCoverage({ ...options, model: yagi(90) });
  // The pre-filter is off here on purpose: the promise under test is that every
  // *evaluated* point gains exactly the extra dB, and the dismissed tail is by
  // definition not evaluated. See `coverage.test.js` for the equivalence proof.
  const louder = computeCoverage({ ...options, model: yagi(90), txPowerDbm: 20 });
  assert.ok(louder.stats.linkedCells > eastRun.stats.linkedCells * 1.2, '10 dB more power serves a lot more ground');
  assert.ok(louder.stats.linkAvailabilityPct > eastRun.stats.linkAvailabilityPct);
  assert.ok(approxEqual(louder.stats.meanDbm - eastRun.stats.meanDbm, 10, 0.2),
    'every evaluated point gains exactly the extra 10 dB');
  assert.ok(louder.stats.maxLinkedRangeM > eastRun.stats.maxLinkedRangeM, 'and the reach grows with it');

  const greedy = computeCoverage({ ...options, model: yagi(90), rxSensitivityDbm: -60 });
  assert.ok(greedy.stats.linkedCells < eastRun.stats.linkedCells, 'a less sensitive receiver sees less coverage');

  const cluttered = computeCoverage({ ...options, model: yagi(90), clutterLossDb: 12 });
  assert.ok(cluttered.stats.maxLinkedRangeM < eastRun.stats.maxLinkedRangeM, 'clutter eats range');
});

test('coverage: RSSI falls off with distance along a clear bearing', () => {
  const samples = [];
  for (let distance = 120; distance <= 900; distance += 60) {
    const sample = sampleCoverage(baseCoverage, field, distance, 0);
    if (sample) samples.push({ distanceM: sample.distanceM, rssi: sample.rssiDbm });
  }
  assert.ok(samples.length > 8, 'the east bearing is evaluated out to the range limit');
  for (let i = 1; i < samples.length; i += 1) {
    assert.ok(samples[i].rssi < samples[i - 1].rssi + 3,
      `RSSI roughly follows distance (${samples[i - 1].rssi.toFixed(1)} -> ${samples[i].rssi.toFixed(1)})`);
    assert.ok(samples[i].distanceM > samples[i - 1].distanceM - field.cellSize * baseCoverage.stride);
  }
  assert.ok(samples.at(-1).rssi - samples[0].rssi < -15, 'almost a kilometre out is more than 15 dB quieter');
});

test('coverage: downtilt trades horizon reach for ground under the mast', () => {
  const tower = resolveSite(field, { heightM: 30 });
  const flatTop = createAntennaModel({
    designId: 'omni-collinear',
    params: { elements: 8, spacingLambda: 0.5 },
    aim: { azimuthDeg: 0, tiltDeg: 0 },
    wavelength: wavelengthM(freqHz),
  });
  const downtilted = createAntennaModel({
    designId: 'omni-collinear',
    params: { elements: 8, spacingLambda: 0.5 },
    aim: { azimuthDeg: 0, tiltDeg: -25 },
    wavelength: wavelengthM(freqHz),
  });
  const options = { field, site: tower, freqHz, txPowerDbm: 10, maxRangeM: 1400 };
  const level = computeCoverage({ ...options, model: flatTop });
  const down = computeCoverage({ ...options, model: downtilted });
  assert.ok(down.stats.linkAvailabilityPct < level.stats.linkAvailabilityPct - 10,
    `a flat-top omni steered 25 deg down wastes power on the hillside (${down.stats.linkAvailabilityPct.toFixed(1)}% vs ${level.stats.linkAvailabilityPct.toFixed(1)}%)`);
  const patch = (beamTiltDeg) => createAntennaModel({
    designId: 'patch',
    params: { sizeLambda: 1, beamTiltDeg },
    aim: { azimuthDeg: 0, tiltDeg: 0, beamTiltDeg },
    wavelength: wavelengthM(freqHz),
  });
  const panelRuns = [0, 6, 15, 20].map((beamTiltDeg) => computeCoverage({
    field, site, freqHz, txPowerDbm: 10, maxRangeM: 1400, model: patch(beamTiltDeg),
  }));
  for (let i = 1; i < panelRuns.length; i += 1) {
    assert.ok(panelRuns[i].stats.linkedCells <= panelRuns[i - 1].stats.linkedCells,
      'more electrical downtilt never serves more ground from a 12 m mast');
    assert.ok(panelRuns[i].stats.maxLinkedRangeM <= panelRuns[i - 1].stats.maxLinkedRangeM,
      'and it never reaches further');
  }
  assert.ok(panelRuns[3].stats.linkedCells < panelRuns[0].stats.linkedCells, 'steering 20 deg down does cost area');
});

test('coverage: frequency decides reach more than anything else does', () => {
  const options = { field, site, model: omni(0), freqHz, txPowerDbm: 10, maxRangeM: 1400 };
  const low = computeCoverage({ ...options, freqHz: '433' });
  const mid = computeCoverage({ ...options, freqHz: '868' });
  const wifi = computeCoverage({ ...options, freqHz: '2400' });
  const millimetre = computeCoverage({ ...options, freqHz: '5800' });
  assert.ok(low.stats.maxLinkedRangeM > mid.stats.maxLinkedRangeM, '433 MHz reaches past 868 MHz');
  assert.ok(mid.stats.maxLinkedRangeM > wifi.stats.maxLinkedRangeM, '868 MHz reaches past 2.4 GHz');
  assert.ok(wifi.stats.maxLinkedRangeM > millimetre.stats.maxLinkedRangeM, '2.4 GHz reaches past 5.8 GHz');
  // Ground served, not "share of the possible": the possible ground shrinks with the
  // band too, so only the map-relative number says the lower band served more *world*.
  assert.ok(mid.stats.mapCoveragePct > wifi.stats.mapCoveragePct + 5, 'and serves far more of the map');
  assert.ok(mid.stats.linkedCells > wifi.stats.linkedCells * 1.5, 'in points as well as in percentage');
});

test('coverage: a direction that points at the sky serves nobody', () => {
  const skyward = createAntennaModel({
    designId: 'yagi',
    params: createDefaultParams('yagi'),
    aim: { azimuthDeg: 0, tiltDeg: 60 },
    wavelength: wavelengthM(freqHz),
  });
  const run = computeCoverage({ field, site, model: skyward, freqHz, txPowerDbm: 10, maxRangeM: 1000 });
  const horizon = computeCoverage({ field, site, model: omni(), freqHz, txPowerDbm: 10, maxRangeM: 1000 });
  assert.ok(run.stats.maxLinkedRangeM < horizon.stats.maxLinkedRangeM);
  const boresight = fromCompass(0, 60);
  assert.ok(approxEqual(skyward.gainDbiForDirection(boresight), skyward.peakGainDbi, 1e-9),
    'the beam is where the user aimed it, even if that is at a cloud');
});

test('coverage: the model is not a dice roll - same inputs, byte-identical output', () => {
  const again = computeCoverage({
    field, site, model: omni(), freqHz, txPowerDbm: 10, maxRangeM: 1000,
  });
  assert.deepEqual(Array.from(again.rssi), Array.from(baseCoverage.rssi));
  assert.deepEqual(Array.from(again.level), Array.from(baseCoverage.level));
  assert.deepEqual(again.stats, baseCoverage.stats);
});
