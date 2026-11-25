/**
 * Unit tests: scalar maths, vectors, noise and the height field.
 *
 * Plain Node, no DOM, no fixtures: this is the fast feedback loop. Assert on
 * invariants and hand-computed reference values, never on golden files
 * (GUIDELINES.md §7).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  approxEqual, bump, clamp, clamp01, dbToLin, DEG_PER_RAD, degToRad, extremes, formatDb, inverseLerp, lerp, linToDb,
  mean, percentile, radToDeg, roundTo, smoothstep, sum, wrapDeg180, wrapDeg360, wrapRadPI,
} from '../../src/math/scalar.js';
import {
  add, angularDistance, AXIS_X, AXIS_Y, AXIS_Z, cloneVec, cross, distance, dot, fromCompass, horizontalLength,
  isVec3, length, lengthSq, lerpVec, neg, normalize, scale, sub, toCompass, v3,
} from '../../src/math/vec3.js';
import { createRandom, fbm2, hash2i, pick, randomInRange, ridgedFbm2, valueNoise2 } from '../../src/math/noise.js';
import { HeightField } from '../../src/terrain/heightfield.js';

test('scalar: clamp degrades predictably on bad input', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.25, 0, 1), 0.25);
  assert.equal(clamp(Number.NaN, 3, 9), 3, 'NaN falls back to the low bound');
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01(Number.NaN), 0);
});

test('scalar: interpolation, wrapping and unit conversions', () => {
  assert.equal(lerp(10, 20, 0.25), 12.5);
  assert.equal(inverseLerp(10, 20, 12.5), 0.25);
  assert.equal(inverseLerp(3, 3, 9), 0, 'degenerate range must not produce NaN');
  assert.equal(wrapDeg360(370), 10);
  assert.equal(wrapDeg360(-10), 350);
  assert.equal(wrapDeg180(-190), 170);
  assert.equal(wrapDeg180(180), -180);
  assert.ok(approxEqual(wrapRadPI(Math.PI), -Math.PI));
  assert.equal(radToDeg(Math.PI), 180);
  assert.equal(degToRad(180), Math.PI);
  assert.equal(DEG_PER_RAD * DEG_PER_RAD, DEG_PER_RAD ** 2);
  assert.equal(roundTo(1.23456, 3), 1.235);
});

test('scalar: decibel helpers are exact inverses', () => {
  assert.equal(linToDb(1), 0);
  assert.equal(linToDb(0), -Infinity, 'zero power is silence, not NaN');
  assert.equal(linToDb(2), 10 * Math.log10(2));
  assert.equal(dbToLin(0), 1);
  assert.equal(dbToLin(-Infinity), 0);
  for (const db of [-120, -20, -3.5, 0, 7.2, 43]) assert.ok(approxEqual(linToDb(dbToLin(db)), db, 1e-12));
  assert.equal(formatDb(3.14159), '+3.1');
  assert.equal(formatDb(-9.87), '-9.9');
  assert.equal(formatDb(Number.NaN), '--');
});

test('scalar: smoothstep, bump and statistics', () => {
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 2), 1);
  assert.equal(smoothstep(0, 1, 0), 0);
  assert.equal(smoothstep(0, 1, 1), 1);
  assert.ok(approxEqual(smoothstep(0, 1, 0.5), 0.5));
  assert.ok(approxEqual(smoothstep(5, 5, 6), 1), 'degenerate edges behave like a step');
  for (let x = -6; x <= 6; x += 0.25) {
    const value = bump(x, 1.5);
    assert.ok(value >= 0 && value <= 1, `bump(${x}) = ${value} left [0,1]`);
  }
  assert.equal(bump(1, 0), 0, 'a zero-width bump contributes nothing');
  assert.equal(sum([1, 2, 3, 4]), 10);
  assert.equal(mean([]), 0);
  assert.deepEqual(extremes([3, -1, 7]), { min: -1, max: 7 });
  assert.deepEqual(extremes([]), { min: 0, max: 0 });
  assert.equal(percentile([0, 10], 0.5), 5);
  assert.equal(percentile([10, 0, 5], 1), 10, 'percentile does not mutate or fail on unsorted input');
});

test('vec3: arithmetic matches hand computation', () => {
  assert.deepEqual(v3(1, 2, 3), { x: 1, y: 2, z: 3 });
  assert.deepEqual(add(v3(1, 2, 3), v3(1, -2, 0)), { x: 2, y: 0, z: 3 });
  assert.deepEqual(sub(v3(1, 2, 3), v3(1, 2, 3)), { x: 0, y: 0, z: 0 });
  assert.deepEqual(scale(v3(1, 2, 3), 2), { x: 2, y: 4, z: 6 });
  assert.deepEqual(neg(v3(1, -2, 3)), { x: -1, y: 2, z: -3 });
  assert.deepEqual(lerpVec(v3(0, 0, 0), v3(2, 4, 6), 0.5), { x: 1, y: 2, z: 3 });
  assert.deepEqual(cloneVec(v3(1, 2, 3)), v3(1, 2, 3));
  assert.equal(dot(AXIS_X, AXIS_Y), 0);
  assert.deepEqual(cross(AXIS_X, AXIS_Y), AXIS_Z);
  assert.deepEqual(cross(AXIS_Y, AXIS_X), { x: 0, y: 0, z: -1 }, 'right-handed basis');
  assert.equal(lengthSq(v3(3, 4, 0)), 25);
  assert.equal(length(v3(3, 4, 0)), 5);
  assert.equal(distance(v3(0, 0, 0), v3(0, 0, 4)), 4);
  assert.equal(horizontalLength(v3(3, 99, 4)), 5, 'horizontal ignores height');
  assert.equal(isVec3(v3(1, 2, 3)), true);
  assert.equal(isVec3({ x: 1, y: Number.NaN, z: 0 }), false);
});

test('vec3: normalize is safe on the degenerate vector', () => {
  assert.deepEqual(normalize(v3(0, 0, 0)), { x: 0, y: 0, z: 0 });
  const n = normalize(v3(0, 0, -7));
  assert.ok(approxEqual(length(n), 1));
  assert.deepEqual(n, { x: 0, y: 0, z: -1 });
});

test('vec3: compass convention is +X east, +Y up, -Z north', () => {
  assert.ok(approxEqual(fromCompass(0).z, -1, 1e-12), 'north is -Z');
  assert.ok(approxEqual(fromCompass(90).x, 1, 1e-12), 'east is +X');
  assert.ok(approxEqual(fromCompass(180).z, 1, 1e-12), 'south is +Z');
  assert.ok(approxEqual(fromCompass(270).x, -1, 1e-12), 'west is -X');
  assert.ok(approxEqual(fromCompass(0, 90).y, 1, 1e-12), 'elevation 90 is straight up');
  for (const az of [0, 17, 90, 180, 271, 359.5]) {
    const back = toCompass(fromCompass(az, 12.5));
    assert.ok(approxEqual(back.azimuthDeg, az, 1e-9), `azimuth ${az} survives the round trip`);
    assert.ok(approxEqual(back.elevationDeg, 12.5, 1e-9));
  }
  assert.equal(toCompass(v3(0, 0, 0)).azimuthDeg, 0, 'zero vector still produces a usable bearing');
});

test('vec3: angularDistance is bounded and symmetric', () => {
  assert.ok(approxEqual(angularDistance(AXIS_X, AXIS_X), 0, 1e-9));
  assert.ok(approxEqual(angularDistance(AXIS_X, neg(AXIS_X)), Math.PI, 1e-9));
  assert.ok(approxEqual(angularDistance(AXIS_X, AXIS_Y), Math.PI / 2, 1e-9));
  assert.equal(angularDistance(v3(0, 0, 0), AXIS_X), Math.PI / 2, 'degenerate input falls back to a right angle');
  assert.equal(angularDistance(AXIS_X, AXIS_Y), angularDistance(AXIS_Y, AXIS_X));
});

test('noise: hashing is deterministic, seed-sensitive and in range', () => {
  assert.equal(hash2i(3, 4, 11), hash2i(3, 4, 11));
  assert.notEqual(hash2i(3, 4, 11), hash2i(4, 3, 11), 'x/z are not interchangeable');
  assert.notEqual(hash2i(3, 4, 11), hash2i(3, 4, 12), 'the seed participates');
  for (let i = 0; i < 5000; i += 1) {
    const value = hash2i(i % 97, (i * 7) % 89, i >> 8);
    assert.ok(value >= 0 && value < 1, `hash2i left [0,1): ${value}`);
  }
});

test('noise: value noise, fbm and ridged fbm stay in range and repeat', () => {
  const probes = [[0, 0], [0.5, 0.5], [-3.25, 7.75], [1000.5, -999.25], [1e-9, -1e-9]];
  for (const [x, z] of probes) {
    assert.ok(valueNoise2(x, z, 5) >= 0 && valueNoise2(x, z, 5) <= 1);
    const fbm = fbm2(x, z, { seed: 7, octaves: 5 });
    assert.ok(fbm >= 0 && fbm <= 1, `fbm2 out of range: ${fbm}`);
    assert.equal(fbm, fbm2(x, z, { seed: 7, octaves: 5 }), 'same inputs, same output');
    const ridged = ridgedFbm2(x, z, { seed: 3 });
    assert.ok(ridged >= 0 && ridged <= 1, `ridgedFbm2 out of range: ${ridged}`);
  }
  assert.notEqual(fbm2(12.5, -4.25, { seed: 7 }), fbm2(12.5, -4.25, { seed: 8 }), 'a new seed gives a new field');
  assert.equal(fbm2(4, 4, { octaves: 0 }), 0, 'zero octaves is defined, not NaN');
});

test('noise: the seeded stream is reproducible and roughly uniform', () => {
  const a = createRandom(99);
  const b = createRandom(99);
  let total = 0;
  for (let i = 0; i < 2000; i += 1) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
    total += value;
  }
  const avg = total / 2000;
  assert.ok(avg > 0.46 && avg < 0.54, `mean ${avg} is not close to 0.5`);
  assert.notEqual(createRandom(100)(), createRandom(101)());
  assert.ok(randomInRange(a, 10, 20) >= 10);
  assert.ok([1, 2, 3].includes(pick(a, [1, 2, 3])));
  assert.equal(pick(a, []), undefined);
});

test('height field: constructor validates and maps grid to world', () => {
  assert.throws(() => new HeightField({ size: 2, worldSize: 100 }), RangeError);
  assert.throws(() => new HeightField({ size: 9.5, worldSize: 100 }), RangeError);
  assert.throws(() => new HeightField({ size: 9, worldSize: 0 }), RangeError);
  const field = new HeightField({ size: 11, worldSize: 1000 });
  assert.equal(field.cellSize, 100);
  assert.equal(field.half, 500);
  assert.equal(field.worldX(0), -500);
  assert.equal(field.worldX(10), 500);
  assert.equal(field.cellX(-500), 0);
  assert.equal(field.cellX(500), 10);
  assert.equal(field.index(3, 4), 4 * 11 + 3, 'row-major indexing');
  assert.equal(field.inBounds(10, 10), true);
  assert.equal(field.inBounds(11, 10), false);
  assert.deepEqual(field.cellCentre(field.index(2, 5)), { x: -300, z: 0 });
});

test('height field: bilinear sampling is exact for a linear ramp', () => {
  const field = new HeightField({ size: 9, worldSize: 800 }).fillFromFunction((x, z) => 3 + 0.5 * x - 2 * z);
  const probe = field.sample(137.5, -212.25);
  assert.ok(approxEqual(probe, 3 + 0.5 * 137.5 - 2 * -212.25, 1e-4), 'linear data is reproduced exactly');
  const normal = field.normalAt(0, 0);
  const expected = normalize(v3(-0.5, 1, 2));
  assert.ok(approxEqual(normal.x, expected.x, 1e-9), 'normal of a plane is (-dh/dx, 1, -dh/dz)');
  assert.ok(approxEqual(normal.y, expected.y, 1e-9));
  assert.ok(approxEqual(normal.z, expected.z, 1e-9));
  const expectedSlope = (Math.atan(Math.hypot(0.5, 2)) * 180) / Math.PI;
  assert.ok(approxEqual(field.slopeDegAt(0, 0), expectedSlope, 1e-4));
});

test('height field: queries outside the domain clamp instead of exploding', () => {
  const field = new HeightField({ size: 9, worldSize: 100 }).fillFromFunction((x, z) => x + z);
  const far = field.sample(1e6, -1e6);
  assert.ok(Number.isFinite(far));
  assert.equal(far, field.sample(50, -50), 'clamped to the domain corner');
});

test('height field: cell edits, stats, clone and iteration agree', () => {
  const field = new HeightField({ size: 5, worldSize: 400 }).fillFromFunction(() => 10);
  assert.equal(field.setHeightAtCell(2, 2, 50), true);
  assert.equal(field.setHeightAtCell(9, 0, 1), false, 'out-of-range edits are refused');
  assert.equal(field.heightAtCell(2, 2), 50);
  const stats = field.stats();
  assert.deepEqual(
    { cells: stats.cells, min: stats.min, max: stats.max, relief: stats.relief },
    { cells: 25, min: 10, max: 50, relief: 40 },
  );
  assert.ok(approxEqual(stats.mean, (24 * 10 + 50) / 25, 1e-6));

  const copy = field.clone();
  copy.setHeightAtCell(2, 2, 0);
  assert.equal(field.heightAtCell(2, 2), 50, 'clone is a deep copy');

  let visits = 0;
  let heightSum = 0;
  field.forEachCell((x, z, h, index, ix, iz) => {
    visits += 1;
    heightSum += h;
    assert.equal(field.index(ix, iz), index);
    assert.equal(field.worldX(ix), x);
  });
  assert.equal(visits, 25);
  assert.ok(approxEqual(heightSum / 25, stats.mean, 1e-6));

  field.mapInPlace((h) => h * 2);
  assert.equal(field.heightAtCell(0, 0), 20);
});
