/**
 * Unit tests: the antenna catalogue as data.
 *
 * The catalogue is declarative on purpose (GUIDELINES.md §5.2): the UI, the
 * meshes and the RF maths all read it, and none of them may hard-code an antenna
 * id. These tests are what makes that promise safe - they enumerate every entry
 * and assert the invariants each entry must satisfy.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ANTENNA_CATALOGUE, ANTENNA_IDS, createDefaultAim, createDefaultParams, getAntennaEntry, isKnownAntennaId,
  nominalGainDbi, normaliseParams, paramLabel, patternSpec,
} from '../../src/antenna/catalogue.js';
import { GEOMETRY_KINDS, buildAntennaGeometry } from '../../src/antenna/geometryspec.js';
import { approxEqual } from '../../src/math/scalar.js';

/** The designs the README advertises. Adding one here means documenting it. */
const EXPECTED_IDS = Object.freeze(['omni-dipole', 'omni-collinear', 'yagi', 'biquad-reflector', 'patch']);

test('catalogue: exactly the documented designs, unique ids, stable order', () => {
  assert.deepEqual(ANTENNA_IDS, EXPECTED_IDS);
  assert.equal(new Set(ANTENNA_IDS).size, ANTENNA_IDS.length);
  assert.equal(getAntennaEntry('nope'), undefined);
  assert.equal(isKnownAntennaId('yagi'), true);
  assert.equal(isKnownAntennaId('Yagi'), false, 'ids are case sensitive');
  assert.throws(() => createDefaultParams('nope'), RangeError);
  assert.throws(() => nominalGainDbi('nope', {}), RangeError);
  assert.throws(() => patternSpec('nope', {}), RangeError);
});

test('catalogue: every entry is complete, described and drawable', () => {
  for (const entry of ANTENNA_CATALOGUE) {
    assert.ok(entry.id && entry.label, `${entry.id}: needs an id and a label`);
    assert.ok(entry.summary.length > 40, `${entry.id}: the summary is shown to users, write a real sentence`);
    assert.ok(entry.typicalUse.length > 10, `${entry.id}: typicalUse is shown in the UI`);
    assert.ok(['omni', 'directional'].includes(entry.family), `${entry.id}: unknown family`);
    assert.ok(['omni', 'directional'].includes(entry.family));
    assert.equal(entry.aimsInAzimuth, entry.family === 'directional', `${entry.id}: only beams aim in azimuth`);
    assert.ok(GEOMETRY_KINDS.includes(entry.geometryKind), `${entry.id}: no geometry builder for ${entry.geometryKind}`);
    assert.ok(['vertical', 'horizontal'].includes(entry.polarization));
    assert.equal(Object.isFrozen(entry), true, `${entry.id}: catalogue entries are immutable`);
  }
});

test('catalogue: parameter specs are usable sliders', () => {
  for (const entry of ANTENNA_CATALOGUE) {
    const keys = new Set();
    for (const spec of entry.paramSpecs) {
      assert.ok(spec.key && !keys.has(spec.key), `${entry.id}: duplicate parameter ${spec.key}`);
      keys.add(spec.key);
      assert.ok(spec.label.length > 1, `${entry.id}.${spec.key}: needs a label`);
      assert.ok(spec.min < spec.max, `${entry.id}.${spec.key}: min must be below max`);
      assert.ok(spec.step > 0 && spec.step <= spec.max - spec.min, `${entry.id}.${spec.key}: silly step`);
      assert.ok(spec.default >= spec.min && spec.default <= spec.max, `${entry.id}.${spec.key}: default out of range`);
      if (spec.step >= 1) {
        assert.ok(Number.isInteger(spec.default), `${entry.id}.${spec.key}: integer slider with a fractional default`);
      }
      assert.equal(paramLabel(entry.id, spec.key), spec.label);
    }
    assert.equal(paramLabel(entry.id, 'notAParam'), 'notAParam', 'unknown parameters fall back to their key');
  }
  assert.deepEqual(ANTENNA_CATALOGUE.find((e) => e.id === 'omni-dipole').paramSpecs, [],
    'the reference omni must have no parameters: it is the baseline');
});

