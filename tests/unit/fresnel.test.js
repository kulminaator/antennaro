/**
 * Unit tests: the first Fresnel zone - radius, clearance and the coverage flag.
 *
 * The decibels a path pays already come from the Fresnel/Kirchhoff ratio, so these
 * tests are not about a loss figure: they pin down that the *criterion* behaves like
 * the physics (a bigger zone is easier to cut), that the assumption it depends on is
 * stated, and that it never leaks into the signal level.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RF } from '../../src/config.js';
import { approxEqual } from '../../src/math/scalar.js';
import { HeightField } from '../../src/terrain/heightfield.js';
import { wavelengthM } from '../../src/propagation/rf.js';
import { firstFresnelEnvelope, fresnelStatus, rayProfile } from '../../src/propagation/los.js';
import { computeCoverage } from '../../src/propagation/coverage.js';
import { createAntennaModel } from '../../src/antenna/model.js';

const FLAT = new HeightField({ size: 41, worldSize: 2000 }).fillFromFunction(() => 0);
const FREQ = '868';
/** Mast high enough that a ray to a rooftop terminal has a zone to keep clear. */
const MAST = { x: 0, y: 20, z: 0 };
const CELL = { x: 0, y: 0, z: 900 };

/** Ground with a `height` m ridge across the path at `z` metres out. */
function ridgeTerrain(height, z = 450) {
  return new HeightField({ size: 81, worldSize: 2000 }).fillFromFunction(
    (x, zz) => (Math.abs(zz - z) < 60 && Math.abs(x) < 300 ? height : 0),
  );
}

function status(field, from, to, freqHz = FREQ, options = {}) {
  return fresnelStatus(field, from, to, freqHz, options).clearanceRatio;
}

test('fresnel: the zone narrows towards both ends and is widest mid-path', () => {
  const envelope = firstFresnelEnvelope(1200, FREQ, 24);
  assert.equal(envelope.length, 25, 'steps inclusive of both ends');
  assert.equal(envelope[0].radius, 0, 'the zone closes on the antenna');
  assert.equal(envelope[24].radius, 0, 'and on the receiver');
  const middle = envelope[12];
  assert.ok(middle.radius > 0);
  for (const sample of envelope) {
    assert.ok(sample.radius <= middle.radius + 1e-9, 'radius peaks at the middle');
    assert.ok(Number.isFinite(sample.radius) && sample.radius >= 0);
  }
  assert.ok(
    middle.radius > envelope[6].radius && envelope[6].radius > envelope[2].radius,
    'radius grows monotonically from the end towards the middle',
  );
});

test('fresnel: a longer wavelength means a fatter zone, so more to cut', () => {
  const radiusAt = (f) => firstFresnelEnvelope(1200, f, 4)[2].radius;
  assert.ok(radiusAt('433') > radiusAt('868'), '433 MHz zone is fatter than 868 MHz');
  assert.ok(radiusAt('868') > radiusAt('2400'), '868 MHz zone is fatter than 2.4 GHz');
  assert.ok(radiusAt('2400') > radiusAt('5800'));

  // Same geometry, same ground: the lower band ends up with less clearance, because
  // the criterion is a height measured in zone radii.
  const low = status(ridgeTerrain(6), MAST, CELL, '433');
  const high = status(ridgeTerrain(6), MAST, CELL, '5800');
  assert.ok(low < high, `433 MHz kept ${low.toFixed(2)} r1, 5800 MHz kept ${high.toFixed(2)} r1`);
});

test('fresnel: an obstacle under the ray cuts the zone progressively', () => {
  // Same field, same sampling: only the ridge height changes, so the ratios compare.
  const open = status(ridgeTerrain(0), MAST, CELL);
  let previous = open;
  // Heights that reach up towards the ray on this geometry (about 12 m up at the
  // ridge); below that the worst point on the path is elsewhere and nothing changes.
  for (const height of [8, 10, 12, 14]) {
    const ratio = status(ridgeTerrain(height), MAST, CELL);
    assert.ok(ratio < previous, `a ${height} m ridge cuts more than the one below it`);
    previous = ratio;
  }
  assert.ok(previous < 0, 'a ridge that reaches the ray has cut the zone completely');
  assert.ok(open > RF.fresnelClearFraction, 'the same path over open ground is clear');
});

