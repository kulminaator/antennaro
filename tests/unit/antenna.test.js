/**
 * Unit tests: pattern maths, aiming frames and the resolved antenna model.
 *
 * These are the physics assertions. They are written against textbook
 * expectations (a dipole is null along its axis, a Yagi's back lobe sits at its
 * front-to-back ratio, more gain means a narrower beam) so that a change in the
 * pattern model has to be a deliberate, argued change.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { approxEqual, degToRad, radToDeg } from '../../src/math/scalar.js';
import { AXIS_Y, fromCompass, toCompass } from '../../src/math/vec3.js';
import {
  PATTERN_FLOOR_DB, azimuthDb, azimuthOffsetRad, beamwidthFromShape, collinearDb, createCollinearArray, dipoleDb,
  elevationDb, frontToBackFromPattern, lobeRadius, mainLobeDb, relativeFactor, toDbi,
} from '../../src/antenna/pattern.js';
import {
  bearingTo, boresightDirection, compassLabel, createAimFrame, describeAim, directionTo, effectiveTiltDeg,
  elevationTo, localAnglesToDirection, normaliseAim, worldToLocalAngles,
} from '../../src/antenna/aim.js';
import { createAntennaModel } from '../../src/antenna/model.js';
import { createDefaultParams } from '../../src/antenna/catalogue.js';
import { wavelengthM } from '../../src/propagation/rf.js';

const LAMBDA_868 = wavelengthM(868e6);

/** Cross product + triple product: +1 for a right-handed basis. */
function determinant(a, b, c) {
  const cross = { x: b.y * c.z - b.z * c.y, y: b.z * c.x - b.x * c.z, z: b.x * c.y - b.y * c.x };
  return a.x * cross.x + a.y * cross.y + a.z * cross.z;
}

test('pattern: main lobe is 0 dB at boresight and -3 dB at half the beamwidth', () => {
  for (const beamwidthDeg of [10, 30, 60, 90, 120]) {
    const half = degToRad(beamwidthDeg / 2);
    assert.ok(approxEqual(mainLobeDb(0, half * 2), 0, 1e-9), 'peak');
    assert.ok(approxEqual(mainLobeDb(half, half * 2), -3, 1e-6), `-3 dB at +bw/2 for ${beamwidthDeg} deg`);
    assert.ok(approxEqual(mainLobeDb(-half, half * 2), -3, 1e-6), '-3 dB is symmetric');
    let previous = 0;
    for (let deg = 0; deg <= 179; deg += 3) {
      const value = mainLobeDb(degToRad(deg), half * 2);
      assert.ok(value <= previous + 1e-9, `main lobe must fall monotonically (${deg} deg)`);
      assert.ok(value >= PATTERN_FLOOR_DB, 'never below the floor');
      previous = value;
    }
    assert.equal(previous, PATTERN_FLOOR_DB, 'far off-boresight sits on the floor');
  }
});

test('pattern: azimuth shape respects the front-to-back ratio and the floor', () => {
  const spec = { beamwidthDeg: 60, sidelobeDb: -18, backToFrontDb: 24 };
  assert.equal(azimuthDb(0, spec), 0, 'boresight is the reference');
  assert.ok(approxEqual(azimuthDb(Math.PI, spec), -24, 0.6), 'the back lobe sits at the front-to-back ratio');
  assert.ok(approxEqual(azimuthDb(-Math.PI, spec), azimuthDb(Math.PI, spec), 1e-9), 'wraps symmetrically');
  for (let deg = -180; deg <= 180; deg += 1) {
    const value = azimuthDb(degToRad(deg), spec);
    assert.ok(value <= 0 && value >= PATTERN_FLOOR_DB, `azimuthDb(${deg}) = ${value} left [floor, 0]`);
  }
  assert.ok(azimuthDb(degToRad(90), spec) <= -10, 'broadside of a 60 deg beam is deep in the sidelobe region');
  const omni = { beamwidthDeg: 360 };
  for (let deg = 0; deg <= 180; deg += 17) {
    assert.equal(azimuthDb(degToRad(deg), omni), 0, 'a 360 deg beamwidth is exactly flat');
  }
});

