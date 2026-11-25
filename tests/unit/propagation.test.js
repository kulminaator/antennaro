/**
 * Unit tests: radio maths, terrain shadowing and the coverage grid.
 *
 * The reference numbers are textbook values (ITU-style FSPL, 6.02 dB per
 * doubling of distance or frequency, ~6 dB at a grazing knife edge) so a future
 * change to the model has to be a deliberate, documented one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RF } from '../../src/config.js';
import { approxEqual } from '../../src/math/scalar.js';
import { HeightField } from '../../src/terrain/heightfield.js';
import { generateTerrain } from '../../src/terrain/generators.js';
import { resolveSite } from '../../src/terrain/site.js';
import { createAntennaModel } from '../../src/antenna/model.js';
import { createDefaultParams } from '../../src/antenna/catalogue.js';
import { fromCompass } from '../../src/math/vec3.js';
import {
  eirpDbm, freeSpaceLossDb, freeSpaceRangeM, frequencyLabel, fresnelRadiusM, levelIndexFor, levelMarginsDb,
  linkMarginDb, receivedDbm, resolveFrequencyHz, rfSummary, wavelengthM, SPEED_OF_LIGHT_MPS,
} from '../../src/propagation/rf.js';
import {
  diffractionLossDb, hasLineOfSight, obstructionLossDb, rayProfile, requiredHeightForClearance,
} from '../../src/propagation/los.js';
import {
  SECTOR_COUNT, SECTOR_LABELS, bandFor, computeCoverage, coverageLegend, sampleCoverage, sectorIndexForAzimuth,
} from '../../src/propagation/coverage.js';

const FLAT = new HeightField({ size: 41, worldSize: 2000 }).fillFromFunction(() => 0);

/** Ground with a 200 m wide ridge at x = 0, `height` metres tall. */
function walledTerrain(height) {
  return new HeightField({ size: 81, worldSize: 2000 }).fillFromFunction((x) => (Math.abs(x) < 100 ? height : 0));
}

const SITE = { x: 0, y: 10, z: 0 };

function omniModel(tiltDeg = 0) {
  return createAntennaModel({ designId: 'omni-dipole', aim: { azimuthDeg: 0, tiltDeg }, wavelength: wavelengthM('868') });
}

test('rf: frequency selection accepts labels, MHz and hertz', () => {
  assert.equal(resolveFrequencyHz('868'), 868e6);
  assert.equal(resolveFrequencyHz(868), 868e6);
  assert.equal(resolveFrequencyHz(868e6), 868e6);
  assert.equal(resolveFrequencyHz('nope'), RF.frequenciesHz[RF.defaultFrequencyKey], 'junk falls back to the default');
  assert.equal(resolveFrequencyHz(0), RF.frequenciesHz[RF.defaultFrequencyKey]);
  assert.equal(resolveFrequencyHz(undefined), RF.frequenciesHz[RF.defaultFrequencyKey]);
  assert.equal(frequencyLabel('2400'), '2400 MHz');
  assert.equal(frequencyLabel('868'), '868 MHz');
  assert.equal(frequencyLabel(433.92e6), '433.9 MHz');
  assert.ok(approxEqual(wavelengthM('868'), SPEED_OF_LIGHT_MPS / 868e6, 1e-12));
  assert.ok(wavelengthM('433') > wavelengthM('2400'), 'lower band, longer wavelength');
});

test('rf: free-space loss matches the textbook reference numbers', () => {
  assert.equal(freeSpaceLossDb(0, '868'), 0, 'no distance, no loss');
  assert.equal(freeSpaceLossDb(-5, '868'), 0);
  assert.ok(approxEqual(freeSpaceLossDb(1000, '868'), 32.44 + 20 * Math.log10(868), 0.05), '868 MHz at 1 km');
  assert.ok(approxEqual(freeSpaceLossDb(1000, '2400'), 100.05, 0.05), '2.4 GHz at 1 km is the famous 100 dB');
  assert.ok(approxEqual(freeSpaceLossDb(100, '868'), freeSpaceLossDb(1000, '868') - 20, 1e-9), '20 dB per decade');
  const double = freeSpaceLossDb(2000, '868') - freeSpaceLossDb(1000, '868');
  assert.ok(approxEqual(double, 6.0206, 1e-3), '6.02 dB per doubling of distance');
  const higherBand = freeSpaceLossDb(1000, '2400') - freeSpaceLossDb(1000, '433');
  assert.ok(approxEqual(higherBand, 20 * Math.log10(2400 / 433), 1e-9), '6.02 dB per doubling of frequency');
  for (let d = 1; d < 3000; d += 37) {
    assert.ok(freeSpaceLossDb(d + 1, '868') > freeSpaceLossDb(d, '868'), 'monotone in distance');
  }
});