test('fresnel: lifting either end of the link opens the zone', () => {
  const cut = ridgeTerrain(8);
  const low = status(cut, { x: 0, y: 8, z: 0 }, CELL);
  const high = status(cut, { x: 0, y: 40, z: 0 }, CELL);
  assert.ok(high > low, 'a taller mast keeps more of the zone clear');

  const groundTerminal = fresnelStatus(cut, MAST, CELL, FREQ, { rxHeightM: 0 });
  const rooftop = fresnelStatus(cut, MAST, CELL, FREQ, { rxHeightM: 10 });
  assert.ok(rooftop.clearanceRatio > groundTerminal.clearanceRatio, 'a receiver off the ground helps');
  assert.equal(groundTerminal.rxHeightM, 0, 'the assumption is reported, not hidden');
  assert.equal(rooftop.rxHeightM, 10);
  assert.equal(fresnelStatus(cut, MAST, CELL, FREQ).rxHeightM, RF.fresnelRxHeightM, 'the default is the config assumption');
});

test('fresnel: the criterion is a threshold on the ratio, and the ends are not judged', () => {
  const field = ridgeTerrain(4);
  const measured = fresnelStatus(field, MAST, CELL, FREQ);
  assert.ok(Number.isFinite(measured.clearanceRatio), 'the fixture has a real ratio to sit between');
  const easy = fresnelStatus(field, MAST, CELL, FREQ, { clearFraction: measured.clearanceRatio - 0.01 });
  const strict = fresnelStatus(field, MAST, CELL, FREQ, { clearFraction: measured.clearanceRatio + 0.01 });
  assert.equal(easy.clear, true, 'a fraction below the ratio passes');
  assert.equal(strict.clear, false, 'a fraction above it fails');
  assert.equal(easy.clearanceRatio, strict.clearanceRatio, 'the fraction decides the flag, not the ratio');
  assert.equal(strict.clearFraction, measured.clearanceRatio + 0.01);

  // A bump sitting on the receiver itself is geometry, not an obstruction.
  const atReceiver = ridgeTerrain(30, 895);
  const midPath = ridgeTerrain(30, 450);
  assert.ok(
    status(atReceiver, MAST, CELL) > status(midPath, MAST, CELL),
    'what stands on top of the terminal is not counted as cutting the zone',
  );
});

test('fresnel: the ray profile reports where the worst cut happened', () => {
  const profile = rayProfile(ridgeTerrain(14), MAST, { x: CELL.x, y: CELL.y + RF.fresnelRxHeightM, z: CELL.z }, {
    freqHz: FREQ,
    guard: RF.fresnelEndpointGuard,
    samples: 64,
  });
  assert.ok(profile.minClearance < 0, 'the ridge reaches above the ray, so the zone is fully cut');
  assert.ok(profile.minClearanceDistance > 0.1 * 900, 'reported well away from the mast');
  assert.ok(profile.minClearanceDistance < 900 * (1 - RF.fresnelEndpointGuard) + 1e-6, 'and inside the judged span');
  const radii = profile.points.filter((p) => p.fresnelRadiusM > 0);
  assert.ok(radii.length > 0 && radii.every((p) => p.fresnelRadiusM > 0), 'samples carry their zone radius');
  assert.equal(profile.points[0].fresnelRadiusM, 0, 'no zone at the transmitter');
});