test('pattern: elevation shape, dipole null and collinear flattening', () => {
  assert.equal(dipoleDb(0), 0, 'a vertical dipole is maximal at the horizon');
  assert.ok(approxEqual(dipoleDb(degToRad(90)), PATTERN_FLOOR_DB, 1e-6), 'null along the element axis');
  assert.ok(approxEqual(dipoleDb(degToRad(-90)), PATTERN_FLOOR_DB, 1e-6), 'null below too');
  assert.ok(approxEqual(dipoleDb(degToRad(30)), dipoleDb(degToRad(-30))), 'symmetric above and below the horizon');

  const four = createCollinearArray(4, 0.5);
  const eight = createCollinearArray(8, 0.5);
  assert.equal(four.currents.length, 4);
  assert.ok(approxEqual(collinearDb(0, four), 0, 1e-6), 'normalised to the horizon peak');
  const bw4 = beamwidthFromShape((rad) => collinearDb(rad, four));
  const bw8 = beamwidthFromShape((rad) => collinearDb(rad, eight));
  assert.ok(bw8 < bw4, `more sections flatten the lobe (${bw8.toFixed(1)} < ${bw4.toFixed(1)})`);
  assert.ok(bw4 > 5 && bw4 < 60, `a 4-section omni should be a few degrees tall, got ${bw4}`);
  assert.equal(beamwidthFromShape(() => 0), 360, 'a truly flat shape reports 360');

  const shaped = elevationDb(degToRad(45), { beamwidthDeg: 70 }, dipoleDb);
  assert.ok(shaped <= 0 && shaped >= PATTERN_FLOOR_DB);
  assert.equal(elevationDb(0, { beamwidthDeg: 60 }), 0);
});

test('pattern: measured beamwidth and front-to-back match the spec', () => {
  const spec = { beamwidthDeg: 62, sidelobeDb: -17, backToFrontDb: 22 };
  const shape = (rad) => azimuthDb(rad, spec);
  assert.ok(Math.abs(beamwidthFromShape(shape) - 62) < 2, `measured ${beamwidthFromShape(shape).toFixed(1)} deg`);
  assert.ok(Math.abs(frontToBackFromPattern(shape) - 22) < 1);
});

test('pattern: lobe radius is a monotone 0..1 map for drawing', () => {
  assert.equal(lobeRadius(10, 10), 1, 'peak gain draws at full radius');
  assert.equal(lobeRadius(10 - 30, 10, 30), 0, 'the clip level draws nothing');
  assert.equal(lobeRadius(-100, 10, 30), 0, 'anything quieter draws nothing');
  assert.equal(lobeRadius(50, 10, 30), 1, 'and nothing is ever bigger than the peak');
  let previous = -1;
  for (let db = -20; db <= 10; db += 0.5) {
    const radius = lobeRadius(db, 10, 30);
    assert.ok(radius >= previous - 1e-12, 'monotone in level');
    assert.ok(radius >= 0 && radius <= 1);
    previous = radius;
  }
});

test('pattern: small conversions', () => {
  assert.ok(approxEqual(azimuthOffsetRad(degToRad(350), degToRad(10)), degToRad(-20)), 'wraps across north');
  assert.ok(approxEqual(azimuthOffsetRad(degToRad(10), degToRad(350)), degToRad(20)));
  assert.equal(toDbi(-3, 12), 9);
  assert.ok(approxEqual(relativeFactor(-3), Math.pow(10, -0.3)));
  assert.equal(relativeFactor(PATTERN_FLOOR_DB), Math.pow(10, -4));
});

test('aim: normaliseAim sanitises junk and respects the limits', () => {
  assert.deepEqual(normaliseAim({}), { azimuthDeg: 0, tiltDeg: 0, beamTiltDeg: 0 });
  assert.deepEqual(normaliseAim({ azimuthDeg: 375, tiltDeg: -99, beamTiltDeg: 99 }),
    { azimuthDeg: 15, tiltDeg: -60, beamTiltDeg: 45 }, 'tilt uses the caller limits, beam tilt its own cap');
  assert.deepEqual(normaliseAim({ azimuthDeg: 'text', tiltDeg: null }, { tiltMinDeg: -5, tiltMaxDeg: 5 }),
    { azimuthDeg: 0, tiltDeg: 0, beamTiltDeg: 0 });
  assert.equal(effectiveTiltDeg({ tiltDeg: 0, beamTiltDeg: 10 }), -10, 'electrical downtilt points the beam down');
  assert.equal(effectiveTiltDeg({ tiltDeg: 20 }), 20);
  assert.equal(effectiveTiltDeg({ tiltDeg: -80, beamTiltDeg: 20 }), -89, 'never points along the ground plane axis');
});