test('rf: link budget algebra', () => {
  const txPowerDbm = 27;
  const gainDbi = 10;
  assert.equal(eirpDbm(txPowerDbm, gainDbi), 37);
  assert.equal(eirpDbm(txPowerDbm, gainDbi, 2), 35, 'feeder loss comes off before the antenna');
  const rx = receivedDbm({
    txPowerDbm, gainDbi, feederLossDb: 1.5, distanceM: 800, freqHz: '868', obstructionLossDb: 7, clutterLossDb: 2,
  });
  const expected = txPowerDbm - 1.5 + gainDbi - freeSpaceLossDb(800, '868') - 7 - 2;
  assert.ok(approxEqual(rx, expected, 1e-9));
  assert.ok(approxEqual(linkMarginDb(rx, -90), rx + 90, 1e-12));
  const near = receivedDbm({ txPowerDbm, gainDbi, distanceM: 800, freqHz: '868' });
  const far = receivedDbm({ txPowerDbm, gainDbi, distanceM: 1600, freqHz: '868' });
  assert.ok(far < near, 'further is weaker');
  assert.ok(approxEqual(near - far, 6.0206, 1e-3), 'and it is 6 dB per doubling, as it should be');
  assert.ok(rx < near, 'feeder, obstruction and clutter losses all subtract');
  assert.ok(
    receivedDbm({ txPowerDbm, gainDbi, distanceM: 800, freqHz: '2400' }) < receivedDbm({ txPowerDbm, gainDbi, distanceM: 800, freqHz: '433' }),
    'the higher band arrives weaker at the same range',
  );
});

test('rf: free-space range inverts the path loss, Fresnel zones are symmetric', () => {
  const range = freeSpaceRangeM(10, 2.15, -80, '868', 0);
  const budget = 10 + 2.15 - -80;
  assert.ok(approxEqual(freeSpaceLossDb(range, '868'), budget, 1e-6), 'range is where FSPL equals the budget');
  assert.ok(range > 1000 && range < 5000, `868 MHz, 10 dBm, 2 dBi at -80 dBm is a few km (${range.toFixed(0)} m)`);
  assert.ok(freeSpaceRangeM(10, 8, -80, '868') > range, 'more gain reaches further');
  assert.ok(freeSpaceRangeM(10, 2.15, -80, '2400') < range, '2.4 GHz reaches less far at the same EIRP');

  assert.ok(approxEqual(fresnelRadiusM(500, 1500, '868'), fresnelRadiusM(1500, 500, '868'), 1e-12));
  assert.equal(fresnelRadiusM(0, 100, '868'), 0);
  assert.ok(fresnelRadiusM(1000, 1000, '868') > fresnelRadiusM(1000, 1000, '2400'), 'lower band bulges more');
  assert.ok(approxEqual(fresnelRadiusM(1000, 1000, '868'), Math.sqrt(wavelengthM('868') * 1000 * 1000 / 2000), 1e-12));

  const summary = rfSummary({
    txPowerDbm: 20, peakGainDbi: 8, feederLossDb: 1, rxSensitivityDbm: -85, freqHz: '915',
  });
  assert.ok(approxEqual(summary.eirpDbm, 27, 1e-12));
  assert.ok(summary.freeSpaceRangeM > 0);
  assert.ok(approxEqual(summary.fsplAt100mDb, freeSpaceLossDb(100, '915'), 1e-12));
});

test('rf: coverage bands are ordered thresholds above the sensitivity floor', () => {
  const margins = levelMarginsDb();
  assert.ok(margins.length >= 3);
  for (let i = 1; i < margins.length; i += 1) assert.ok(margins[i] < margins[i - 1], 'best band first');
  const sensitivity = -80;
  assert.equal(levelIndexFor(sensitivity + 50, sensitivity), 0, 'plenty of margin is the best band');
  assert.equal(levelIndexFor(sensitivity + margins[0], sensitivity), 0);
  assert.equal(levelIndexFor(sensitivity - 1, sensitivity), margins.length, 'below sensitivity there is no band');
  assert.equal(levelIndexFor(-200, sensitivity), margins.length);
  assert.ok(approxEqual(margins[0], RF.levelMarginsDb[0], 1e-12), 'margins come from configuration');
});