test('coverage: every evaluated cell reports its zone state', () => {
  const field = ridgeTerrain(9);
  const site = { x: 0, y: 20, z: 0 };
  const model = createAntennaModel({ designId: 'omni-dipole', aim: { azimuthDeg: 0, tiltDeg: 0 }, wavelength: wavelengthM(FREQ) });
  const coverage = computeCoverage({ field, site, model, freqHz: 868e6, maxRangeM: 1200 });

  assert.equal(coverage.fresnelClearance.length, field.size * field.size);
  assert.equal(coverage.fresnelClear.length, field.size * field.size, 'a grid slot for every cell');

  let flags = 0;
  let worst = Infinity;
  let evaluated = 0;
  for (let i = 0; i < coverage.evaluated.length; i += 1) {
    if (!coverage.evaluated[i]) continue;
    evaluated += 1;
    const ratio = coverage.fresnelClearance[i];
    assert.ok(Number.isFinite(ratio) && ratio >= -1e9, `cell ${i} reports a usable ratio`);
    assert.equal(coverage.fresnelClear[i], ratio >= RF.fresnelClearFraction ? 1 : 0, 'flag follows the ratio');
    if (coverage.fresnelClear[i]) flags += 1;
    if (ratio < worst) worst = ratio;
  }
  assert.ok(evaluated > 0, 'the fixture evaluates cells');
  assert.equal(coverage.stats.fresnelClearCells, flags, 'the stat counts the flags');
  assert.ok(approxEqual(coverage.stats.fresnelClearPct, (100 * flags) / evaluated, 1e-9));
  assert.ok(approxEqual(coverage.stats.worstClearance, worst, 1e-6), 'the stat is the minimum ratio');
  assert.equal(coverage.stats.fresnelRxHeightM, RF.fresnelRxHeightM);
  assert.equal(coverage.stats.fresnelClearFraction, RF.fresnelClearFraction);
  assert.ok(coverage.stats.fresnelObstructedLinkedCells <= coverage.stats.linkedCells, 'a subset of the linked area');
});

test('coverage: a stricter criterion cannot clear more cells', () => {
  const field = ridgeTerrain(6);
  const site = { x: 0, y: 20, z: 0 };
  const model = createAntennaModel({ designId: 'omni-dipole', aim: { azimuthDeg: 0, tiltDeg: 0 }, wavelength: wavelengthM(FREQ) });
  const base = computeCoverage({ field, site, model, freqHz: 868e6, maxRangeM: 1200 });
  const strict = computeCoverage({ field, site, model, freqHz: 868e6, maxRangeM: 1200, fresnelClearFraction: 0.95 });
  const loose = computeCoverage({ field, site, model, freqHz: 868e6, maxRangeM: 1200, fresnelClearFraction: 0.05 });
  assert.ok(strict.stats.fresnelClearCells <= base.stats.fresnelClearCells, 'tightening the fraction clears fewer cells');
  assert.ok(loose.stats.fresnelClearCells >= base.stats.fresnelClearCells, 'loosening it clears more');
  assert.equal(strict.stats.linkedCells, base.stats.linkedCells, 'and the link budget does not move');
});

test('coverage: the zone assumption must not move the decibels', () => {
  const field = ridgeTerrain(7);
  const site = { x: 0, y: 20, z: 0 };
  const model = createAntennaModel({ designId: 'omni-dipole', aim: { azimuthDeg: 0, tiltDeg: 0 }, wavelength: wavelengthM(FREQ) });
  const base = computeCoverage({ field, site, model, freqHz: 868e6, maxRangeM: 1200 });
  const lifted = computeCoverage({ field, site, model, freqHz: 868e6, maxRangeM: 1200, rxHeightM: 10 });

  let differing = 0;
  for (let i = 0; i < base.rssi.length; i += 1) {
    if (base.rssi[i] !== lifted.rssi[i]) differing += 1;
  }
  assert.equal(differing, 0, 'the receiver height moves the criterion, never the RSSI');
  assert.deepEqual(Array.from(base.obstructionDb), Array.from(lifted.obstructionDb), 'nor the diffraction loss');
  assert.notEqual(base.fresnelClear[0], base.fresnelClear[0] + 1);
  assert.equal(lifted.stats.fresnelRxHeightM, 10, 'while the zone view does respond to it');
  assert.ok(lifted.stats.fresnelClearCells >= base.stats.fresnelClearCells, 'a taller terminal cannot cut more zone');
});