test('catalogue: normaliseParams clamps, rounds and ignores junk', () => {
  assert.deepEqual(createDefaultParams('yagi'), { directors: 7, spacingLambda: 0.3, beamTiltDeg: 0 });
  const clamped = normaliseParams('yagi', { directors: 999, spacingLambda: -5, beamTiltDeg: 80 });
  assert.equal(clamped.directors, 14, 'directors clamp to the slider maximum');
  assert.equal(clamped.spacingLambda, 0.2, 'spacing clamps to the slider minimum');
  assert.equal(clamped.beamTiltDeg, 15);
  const junk = normaliseParams('yagi', { directors: Number.NaN, spacingLambda: 'text', bogus: 5 });
  assert.deepEqual(junk, createDefaultParams('yagi'), 'unusable values fall back to the default, junk keys vanish');
  assert.deepEqual(normaliseParams('omni-dipole', { directors: 9 }), {}, 'a design cannot inherit another design params');
  assert.equal(normaliseParams('patch', { sizeLambda: 1.234 }).sizeLambda, 1.234, 'fractional steps survive');
});

test('catalogue: gains are finite, plausible and monotone in the design effort', () => {
  const probes = {
    'omni-dipole': [],
    'omni-collinear': [[2, 0.5], [4, 0.5], [8, 0.5]],
    yagi: [[2, 0.3], [7, 0.3], [14, 0.3]],
    'biquad-reflector': [[1, 0.1], [2, 0.25], [3, 0.4]],
    patch: [[0.7], [1], [1.5]],
  };
  for (const entry of ANTENNA_CATALOGUE) {
    const gains = probes[entry.id].map((values) => {
      const params = entry.paramSpecs.reduce((acc, spec, i) => ({ ...acc, [spec.key]: values[i] }), {});
      return nominalGainDbi(entry.id, params);
    });
    for (const gain of gains) {
      assert.ok(Number.isFinite(gain), `${entry.id}: gain must be a number`);
      assert.ok(gain >= -5 && gain <= 25, `${entry.id}: ${gain} dBi is not a plausible hand-sized antenna gain`);
    }
    for (let i = 1; i < gains.length; i += 1) {
      assert.ok(gains[i] > gains[i - 1], `${entry.id}: more aperture must mean more gain (${gains.join(', ')})`);
    }
  }
  assert.ok(approxEqual(nominalGainDbi('omni-dipole'), 2.15), 'a half-wave dipole is the 2.15 dBi reference');
  const omni = nominalGainDbi('omni-collinear', createDefaultParams('omni-collinear'));
  const yagi = nominalGainDbi('yagi', createDefaultParams('yagi'));
  assert.ok(omni > 2.15 && omni < yagi, `omni collinear (${omni}) should beat the dipole but lose to a beam (${yagi})`);
});

test('catalogue: pattern specs match the family', () => {
  for (const entry of ANTENNA_CATALOGUE) {
    const spec = patternSpec(entry.id, createDefaultParams(entry.id));
    assert.ok(spec.azimuth && spec.elevation, `${entry.id}: pattern needs both principal planes`);
    assert.equal(spec.azimuth.kind, entry.family === 'omni' ? 'omni' : 'lobe', `${entry.id}: azimuth shape`);
    if (spec.azimuth.kind === 'lobe') {
      assert.ok(spec.azimuth.beamwidthDeg >= 5 && spec.azimuth.beamwidthDeg <= 120, `${entry.id}: beamwidth`);
      assert.ok(spec.azimuth.backToFrontDb > 0, `${entry.id}: a beam needs a front-to-back ratio`);
    }
    assert.ok(['dipole', 'collinear', 'lobe'].includes(spec.elevation.kind), `${entry.id}: elevation shape`);
  }
  const yagi = patternSpec('yagi', { directors: 14 });
  const shortYagi = patternSpec('yagi', { directors: 2 });
  assert.ok(yagi.azimuth.beamwidthDeg < shortYagi.azimuth.beamwidthDeg, 'more directors, narrower beam');
  assert.ok(yagi.azimuth.backToFrontDb > shortYagi.azimuth.backToFrontDb, 'more directors, better front-to-back');
  assert.ok(yagi.azimuth.sidelobeDb > shortYagi.azimuth.sidelobeDb, 'more directors, higher sidelobes (physics!)');
});