test('los: a clear path over flat ground has no excess', () => {
  const to = { x: 800, y: 0, z: 0 };
  const profile = rayProfile(FLAT, SITE, to);
  assert.equal(profile.points.length, RF.profileSamples + 1);
  assert.equal(profile.maxExcess, 0, 'nothing sticks up through the ray');
  assert.ok(approxEqual(profile.totalDistance, Math.hypot(800, -10), 1e-9));
  assert.equal(hasLineOfSight(FLAT, SITE, to), true);
  assert.equal(obstructionLossDb(FLAT, SITE, to, '868'), 0, 'a clear path costs nothing');
  assert.equal(requiredHeightForClearance(FLAT, SITE, to).requiredHeightM, 0);
  const first = profile.points[0];
  assert.ok(approxEqual(first.rayY, SITE.y, 1e-9), 'the ray starts at the antenna');
  assert.equal(profile.points.at(-1).terrainY, to.y, 'and ends at the receiver');
});

test('los: a ridge blocks the ray and the shadow is deepest behind it', () => {
  const wall = walledTerrain(40);
  const tx = { x: -400, y: 40, z: 0 };
  const shadow = { x: 400, y: 0, z: 0 };
  assert.equal(hasLineOfSight(wall, tx, shadow), false, 'a 40 m ridge hides a receiver at ground level');
  const profile = rayProfile(wall, tx, shadow);
  assert.ok(profile.maxExcess > 15, `the ray is buried in the far flank (${profile.maxExcess.toFixed(1)} m)`);
  assert.ok(profile.maxExcessDistance > 250 && profile.maxExcessDistance < 650,
    'the blocking point is on the ridge, not at either end');
  assert.ok(profile.d1 + profile.d2 <= profile.totalDistance + 1e-6, 'the two path segments come from the total');
  const loss = obstructionLossDb(wall, tx, shadow, '868');
  assert.ok(loss > 15, `the shadow costs real dB (${loss.toFixed(1)} dB)`);

  const tall = { x: -400, y: 150, z: 0 };
  assert.equal(hasLineOfSight(wall, tall, shadow), true, 'go above the ridge and the path is clear again');
  assert.equal(obstructionLossDb(wall, tall, shadow, '868'), 0);

  const clearance = requiredHeightForClearance(wall, tx, shadow);
  assert.ok(clearance.requiredHeightM > 15, 'the read-out says how much more mast is needed');
  assert.ok(approxEqual(clearance.requiredHeightM, profile.maxExcess, 1e-9));
  assert.equal(requiredHeightForClearance(wall, tx, { x: -200, y: 0, z: 0 }).requiredHeightM, 0,
    'a receiver in front of the ridge is already clear');

  // The same receiver, seen from a lower antenna, is worse - monotone in height.
  const lowLoss = obstructionLossDb(wall, { x: -400, y: 20, z: 0 }, shadow, '868');
  assert.ok(lowLoss > loss, `a lower antenna is shadowed harder (${lowLoss.toFixed(1)} > ${loss.toFixed(1)} dB)`);
});

test('los: diffraction loss is monotone, ~6 dB at grazing and zero when clear', () => {
  assert.equal(diffractionLossDb(-100, 500, 500, '868'), 0, 'an edge far below the ray costs nothing');
  assert.equal(diffractionLossDb(0, 0, 500, '868'), 0, 'no obstacle distance, no loss');
  const grazing = diffractionLossDb(0, 500, 500, '868');
  assert.ok(grazing > 4 && grazing < 8, `grazing incidence is about 6 dB, got ${grazing.toFixed(2)}`);
  let previous = -1;
  for (const excess of [0, 1, 5, 10, 25, 50, 200]) {
    const loss = diffractionLossDb(excess, 500, 500, '868');
    assert.ok(loss >= previous, 'deeper burial is always worse');
    previous = loss;
  }
  assert.ok(diffractionLossDb(10, 500, 500, '2400') > diffractionLossDb(10, 500, 500, '433'),
    'a longer wavelength bends over the hill better');
  assert.ok(approxEqual(diffractionLossDb(10, 300, 700, '868'), diffractionLossDb(10, 700, 300, '868'), 1e-12),
    'the edge position is symmetric in d1/d2');
});