test('aim: boresight follows the compass convention', () => {
  const checks = [[0, 0], [90, 0], [180, 0], [270, 0], [45, -20], [310, 35]];
  for (const [azimuthDeg, tiltDeg] of checks) {
    const aim = normaliseAim({ azimuthDeg, tiltDeg });
    const direction = boresightDirection(aim);
    const compass = toCompass(direction);
    assert.ok(approxEqual(compass.azimuthDeg, azimuthDeg, 1e-9), `azimuth ${azimuthDeg}`);
    assert.ok(approxEqual(compass.elevationDeg, tiltDeg, 1e-9), `elevation ${tiltDeg}`);
    assert.ok(approxEqual(direction.x, fromCompass(azimuthDeg, tiltDeg).x, 1e-12));
  }
});

test('aim: frames are right-handed and stable everywhere, including straight up', () => {
  for (let azimuthDeg = 0; azimuthDeg < 360; azimuthDeg += 30) {
    for (const tiltDeg of [-60, -10, 0, 25, 60, 89.5, -89.5]) {
      const aim = normaliseAim({ azimuthDeg, tiltDeg });
      const f = createAimFrame(aim);
      for (const key of ['forward', 'right', 'up', 'axisX']) {
        assert.ok(approxEqual(Math.hypot(f[key].x, f[key].y, f[key].z), 1, 1e-9), `${key} unit length`);
      }
      assert.ok(Math.abs(determinant(f.axisX, f.up, f.forward) - 1) < 1e-9,
        'local basis must be a proper rotation, not a mirror');
    }
  }
  const north = createAimFrame(normaliseAim({ azimuthDeg: 0, tiltDeg: 0 }));
  const closeToVec = (actual, expected, message) => {
    for (const key of ['x', 'y', 'z']) {
      assert.ok(approxEqual(actual[key], expected[key], 1e-12), `${message}: ${key} = ${actual[key]}`);
    }
  };
  closeToVec(north.forward, { x: 0, y: 0, z: -1 }, 'north forward');
  closeToVec(north.right, { x: 1, y: 0, z: 0 }, 'facing north, right hand points east');
  closeToVec(north.up, { x: 0, y: 1, z: 0 }, 'north up');
  const straightUp = createAimFrame(normaliseAim({ azimuthDeg: 0, tiltDeg: 60, beamTiltDeg: 0 }));
  assert.ok(Number.isFinite(straightUp.up.x + straightUp.up.y + straightUp.up.z));
});

test('aim: local angles and world directions are exact inverses', () => {
  for (const aim of [{ azimuthDeg: 0, tiltDeg: 0 }, { azimuthDeg: 137, tiltDeg: -12 }, { azimuthDeg: 20, tiltDeg: 45 }]) {
    const f = createAimFrame(normaliseAim(aim));
    for (const [azDeg, elDeg] of [[0, 0], [30, 10], [-30, -10], [179, 89], [-179, -89], [90, 0]]) {
      const direction = localAnglesToDirection(f, degToRad(azDeg), degToRad(elDeg));
      const back = worldToLocalAngles(f, direction);
      assert.ok(approxEqual(radToDeg(back.azimuthRad), azDeg, 1e-6), `azimuth round trip ${azDeg}`);
      assert.ok(approxEqual(radToDeg(back.elevationRad), elDeg, 1e-6), `elevation round trip ${elDeg}`);
    }
    const boresight = worldToLocalAngles(f, boresightDirection(normaliseAim(aim)));
    assert.ok(approxEqual(boresight.azimuthRad, 0, 1e-9), 'boresight is local (0, 0)');
    assert.ok(approxEqual(boresight.elevationRad, 0, 1e-9));
  }
});