test('catalogue: geometry builders produce bounded hardware for every design', () => {
  const wavelength = 0.345; // 868 MHz
  for (const entry of ANTENNA_CATALOGUE) {
    const geometry = buildAntennaGeometry(entry.geometryKind, createDefaultParams(entry.id), wavelength);
    assert.ok(geometry.parts.length > 0, `${entry.id}: no parts`);
    assert.ok(geometry.bounds.span > 0, `${entry.id}: empty bounding box`);
    assert.ok(geometry.bounds.span < 10 * wavelength, `${entry.id}: ${geometry.bounds.span} m is huge for ${wavelength} m`);
    for (const part of geometry.parts) {
      assert.ok(['rod', 'box', 'loop'].includes(part.type), `${entry.id}: unknown primitive ${part.type}`);
      assert.ok(part.role, `${entry.id}: every part needs a role for material selection`);
      if (part.type === 'rod') assert.ok(part.radius > 0 && Number.isFinite(part.radius));
      if (part.type === 'box') assert.ok(part.size.every((s) => s > 0), `${entry.id}: degenerate box`);
      if (part.type === 'loop') assert.ok(part.points.length >= 4, `${entry.id}: a loop needs corners`);
    }
    assert.ok(geometry.meta.elements >= 1, `${entry.id}: elements must be counted`);
    assert.ok(Number.isFinite(geometry.meta.boomLengthM) && geometry.meta.boomLengthM >= 0);
    assert.ok(Number.isFinite(geometry.meta.apertureM) && geometry.meta.apertureM > 0);
  }
  assert.throws(() => buildAntennaGeometry('nope', {}, 1), RangeError);
  assert.throws(() => buildAntennaGeometry('dipole', {}, 0), RangeError);
});

test('catalogue: geometry scales with wavelength and grows with the design', () => {
  const lowBand = 0.69; // 433 MHz
  const highBand = 0.0517; // 5.8 GHz
  const params = createDefaultParams('yagi');
  const big = buildAntennaGeometry('yagi', params, lowBand);
  const small = buildAntennaGeometry('yagi', params, highBand);
  assert.ok(big.bounds.span > 10 * small.bounds.span, 'a 433 MHz Yagi is far bigger than a 5.8 GHz one');

  const few = buildAntennaGeometry('yagi', { ...params, directors: 3 }, lowBand);
  const many = buildAntennaGeometry('yagi', { ...params, directors: 12 }, lowBand);
  assert.ok(many.meta.boomLengthM > few.meta.boomLengthM, 'more directors need a longer boom');
  assert.equal(many.meta.elements, 14, 'reflector + driven + 12 directors');
  assert.equal(buildAntennaGeometry('dipole', {}, lowBand).meta.elements, 1);

  const collinear = buildAntennaGeometry('collinear', { elements: 6, spacingLambda: 0.5 }, 1);
  assert.equal(collinear.meta.elements, 6);
  // (n - 1) * 0.5 lambda of spacing + one half-wave section = 3 lambda tall.
  assert.ok(approxEqual(collinear.meta.lengthM, 3, 1e-9), 'collinear height scales with the section count');
});

test('catalogue: default aims carry the design-typical downtilt', () => {
  assert.deepEqual(createDefaultAim('omni-dipole'), { azimuthDeg: 0, tiltDeg: 0, beamTiltDeg: 0 });
  assert.deepEqual(createDefaultAim('yagi'), { azimuthDeg: 0, tiltDeg: 0, beamTiltDeg: 0 });
  assert.deepEqual(createDefaultAim('patch'), { azimuthDeg: 0, tiltDeg: 0, beamTiltDeg: 6 },
    'sector panels ship with a mechanical-looking downtilt');
  assert.equal(Object.isFrozen(createDefaultAim('patch')), true);
});
