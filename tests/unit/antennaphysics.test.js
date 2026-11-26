/**
 * Unit tests: what an antenna design is physically allowed to claim.
 *
 * These exist because the app once advertised a biquad at 12.40 dBi with a
 * 69 x 69 degree beam, and 69 x 69 degrees can hold at most 9.38 dBi. A coverage
 * map drawn from that number shows a small wide antenna reaching further than a
 * long Yagi, which reads to a user as "the models are the same for everything"
 * when what it means is "one of these numbers is not physics".
 *
 * The invariant is Kraus's approximation: a beam of -3 dB widths (H, V) degrees
 * has a directivity of about 41253 / (H * V). It is an *upper* bound for a
 * main-lobe-dominated pattern - a real build sits under it because of taper, feed
 * loss and mismatch - so a design whose peak gain sits *above* its own beam is not
 * a strong antenna, it is a contradiction between the pattern it draws and the
 * gain it charges the link budget with.
 *
 * Omni designs are exempt, deliberately: Kraus assumes one main lobe in both
 * planes, and a 360 degree azimuth plane is not one. Their gain is the array
 * factor of N in-phase half-wave sections, pinned in tests/unit/antenna.test.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ANTENNA_CATALOGUE, createDefaultParams, nominalGainDbi, patternSpec,
} from '../../src/antenna/catalogue.js';
import { createAntennaModel } from '../../src/antenna/model.js';
import { wavelengthM } from '../../src/propagation/rf.js';
import { krausDirectivityDbi } from '../../src/antenna/pattern.js';

/**
 * The invariant, written here rather than imported, so the test is the definition of
 * what we believe: `src/antenna/pattern.js` exports the same arithmetic and one of the
 * tests below asserts the two agree, so neither the test nor the model can drift alone.
 */
function beamImpliedDirectivityDbi(hBeamwidthDeg, vBeamwidthDeg) {
  const h = Math.max(0.5, hBeamwidthDeg);
  const v = Math.max(0.5, vBeamwidthDeg);
  return 10 * Math.log10(41253 / (h * v));
}

const WAVELENGTH = wavelengthM(868_000_000);
const AIM = Object.freeze({ azimuthDeg: 0, tiltDeg: 0, beamTiltDeg: 0 });

/** 0.25 dB of slack for a -3 dB width found by sampling a pattern, not solving it. */
const SEARCH_SLACK_DB = 0.25;
/** A design a full 6 dB under its own beam is describing another antenna than it draws. */
const UNDER_BOUND_DB = 6;

/** Every parameter combination worth asking about: default, each bound, and extras. */
function probePoints(entry) {
  const defaults = createDefaultParams(entry.id);
  const points = [['default', defaults]];
  for (const spec of entry.paramSpecs) {
    points.push([`min ${spec.key}`, { ...defaults, [spec.key]: spec.min }]);
    points.push([`max ${spec.key}`, { ...defaults, [spec.key]: spec.max }]);
  }
  if (entry.id === 'yagi') {
    for (const directors of [2, 3, 5, 7, 10, 14]) {
      points.push([`directors ${directors}`, { ...defaults, directors }]);
    }
  }
  if (entry.id === 'biquad-reflector') {
    for (const turns of [1, 2, 3]) points.push([`turns ${turns}`, { ...defaults, turns }]);
  }
  return points;
}

function summaryAt(designId, params) {
  return createAntennaModel({ designId, params, aim: AIM, wavelength: WAVELENGTH }).summary();
}

const directional = ANTENNA_CATALOGUE.filter((entry) => entry.family === 'directional');

test('antenna physics: no design claims more gain than its own beam can hold', () => {
  assert.ok(directional.length >= 3, 'the catalogue lost its directional designs');
  for (const entry of directional) {
    for (const [label, params] of probePoints(entry)) {
      const s = summaryAt(entry.id, params);
      const implied = beamImpliedDirectivityDbi(s.hBeamwidthDeg, s.vBeamwidthDeg);
      const where = `${entry.id} at ${label} (${s.hBeamwidthDeg.toFixed(1)} x `
        + `${s.vBeamwidthDeg.toFixed(1)} deg implies ${implied.toFixed(2)} dBi)`;
      assert.ok(s.peakGainDbi <= implied + SEARCH_SLACK_DB,
        `${where}: ${s.peakGainDbi.toFixed(2)} dBi is more gain than that beam can hold`);
      assert.ok(s.peakGainDbi >= implied - UNDER_BOUND_DB,
        `${where}: ${s.peakGainDbi.toFixed(2)} dBi is far under the beam it draws`);
      assert.ok(s.frontToBackDb > 0, `${where}: a directional antenna has a back`);
    }
  }
});