test('coverage: sector bookkeeping is exhaustive and clockwise', () => {
  assert.equal(SECTOR_COUNT, SECTOR_LABELS.length);
  assert.deepEqual(SECTOR_LABELS, ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
  assert.equal(sectorIndexForAzimuth(0), 0, 'north');
  assert.equal(sectorIndexForAzimuth(22), 0, 'the N sector spans +-22.5 deg');
  assert.equal(sectorIndexForAzimuth(23), 1);
  assert.equal(sectorIndexForAzimuth(90), 2, 'east');
  assert.equal(sectorIndexForAzimuth(180), 4, 'south');
  assert.equal(sectorIndexForAzimuth(270), 6, 'west');
  assert.equal(sectorIndexForAzimuth(337), 7, 'north-west');
  assert.equal(sectorIndexForAzimuth(359), 0, '359 is still inside the +-22.5 deg north sector');
  assert.equal(sectorIndexForAzimuth(-10), 0, 'negative bearings wrap into north');
  const seen = new Set();
  for (let az = -720; az <= 720; az += 1) seen.add(sectorIndexForAzimuth(az));
  assert.equal(seen.size, SECTOR_COUNT, 'every sector is reachable');
});

const field = generateTerrain({ size: 81, worldSize: 2400, seed: 4242 });
const site = resolveSite(field, { heightM: 12 });
const baseCoverage = computeCoverage({
  field, site, model: omniModel(), freqHz: '868', txPowerDbm: 10, maxRangeM: 1000,
});

test('coverage: the grid agrees with its own statistics', () => {
  const { stats } = baseCoverage;
  assert.equal(baseCoverage.size, field.size);
  assert.equal(stats.cells, field.size * field.size);
  assert.ok(stats.evaluatedCells > 1000, 'most of the map inside the range is evaluated');
  assert.ok(stats.evaluatedCells < stats.cells, 'the near-field footprint and the range limit are skipped');

  let linked = 0;
  let evaluated = 0;
  let bandTotal = 0;
  for (let i = 0; i < baseCoverage.evaluated.length; i += 1) {
    if (!baseCoverage.evaluated[i]) continue;
    evaluated += 1;
    assert.ok(Number.isFinite(baseCoverage.rssi[i]), 'no NaN RSSI');
    if (baseCoverage.rssi[i] >= baseCoverage.sensitivityDbm) linked += 1;
    bandTotal += baseCoverage.stats.levelCounts[baseCoverage.level[i]] !== undefined ? 0 : 1;
    assert.ok(baseCoverage.level[i] <= RF.levelMarginsDb.length, 'band index is valid');
    assert.ok(baseCoverage.distanceM[i] >= 0 && baseCoverage.obstructionDb[i] >= 0);
  }
  assert.equal(evaluated, stats.evaluatedCells);
  assert.equal(linked, stats.linkedCells);
  assert.equal(bandTotal, 0, 'every cell carries a known band');
  assert.equal(stats.levelCounts.reduce((a, b) => a + b, 0), stats.evaluatedCells, 'bands cover every cell');
  assert.ok(approxEqual(stats.linkAvailabilityPct, (100 * linked) / evaluated, 1e-9));
  assert.equal(stats.sectors.length, SECTOR_COUNT);
  assert.equal(stats.sectors.reduce((acc, sector) => acc + sector.evaluated, 0), stats.evaluatedCells,
    'the per-sector table accounts for every evaluated cell');
  assert.ok(approxEqual(stats.bestDbm, Math.max(...Array.from(baseCoverage.rssi).filter((_, i) => baseCoverage.evaluated[i])), 1e-3));
});

test('coverage: the mountain shadows the north while the east reaches out', () => {
  const north = baseCoverage.stats.sectors.find((sector) => sector.label === 'N');
  const east = baseCoverage.stats.sectors.find((sector) => sector.label === 'E');
  assert.ok(east.linkedPct > north.linkedPct + 10,
    `east links ${east.linkedPct.toFixed(1)}% vs north ${north.linkedPct.toFixed(1)}%`);
  assert.ok(east.maxRangeM > north.maxRangeM, 'the flat field is reachable further than the valley behind the ridge');

  let northObstruction = 0;
  let northCount = 0;
  let eastObstruction = 0;
  let eastCount = 0;
  field.forEachCell((x, z, h, index) => {
    if (!baseCoverage.evaluated[index]) return;
    const az = (Math.atan2(x, -z) * 180) / Math.PI;
    if (sectorIndexForAzimuth(az) === 0) {
      northObstruction += baseCoverage.obstructionDb[index];
      northCount += 1;
    } else if (sectorIndexForAzimuth(az) === 2) {
      eastObstruction += baseCoverage.obstructionDb[index];
      eastCount += 1;
    }
  });
  assert.ok(northObstruction / northCount > eastObstruction / eastCount + 2,
    'the mountain really diffracts the signal');
});

test('coverage: switching terrain shadowing off makes the shadow disappear', () => {
  const freeSpace = computeCoverage({
    field, site, model: omniModel(), freqHz: '868', txPowerDbm: 10, maxRangeM: 1000, useDiffraction: false,
  });
  let withLoss = 0;
  let withoutLoss = 0;
  for (let i = 0; i < baseCoverage.evaluated.length; i += 1) {
    if (!baseCoverage.evaluated[i]) continue;
    withLoss += baseCoverage.rssi[i];
    withoutLoss += freeSpace.rssi[i];
  }
  assert.ok(withoutLoss > withLoss, 'free space is always at least as strong as diffracted');
  assert.ok(freeSpace.stats.maxLinkedRangeM >= baseCoverage.stats.maxLinkedRangeM);
  let anyObstruction = false;
  for (let i = 0; i < freeSpace.obstructionDb.length; i += 1) anyObstruction = anyObstruction || freeSpace.obstructionDb[i] > 0;
  assert.equal(anyObstruction, false, 'with shadowing disabled no cell carries obstruction loss');
});

test('coverage: aiming a beam east moves the coverage, and power extends it', () => {
  const aimedEast = createAntennaModel({
    designId: 'yagi',
    params: createDefaultParams('yagi'),
    aim: { azimuthDeg: 90, tiltDeg: 0 },
    wavelength: wavelengthM('868'),
  });
  const aimedNorth = createAntennaModel({
    designId: 'yagi',
    params: createDefaultParams('yagi'),
    aim: { azimuthDeg: 0, tiltDeg: 0 },
    wavelength: wavelengthM('868'),
  });
  const options = { field, site, freqHz: '868', txPowerDbm: 10, maxRangeM: 1200 };
  const eastRun = computeCoverage({ ...options, model: aimedEast });
  const northRun = computeCoverage({ ...options, model: aimedNorth });
  const eastEast = eastRun.stats.sectors.find((s) => s.label === 'E').linked;
  const northEast = northRun.stats.sectors.find((s) => s.label === 'E').linked;
  const northNorth = northRun.stats.sectors.find((s) => s.label === 'N').linked;
  const eastNorth = eastRun.stats.sectors.find((s) => s.label === 'N').linked;
  assert.ok(eastEast > northEast, 'pointing east links more eastern cells');
  assert.ok(northNorth > eastNorth, 'and pointing north links more northern cells');

  // The map is only 2400 m wide, so maxLinkedRange saturates; area is the honest measure.
  const louder = computeCoverage({ ...options, model: aimedEast, txPowerDbm: 20 });
  assert.ok(louder.stats.linkedCells > eastRun.stats.linkedCells * 1.2, '10 dB more power serves a lot more ground');
  assert.ok(louder.stats.linkAvailabilityPct > eastRun.stats.linkAvailabilityPct);
  assert.ok(approxEqual(louder.stats.meanDbm - eastRun.stats.meanDbm, 10, 0.2), 'every cell gains exactly the extra 10 dB');

  const greedy = computeCoverage({ ...options, model: aimedEast, rxSensitivityDbm: -60 });
  assert.ok(greedy.stats.linkedCells < eastRun.stats.linkedCells, 'a less sensitive receiver sees less coverage');

  const cluttered = computeCoverage({ ...options, model: aimedEast, clutterLossDb: 12 });
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
    assert.ok(samples[i].distanceM > samples[i - 1].distanceM - 1);
  }
  assert.ok(samples.at(-1).rssi - samples[0].rssi < -15, 'almost a kilometre out is more than 15 dB quieter');
});