test('aim: compass helpers and human text', () => {
  assert.equal(compassLabel(0), 'N');
  assert.equal(compassLabel(90), 'E');
  assert.equal(compassLabel(180), 'S');
  assert.equal(compassLabel(270), 'W');
  assert.equal(compassLabel(360), 'N', '360 wraps to north');
  assert.equal(compassLabel(45), 'NE');
  assert.equal(describeAim(normaliseAim({ azimuthDeg: 90, tiltDeg: 0 })), 'E 90 deg, level');
  assert.equal(describeAim(normaliseAim({ azimuthDeg: 0, tiltDeg: -10 })), 'N 0 deg, 10 deg down');
  assert.equal(describeAim(normaliseAim({ azimuthDeg: 180, tiltDeg: 5 })), 'S 180 deg, 5 deg up');

  const origin = { x: 0, y: 10, z: 0 };
  assert.equal(bearingTo(origin, { x: 500, y: 0, z: 0 }), 90);
  assert.equal(bearingTo(origin, { x: 0, y: 0, z: -500 }), 0);
  assert.ok(approxEqual(elevationTo(origin, { x: 0, y: 110, z: -1000 }), radToDeg(Math.atan2(100, 1000)), 1e-9));
  assert.deepEqual(directionTo(origin, { x: 0, y: 10, z: 0 }), { x: 0, y: 0, z: 0 }, 'a point on top of itself');
});

test('model: rejects nonsense and defaults sensibly', () => {
  assert.throws(() => createAntennaModel({ designId: 'nope', wavelength: 1 }), RangeError);
  assert.throws(() => createAntennaModel({ designId: 'yagi', wavelength: 0 }), RangeError);
  const model = createAntennaModel({ designId: 'yagi', wavelength: LAMBDA_868 });
  assert.deepEqual(model.params, createDefaultParams('yagi'), 'missing params fall back to the design defaults');
  assert.equal(model.aim.azimuthDeg, 0);
  assert.ok(model.peakGainDbi > 0);
});

test('model: gain in world directions follows the aim and the pattern', () => {
  const aim = { azimuthDeg: 90, tiltDeg: -15 };
  const model = createAntennaModel({ designId: 'yagi', params: { directors: 10 }, aim, wavelength: LAMBDA_868 });

  const boresight = model.gainDbiForDirection(boresightDirection(normaliseAim(aim)));
  assert.ok(approxEqual(boresight, model.peakGainDbi, 1e-6), 'boresight delivers the peak gain');

  const behind = model.gainDbiForDirection(fromCompass(270, -15));
  assert.ok(model.peakGainDbi - behind > 15, `the back of a Yagi must be deep (${behind.toFixed(1)} dBi)`);

  const sideways = model.gainDbiForDirection(fromCompass(90, 75));
  assert.ok(sideways < boresight - 6, 'steeply above the beam is quiet');

  const omni = createAntennaModel({ designId: 'omni-dipole', aim: { azimuthDeg: 0, tiltDeg: 0 }, wavelength: LAMBDA_868 });
  const levels = [0, 45, 90, 135, 180, 225, 270, 315].map((az) => omni.gainDbiForDirection(fromCompass(az, 0)));
  for (const level of levels) assert.ok(approxEqual(level, levels[0], 1e-9), 'an omni is flat in azimuth at the horizon');
  const up = omni.gainDbiForDirection(AXIS_Y);
  assert.ok(levels[0] - up > 30, 'a vertical dipole is null straight up');
});

test('model: downtilt and azimuth move the peak exactly as the user aimed', () => {
  for (const [azimuthDeg, tiltDeg] of [[0, 0], [37, -20], [180, 12], [300, -45]]) {
    const model = createAntennaModel({ designId: 'patch', aim: { azimuthDeg, tiltDeg }, wavelength: LAMBDA_868 });
    const best = model.directionAt(0, 0);
    const compass = toCompass(best);
    assert.ok(approxEqual(compass.azimuthDeg, azimuthDeg, 1e-6), `peak azimuth ${azimuthDeg}`);
    assert.ok(approxEqual(compass.elevationDeg, tiltDeg, 1e-6), `peak elevation ${tiltDeg}`);
    assert.deepEqual(model.boresightDeg, { azimuthDeg, elevationDeg: tiltDeg });
  }
  const tilted = createAntennaModel({
    designId: 'patch',
    params: { sizeLambda: 1, beamTiltDeg: 15 },
    aim: { azimuthDeg: 90, tiltDeg: 0, beamTiltDeg: 15 },
    wavelength: LAMBDA_868,
  });
  assert.equal(tilted.boresightDeg.elevationDeg, -15, 'electrical downtilt points the beam below the horizon');
});

