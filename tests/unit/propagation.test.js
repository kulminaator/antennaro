/**
 * Unit tests: the radio maths and the terrain ray - FSPL, Fresnel zones, diffraction
 * and line-of-sight profiles.
 *
 * The reference numbers are textbook values (ITU-style FSPL, 6.02 dB per
 * doubling of distance or frequency, ~6 dB at a grazing knife edge) so a future
 * change to the model has to be a deliberate, documented one.
 *
 * The coverage *grid* has its own files: `coverage.test.js` for what the sweep
 * promises (whole-map evaluation, the budget pre-filter, what the statistics mean)
 * and `coveragebehaviour.test.js` for how it behaves over real ground.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RF } from '../../src/config.js';
import { approxEqual } from '../../src/math/scalar.js';
import { HeightField } from '../../src/terrain/heightfield.js';
import {
  eirpDbm, freeSpaceLossDb, freeSpaceRangeM, frequencyLabel, fresnelRadiusM, levelIndexFor, levelMarginsDb,
  linkMarginDb, receivedDbm, resolveFrequencyHz, rfSummary, wavelengthM, SPEED_OF_LIGHT_MPS,
} from '../../src/propagation/rf.js';
import {
  diffractionLossDb, hasLineOfSight, obstructionLossDb, rayProfile, requiredHeightForClearance,
} from '../../src/propagation/los.js';

const FLAT = new HeightField({ size: 41, worldSize: 2000 }).fillFromFunction(() => 0);

/** Ground with a 200 m wide ridge at x = 0, `height` metres tall. */
function walledTerrain(height) {
  return new HeightField({ size: 81, worldSize: 2000 }).fillFromFunction((x) => (Math.abs(x) < 100 ? height : 0));
}

const SITE = { x: 0, y: 10, z: 0 };

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