test('antenna physics: a Yagi beats a biquad, and is narrower doing it', () => {
  const yagi = summaryAt('yagi', createDefaultParams('yagi'));
  const biquad = summaryAt('biquad-reflector', createDefaultParams('biquad-reflector'));
  assert.ok(yagi.peakGainDbi > biquad.peakGainDbi,
    `a Yagi must have more gain than a biquad, not ${yagi.peakGainDbi.toFixed(2)} against `
    + `${biquad.peakGainDbi.toFixed(2)} dBi`);
  assert.ok(yagi.hBeamwidthDeg < biquad.hBeamwidthDeg,
    `the Yagi must be narrower in azimuth (${yagi.hBeamwidthDeg.toFixed(1)} vs `
    + `${biquad.hBeamwidthDeg.toFixed(1)} deg)`);
  assert.ok(yagi.vBeamwidthDeg < biquad.vBeamwidthDeg,
    `the Yagi must be narrower in elevation (${yagi.vBeamwidthDeg.toFixed(1)} vs `
    + `${biquad.vBeamwidthDeg.toFixed(1)} deg)`);
});

test('antenna physics: gain and beamwidth move in opposite directions', () => {
  const sweeps = [
    { id: 'yagi', key: 'directors', values: [2, 3, 5, 7, 10, 14] },
    { id: 'biquad-reflector', key: 'turns', values: [1, 2, 3] },
    { id: 'patch', key: 'sizeLambda', values: [0.7, 1.0, 1.5] },
  ];
  for (const sweep of sweeps) {
    const rows = sweep.values.map((value) => {
      const s = summaryAt(sweep.id, { ...createDefaultParams(sweep.id), [sweep.key]: value });
      return { value, gain: s.peakGainDbi, h: s.hBeamwidthDeg, v: s.vBeamwidthDeg };
    });
    for (let i = 1; i < rows.length; i += 1) {
      const before = rows[i - 1];
      const after = rows[i];
      const where = `${sweep.id} ${sweep.key} ${before.value} -> ${after.value}`;
      assert.ok(after.gain > before.gain, `${where}: more aperture must mean more gain`);
      assert.ok(after.h < before.h, `${where}: more gain must mean a narrower azimuth beam`);
      assert.ok(after.v <= before.v + 1e-9, `${where}: the elevation beam must not widen`);
    }
  }
});

test('antenna physics: gains stay in the range these designs are measured at', () => {
  // Published/field figures for hand-built antennas of this kind: a 1-3 turn biquad
  // with a plate reflector lands around 7-10 dBi, a single-row Yagi from ~7 dBi for
  // three elements to ~13 dBi for a 15-element boom, a microstrip patch from ~4 dBi
  // for a small patch to ~10 dBi for a large one. The windows below are those ranges
  // widened by a decibel either side, so a plausible redesign does not break them.
  const windows = {
    'biquad-reflector': [6, 11],
    yagi: [4, 15],
    patch: [3, 11],
  };
  for (const [id, [low, high]] of Object.entries(windows)) {
    for (const [label, params] of probePoints(getAntenna(id))) {
      const gain = nominalGainDbi(id, params);
      assert.ok(gain >= low && gain <= high,
        `${id} at ${label}: ${gain.toFixed(2)} dBi is outside the ${low}-${high} dBi this `
        + 'design is measured at in the field');
    }
  }
});

function getAntenna(id) {
  return ANTENNA_CATALOGUE.find((entry) => entry.id === id);
}

test('antenna physics: the model uses the Kraus arithmetic this test believes', () => {
  // Hand-worked: 41253 / (60 * 60) = 11.46 -> 10.59 dBi.
  const worked = 10 * Math.log10(41253 / 3600);
  assert.ok(Math.abs(krausDirectivityDbi(60, 60) - worked) < 1e-9,
    `60 x 60 deg must be ${worked.toFixed(2)} dBi, got ${krausDirectivityDbi(60, 60).toFixed(2)}`);
  assert.equal(krausDirectivityDbi(40, 70), krausDirectivityDbi(70, 40), 'the two planes are symmetric');
  assert.ok(krausDirectivityDbi(30, 60) > krausDirectivityDbi(40, 60), 'narrower H, more directivity');
  assert.ok(krausDirectivityDbi(60, 30) > krausDirectivityDbi(60, 40), 'narrower V, more directivity');
  assert.ok(Number.isFinite(krausDirectivityDbi(0, 0)), 'a degenerate width cannot divide by zero');
  for (const [h, v] of [[10, 20], [45, 65], [70, 70], [100, 100]]) {
    assert.equal(krausDirectivityDbi(h, v), beamImpliedDirectivityDbi(h, v),
      'the shipped formula must match the one the invariants are stated with');
  }
});