test('model: sphere sampling is well formed and peaks at the boresight', () => {
  const model = createAntennaModel({ designId: 'yagi', params: { directors: 7 }, aim: { azimuthDeg: 20 }, wavelength: LAMBDA_868 });
  const { rows, cols, db, radius, dirs } = model.sampleSphere({ rings: 24, columns: 36 });
  assert.equal(rows, 25);
  assert.equal(cols, 37);
  assert.equal(db.length, rows * cols);
  assert.equal(dirs.length, rows * cols * 3);
  let maxDb = -Infinity;
  for (let i = 0; i < db.length; i += 1) {
    assert.ok(Number.isFinite(db[i]), 'no NaN in the sampled pattern');
    assert.ok(db[i] <= model.peakGainDbi + 1e-6, 'nothing beats the peak gain');
    assert.ok(db[i] >= model.peakGainDbi + PATTERN_FLOOR_DB - 1e-6, 'nothing is quieter than the floor');
    assert.ok(radius[i] >= 0 && radius[i] <= 1 + 1e-9, 'drawn radius stays inside the unit sphere');
    maxDb = Math.max(maxDb, db[i]);
  }
  assert.ok(approxEqual(maxDb, model.peakGainDbi, 1e-6), 'the sampled maximum is the analytic peak');
});

test('model: plane cuts and summary numbers agree with the catalogue', () => {
  const params = { directors: 12, spacingLambda: 0.3, beamTiltDeg: 0 };
  const model = createAntennaModel({ designId: 'yagi', params, wavelength: LAMBDA_868 });
  const cut = model.planeCut('azimuth', 361);
  assert.equal(cut.length, 361);
  assert.equal(cut[180].deg, 0, 'the cut is centred on local boresight');
  assert.ok(approxEqual(cut[180].dbi, model.peakGainDbi, 1e-6));
  assert.ok(cut[0].dbi < cut[180].dbi - 15, 'the back of the cut is deep');

  const summary = model.summary();
  assert.equal(summary.id, 'yagi');
  assert.equal(summary.elements, 14);
  assert.ok(Math.abs(summary.hBeamwidthDeg - 78 * Math.exp(-0.09 * 12) * (1.15 - 0.5 * 0.3)) < 1.5,
    `reported beamwidth ${summary.hBeamwidthDeg.toFixed(1)} follows the catalogue shape`);
  assert.ok(summary.frontToBackDb > 15);
  assert.ok(summary.conductorLengthM > 0);
  assert.ok(summary.boomLengthM > 0);
  assert.equal(summary.aimsInAzimuth, true);
  assert.equal(summary.floorDb, PATTERN_FLOOR_DB);
  assert.ok(approxEqual(summary.wavelengthM, LAMBDA_868, 1e-12));

  const omni = createAntennaModel({ designId: 'omni-dipole', wavelength: LAMBDA_868 }).summary();
  assert.equal(omni.hBeamwidthDeg, 360, 'an omni has no azimuth beamwidth');
  assert.equal(omni.frontToBackDb, 0);
});

test('model: a bigger design means more gain and a narrower beam', () => {
  const build = (directors) => createAntennaModel({
    designId: 'yagi',
    params: { directors, spacingLambda: 0.3 },
    wavelength: LAMBDA_868,
  });
  const short = build(3);
  const long = build(13);
  assert.ok(long.peakGainDbi > short.peakGainDbi);
  assert.ok(long.summary().hBeamwidthDeg < short.summary().hBeamwidthDeg);
  const gainAt = (model, azDeg) => model.gainDbiForDirection(fromCompass(azDeg, 0));
  assert.ok(long.peakGainDbi - gainAt(long, 180) > short.peakGainDbi - gainAt(short, 180),
    'a longer Yagi also rejects more from behind');
});

test('model: the wavelength really drives the physical size', () => {
  const low = createAntennaModel({ designId: 'yagi', params: createDefaultParams('yagi'), wavelength: wavelengthM(433e6) });
  const high = createAntennaModel({ designId: 'yagi', params: createDefaultParams('yagi'), wavelength: wavelengthM(5800e6) });
  assert.ok(low.geometry.bounds.span > 10 * high.geometry.bounds.span);
  assert.equal(low.peakGainDbi, high.peakGainDbi, 'the pattern model is frequency independent; only size changes');
});