test('coverage: sampling respects the grid and the range limit', () => {
  assert.equal(sampleCoverage(baseCoverage, field, 90_000, 0), null, 'off the map');
  assert.equal(sampleCoverage(baseCoverage, field, 5, 5), null, 'inside the transmitter footprint');
  assert.equal(sampleCoverage(baseCoverage, field, 5000, 0), null, 'beyond the evaluation range');
  const probe = sampleCoverage(baseCoverage, field, 400, 0);
  assert.ok(probe && Number.isFinite(probe.rssiDbm));
  const legend = coverageLegend(baseCoverage);
  assert.equal(legend.length, RF.levelMarginsDb.length);
  for (let i = 1; i < legend.length; i += 1) {
    assert.ok(legend[i].minDbm < legend[i - 1].minDbm, 'legend thresholds descend');
  }
  assert.equal(bandFor(legend[0].minDbm, baseCoverage), 0);
  assert.equal(bandFor(-200, baseCoverage), RF.levelMarginsDb.length);
});

test('coverage: the same inputs give byte-identical output', () => {
  const again = computeCoverage({
    field, site, model: omniModel(), freqHz: '868', txPowerDbm: 10, maxRangeM: 1000,
  });
  assert.deepEqual(Array.from(again.rssi), Array.from(baseCoverage.rssi));
  assert.deepEqual(Array.from(again.level), Array.from(baseCoverage.level));
  assert.deepEqual(again.stats, baseCoverage.stats);
});

