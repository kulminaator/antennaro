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

import { RF, WORLD } from '../../src/config.js';
import { approxEqual } from '../../src/math/scalar.js';
import { HeightField } from '../../src/terrain/heightfield.js';
import {
  earthBulgeM, eirpDbm, freeSpaceLossDb, freeSpaceRangeM, frequencyLabel, fresnelRadiusM, levelIndexFor,
  levelMarginsDb, linkMarginDb, radioHorizonM, receivedDbm, resolveFrequencyHz, rfSummary, wavelengthM,
  SPEED_OF_LIGHT_MPS,
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
  assert.ok(profile.diffractionD1 + profile.diffractionD2 <= profile.totalDistance + 1e-6,
    'the two segments the loss is charged over come from the total');
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

test('los: neither end of the ray is allowed to be the obstacle', () => {
  // The transmitter is in the air and the receiver sits on the ground it is being
  // measured against, so "the ground at the far end" is not a thing that can cut the
  // ray: it *is* the ray's endpoint. If either end were judged, a perfectly flat world
  // would report an obstruction of exactly zero on every single path - which reads as
  // "clear" only until someone asks why maxExcess is never negative.
  const to = { x: 3600, y: 0, z: 0 };
  const profile = rayProfile(FLAT, SITE, to, { freqHz: '868' });
  assert.equal(hasLineOfSight(FLAT, SITE, to), true);
  assert.equal(obstructionLossDb(FLAT, SITE, to, '868'), 0);
  assert.equal(profile.maxExcess, 0, 'the ray touches the receiver ground, it is not in it');
  assert.ok(profile.maxExcessDistance < profile.totalDistance, 'the worst point is not the receiver itself');
  assert.equal(profile.points.at(-1).terrainY, to.y, 'the last sample is the receiver, not the terrain');
  assert.ok(profile.points.at(-1).excess <= 0, 'and it is never counted as an obstruction');
  assert.equal(profile.points[0].terrainY, 0, 'the first sample still reports the ground under the mast');
  assert.equal(profile.points[0].clearance, Infinity, 'the zone has no width at the antenna, so no verdict');
  assert.equal(profile.points.at(-1).clearance, Infinity, 'nor at the receiver');

  // Same thing on real ground: a receiver at the bottom of a swale, with the rim behind
  // it. The rim is beyond the receiver and must not appear on this path at all.
  const swale = new HeightField({ size: 81, worldSize: 2000 })
    .fillFromFunction((x) => (x > 1100 ? 30 : (x > 900 ? 30 - (1100 - x) * 0.15 : 0)));
  const low = { x: 900, y: 0, z: 0 };
  assert.equal(hasLineOfSight(swale, SITE, low), true, 'a wall behind the receiver is not on the path');
  assert.equal(obstructionLossDb(swale, SITE, low, '868'), 0);
});

test('los: the ground a receiver stands on is not an obstacle, unless it is a plateau', () => {
  // A receiver at the top of a hill sees everything, however low its transmitter is 1 km
  // away: the flank falls away faster than the chord arrives. If the ray's own endpoint
  // were judged as an obstruction, this path - worst excess -3 m, nowhere near the ground
  // - would report the knife-edge loss of a grazing ray, about 6 dB, on every clear path
  // in the app. That is what this first half pins.
  const cone = new HeightField({ size: 201, worldSize: 2000 })
    .fillFromFunction((x, z) => {
      const r = Math.hypot(x - 800, z);
      return r < 120 ? (120 - r) * 0.45 : 0;
    });
  const apex = { x: 800, y: cone.sample(800, 0), z: 0 };
  assert.ok(apex.y > 40, `the receiver is on a 40 m hill (${apex.y.toFixed(0)} m)`);
  for (const txY of [10, 20, 40, 80]) {
    const from = { x: 0, y: txY, z: 0 };
    const profile = rayProfile(cone, from, apex, { freqHz: '868' });
    assert.ok(profile.worstExcess < -1,
      `a 1 km path to a hilltop misses the ground by ${(-profile.worstExcess).toFixed(1)} m (tx at ${txY} m)`);
    assert.equal(hasLineOfSight(cone, from, apex), true, `tx at ${txY} m sees the summit`);
    assert.equal(obstructionLossDb(cone, from, apex, '868'), 0, 'and pays nothing for it');
  }

  // The exception is real physics, not an endpoint bug: stand in the middle of a flat
  // tableland and the plateau's own far edge is a ridge in front of you. A 10 m mast 800 m
  // below is 3.2 m under that edge, and the shadow is ~14 dB. The blocking point is on the
  // edge, strictly inside the path, and both of the ways out of it behave like a hill:
  // climb, or stand up.
  const mesa = new HeightField({ size: 201, worldSize: 2000 }).fillFromFunction((x, z) => {
    const off = Math.abs(x - 800);
    if (off < 60 && Math.abs(z) < 400) return 54;
    return off < 120 ? 54 * (1 - (off - 60) / 60) : 0;
  });
  const top = { x: 800, y: mesa.sample(800, 0), z: 0 };
  const low = { x: 0, y: 10, z: 0 };
  const buried = rayProfile(mesa, low, top, { freqHz: '868' });
  assert.ok(buried.worstExcess > 1, `the plateau's edge is above the ray (${buried.worstExcess.toFixed(1)} m)`);
  assert.ok(buried.maxExcessDistance > 0 && buried.maxExcessDistance < buried.totalDistance - 1,
    `and it is the far edge that blocks, not the receiver (${buried.maxExcessDistance.toFixed(0)} m of ${buried.totalDistance.toFixed(0)})`);
  assert.ok(obstructionLossDb(mesa, low, top, '868') > 10, 'which costs real dB');
  assert.equal(hasLineOfSight(mesa, { x: 0, y: 60, z: 0 }, top), true, 'a mast above the plateau horizon sees it');
  assert.equal(hasLineOfSight(mesa, low, { x: top.x, y: top.y + 4, z: 0 }), true,
    'so does the same 10 m mast, when the receiver is 4 m off the ground');
  assert.equal(hasLineOfSight(mesa, low, top), false, 'while a receiver lying on the plateau floor does not');
});

test('rf: the earth bulges under a ray, exactly as much as the geometry says', () => {
  const k = 1.413;
  const R = 6_371_000;
  // Hand-worked midpoint of a 2.6 km path: (1300 * 1300) / (2 * 1.413 * 6371000).
  const mid = (1300 * 1300) / (2 * k * R);
  assert.ok(approxEqual(earthBulgeM(1300, 1300, k, R), mid, 1e-12), `0.094 m at 2.6 km, got ${earthBulgeM(1300, 1300, k, R).toFixed(4)}`);
  assert.ok(earthBulgeM(1300, 1300, k, R) < 0.1, 'and that is the largest it gets anywhere on a 5.2 km map');
  assert.equal(earthBulgeM(0, 2600, k, R), 0, 'no bulge at either end');
  assert.equal(earthBulgeM(2600, 0, k, R), 0);
  assert.equal(earthBulgeM(-100, 2600, k, R), 0, 'a nonsense distance cannot buy negative ground');

  // Square in the path length, symmetric in the split, and reduced by more refraction.
  const far = earthBulgeM(2600, 2600, k, R);
  assert.ok(approxEqual(far, 4 * mid, 1e-9), 'double the path, four times the bulge');
  assert.ok(approxEqual(earthBulgeM(800, 1800, k, R), earthBulgeM(1800, 800, k, R), 1e-12), 'the split is symmetric');
  assert.ok(earthBulgeM(800, 1800, k, R) < mid, 'a split nearer one end bulges less than the middle');
  assert.ok(earthBulgeM(1300, 1300, 4 / 3, R) > earthBulgeM(1300, 1300, 2, R), 'more refraction lifts the ray higher off the ground');
  assert.equal(earthBulgeM(1300, 1300, 0, R), 0, 'k <= 0 is the flat-earth switch, for tests only');
});

test('rf: the radio horizon is the textbook tangent sum, and beyond this map', () => {
  const k = 1.413;
  const R = 6_371_000;
  // The classic `d = sqrt(2kR) * (sqrt(h1) + sqrt(h2))`: 10.2 km for 2 m and 1 m.
  const textbook = Math.sqrt(2 * k * R) * (Math.sqrt(2) + Math.sqrt(1));
  const ours = radioHorizonM(2, 1, k, R);
  assert.ok(Math.abs(ours / textbook - 1) < 0.01, `${ours.toFixed(0)} m against the textbook ${textbook.toFixed(0)} m`);
  assert.ok(radioHorizonM(4, 1, k, R) > radioHorizonM(2, 1, k, R), 'higher at either end sees further');
  assert.ok(radioHorizonM(4, 2, k, R) > radioHorizonM(2, 2, k, R));
  assert.equal(radioHorizonM(2, 1, k, R), radioHorizonM(1, 2, k, R), 'either end can carry the height');
  assert.equal(radioHorizonM(0, 0, k, R), 0, 'two antennas lying on the ground see nothing over the curve');
  assert.equal(radioHorizonM(2, 1, 0, R), Infinity, 'a flat earth has no horizon');
  assert.ok(radioHorizonM(2, 1) > WORLD.worldSize,
    'and with the app k, an ordinary link horizon is off the map entirely');
  // Scale of the thing, so nobody has to guess whether the round earth matters here:
  // 0.19 m for a mast at the centre to a corner, 0.75 m for the corner-to-corner
  // diagonal, the longest path this map contains.
  const centreToCorner = WORLD.worldSize / 2 * Math.SQRT2 / 2;
  assert.ok(earthBulgeM(centreToCorner, centreToCorner) < 0.2, 'centre to corner bulges under 0.2 m');
  assert.ok(earthBulgeM(WORLD.worldSize / 2, WORLD.worldSize / 2) < 0.8,
    'and the longest link the map allows bulges under 0.8 m');
});