test('coverage: downtilt trades horizon reach for ground under the mast', () => {
  const tower = resolveSite(field, { heightM: 30 });
  const flatTop = createAntennaModel({
    designId: 'omni-collinear',
    params: { elements: 8, spacingLambda: 0.5 },
    aim: { azimuthDeg: 0, tiltDeg: 0 },
    wavelength: wavelengthM('868'),
  });
  const downtilted = createAntennaModel({
    designId: 'omni-collinear',
    params: { elements: 8, spacingLambda: 0.5 },
    aim: { azimuthDeg: 0, tiltDeg: -25 },
    wavelength: wavelengthM('868'),
  });
  const options = { field, site: tower, freqHz: '868', txPowerDbm: 10, maxRangeM: 1400 };
  const level = computeCoverage({ ...options, model: flatTop });
  const down = computeCoverage({ ...options, model: downtilted });
  assert.ok(down.stats.linkAvailabilityPct < level.stats.linkAvailabilityPct - 10,
    `a flat-top omni steered 25 deg down wastes power on the hillside (${down.stats.linkAvailabilityPct.toFixed(1)}% vs ${level.stats.linkAvailabilityPct.toFixed(1)}%)`);
  const patch = (beamTiltDeg) => createAntennaModel({
    designId: 'patch',
    params: { sizeLambda: 1, beamTiltDeg },
    aim: { azimuthDeg: 0, tiltDeg: 0, beamTiltDeg },
    wavelength: wavelengthM('868'),
  });
  const panelRuns = [0, 6, 15, 20].map((beamTiltDeg) => computeCoverage({
    field, site, freqHz: '868', txPowerDbm: 10, maxRangeM: 1400, model: patch(beamTiltDeg),
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
  const options = { field, site, model: omniModel(0), freqHz: '868', txPowerDbm: 10, maxRangeM: 1400 };
  const low = computeCoverage({ ...options, freqHz: '433' });
  const mid = computeCoverage({ ...options, freqHz: '868' });
  const wifi = computeCoverage({ ...options, freqHz: '2400' });
  const millimetre = computeCoverage({ ...options, freqHz: '5800' });
  assert.ok(low.stats.maxLinkedRangeM > mid.stats.maxLinkedRangeM, '433 MHz reaches past 868 MHz');
  assert.ok(mid.stats.maxLinkedRangeM > wifi.stats.maxLinkedRangeM, '868 MHz reaches past 2.4 GHz');
  assert.ok(wifi.stats.maxLinkedRangeM > millimetre.stats.maxLinkedRangeM, '2.4 GHz reaches past 5.8 GHz');
  assert.ok(mid.stats.linkAvailabilityPct > wifi.stats.linkAvailabilityPct + 10, 'and serves far more ground');
});

test('coverage: a direction that points at the sky serves nobody', () => {
  const skyward = createAntennaModel({
    designId: 'yagi',
    params: createDefaultParams('yagi'),
    aim: { azimuthDeg: 0, tiltDeg: 60 },
    wavelength: wavelengthM('868'),
  });
  const run = computeCoverage({ field, site, model: skyward, freqHz: '868', txPowerDbm: 10, maxRangeM: 1000 });
  const horizon = computeCoverage({ field, site, model: omniModel(), freqHz: '868', txPowerDbm: 10, maxRangeM: 1000 });
  assert.ok(run.stats.maxLinkedRangeM < horizon.stats.maxLinkedRangeM);
  const boresight = fromCompass(0, 60);
  assert.ok(approxEqual(skyward.gainDbiForDirection(boresight), skyward.peakGainDbi, 1e-9),
    'the beam is where the user aimed it, even if that is at a cloud');
});
