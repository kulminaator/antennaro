/**
 * Unit tests: what the ground and the curved earth do to the served ground.
 *
 * Layer: test (unit).
 *
 * The mirror image of coveragebehaviour.test.js: here the antenna is fixed and the planet
 * moves. A bearing behind a ridge is not served, switching diffraction off makes the
 * dB disappear but not the terrain, the sweep reports how much round earth it involved,
 * and the last test is the one README quotes - turning terrain shadowing off for dB must
 * not flatten the earth the Fresnel zone is walked over.

 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { RF, WORLD } from '../../src/config.js';
import { approxEqual } from '../../src/math/scalar.js';
import { HeightField } from '../../src/terrain/heightfield.js';
import { generateTerrain } from '../../src/terrain/generators.js';
import { resolveSite } from '../../src/terrain/site.js';
import { createAntennaModel } from '../../src/antenna/model.js';
import { sampleCoverage, sectorIndexForAzimuth } from '../../src/propagation/coverage.js';
import { fresnelStatus } from '../../src/propagation/los.js';
import { computeCoverage } from '../../src/propagation/coverage.js';
import { earthBulgeM, radioHorizonM, wavelengthM } from '../../src/propagation/rf.js';

const freqHz = 868e6;
const field = generateTerrain({ size: 81, worldSize: 2400, seed: 4242 });
const site = resolveSite(field, { heightM: 12 });

function omni(tiltDeg = 0) {
  return createAntennaModel({ designId: 'omni-dipole', aim: { azimuthDeg: 0, tiltDeg }, wavelength: wavelengthM(freqHz) });
}

const baseCoverage = computeCoverage({
  field, site, model: omni(), freqHz, txPowerDbm: 10, maxRangeM: 1000,
});

/** The map the user boots into, mast on the centre saddle. */
const map = generateTerrain();
const mapSite = resolveSite(map, { heightM: 12 });

/** Mean diffraction loss per compass sector, read off the coverage grid itself. */
function obstructionBySector(coverage, ground, siteOf) {
  const sums = coverage.stats.sectors.map(() => ({ sum: 0, n: 0 }));
  for (let gz = 0; gz < coverage.size; gz += 1) {
    for (let gx = 0; gx < coverage.size; gx += 1) {
      const index = gz * coverage.size + gx;
      if (!coverage.evaluated[index]) continue;
      const x = ground.worldX(Math.min(gx * coverage.stride, ground.size - 1));
      const z = ground.worldZ(Math.min(gz * coverage.stride, ground.size - 1));
      const az = (Math.atan2(x - siteOf.x, -(z - siteOf.z)) * 180) / Math.PI;
      const bucket = sums[sectorIndexForAzimuth(az)];
      bucket.sum += coverage.obstructionDb[index];
      bucket.n += 1;
    }
  }
  return sums.map((bucket, i) => ({
    label: coverage.stats.sectors[i].label,
    linkedPct: coverage.stats.sectors[i].linkedPct,
    maxRangeM: coverage.stats.sectors[i].maxRangeM,
    meanObstructionDb: bucket.n === 0 ? 0 : bucket.sum / bucket.n,
  }));
}

test('coverage: the open bearing is served, the wall is not, and the wall is the terrain', () => {
  // The default map: high ground to the west and north, open to the south-east.
  const run = computeCoverage({
    field: map, site: mapSite, model: omni(), freqHz, txPowerDbm: 10, maxRangeM: 1200,
  });
  const bySector = obstructionBySector(run, map, mapSite);
  const best = bySector.reduce((a, b) => (b.linkedPct > a.linkedPct ? b : a));
  const worst = bySector.reduce((a, b) => (b.linkedPct < a.linkedPct ? b : a));
  assert.ok(best.linkedPct > worst.linkedPct + 30,
    `the same antenna serves ${best.label} (${best.linkedPct.toFixed(0)}%) and hardly ${worst.label} (${worst.linkedPct.toFixed(0)}%)`);
  assert.ok(best.maxRangeM > worst.maxRangeM, 'the open bearing also reaches further');
  assert.ok(worst.meanObstructionDb > best.meanObstructionDb + 5,
    `and the difference is the ground, not the pattern: ${worst.meanObstructionDb.toFixed(1)} dB vs ${best.meanObstructionDb.toFixed(1)} dB`);
  assert.ok(bySector.every((sector) => sector.linkedPct <= best.linkedPct + 1e-9));
  assert.ok(best.meanObstructionDb < 3, `the served bearing is nearly unobstructed (${best.meanObstructionDb.toFixed(1)} dB)`);
});

test('coverage: switching terrain shadowing off makes the shadow disappear', () => {
  const freeSpace = computeCoverage({
    field, site, model: omni(), freqHz, txPowerDbm: 10, maxRangeM: 1000, useDiffraction: false,
  });
  let withLoss = 0;
  let withoutLoss = 0;
  let anyObstruction = false;
  for (let i = 0; i < baseCoverage.evaluated.length; i += 1) {
    if (!baseCoverage.evaluated[i]) continue;
    withLoss += baseCoverage.rssi[i];
    withoutLoss += freeSpace.rssi[i];
    if (freeSpace.obstructionDb[i] > 0) anyObstruction = true;
  }
  assert.ok(withoutLoss > withLoss, 'free space is always at least as strong as diffracted');
  assert.ok(freeSpace.stats.maxLinkedRangeM >= baseCoverage.stats.maxLinkedRangeM);
  assert.equal(anyObstruction, false, 'with shadowing disabled no point carries obstruction loss');
});

test('coverage: the sweep says how much round earth was involved', () => {
  // Curvature is a number the reader should be able to check from the report alone, so
  // the sweep publishes it: the factor it used, how much ground bulged into the middle of
  // the longest working link, and how far a link of these two heights would reach over a
  // perfectly smooth earth.
  const quiet = computeCoverage({
    field: map, site: mapSite, model: omni(), freqHz,
    feederLossDb: 1.5, txPowerDbm: 10, rxSensitivityDbm: -80, maxRangeM: RF.defaultMaxRangeM,
    clutterLossDb: 0, useDiffraction: true,
  }).stats;
  assert.equal(quiet.kFactor, RF.kFactor, 'the stats name the refraction factor they used');
  assert.ok(Number.isFinite(quiet.earthBulgeUnderMaxLinkM) && quiet.earthBulgeUnderMaxLinkM > 0);
  assert.ok(Number.isFinite(quiet.radioHorizonM) && quiet.radioHorizonM > 0);

  // Neither number may drift from the maths it comes from.
  const half = quiet.maxLinkedRangeM / 2;
  assert.ok(approxEqual(quiet.earthBulgeUnderMaxLinkM, earthBulgeM(half, half, RF.kFactor), 1e-12),
    'the bulge is the bulge of the reported last link, nothing else');
  assert.equal(quiet.radioHorizonM, radioHorizonM(mapSite.heightM, RF.fresnelRxHeightM, RF.kFactor),
    'the horizon is for this mast and the stated receiver height');
  assert.ok(quiet.radioHorizonM > WORLD.worldSize,
    `and on this map the horizon (${(quiet.radioHorizonM / 1000).toFixed(1)} km) is off the edge: the curvature cannot be what ended the coverage`);
  assert.ok(quiet.earthBulgeUnderMaxLinkM < 0.2,
    `the longest link had ${quiet.earthBulgeUnderMaxLinkM.toFixed(3)} m of bulge to curve over`);

  // A longer link meets more curved ground - quadratic in distance, so this is the one
  // direction the number can move in.
  const loud = computeCoverage({
    field: map, site: mapSite, model: omni(), freqHz,
    feederLossDb: 1.5, txPowerDbm: 30, rxSensitivityDbm: -80, maxRangeM: RF.defaultMaxRangeM,
    clutterLossDb: 0, useDiffraction: true,
  }).stats;
  assert.ok(loud.maxLinkedRangeM > quiet.maxLinkedRangeM, 'the louder link reaches further');
  assert.ok(loud.earthBulgeUnderMaxLinkM > quiet.earthBulgeUnderMaxLinkM, 'and curves over more world');

  // Nothing linked: no link, so no bulge - and never a NaN into the read-out.
  const dead = computeCoverage({
    field: map, site: mapSite, model: omni(), freqHz,
    feederLossDb: 1.5, txPowerDbm: 10, rxSensitivityDbm: -20, maxRangeM: 100,
    clutterLossDb: 0, useDiffraction: true,
  }).stats;
  assert.equal(dead.linkedCells, 0, 'a receiver that only hears -20 dBm links nothing here');
  assert.equal(dead.earthBulgeUnderMaxLinkM, 0, 'and an absent link bulges nothing');
});

test('coverage: switching the terrain off for dB does not flatten the earth for the zone', () => {
  // `useDiffraction: false` is a reference mode: the decibels become free space, which
  // is only honest if the panel says so, because it quietly stops asking the ground any
  // question that costs dB - including "what is over the horizon". The reliability verdict
  // is a different question, and it keeps being asked of the real, curved world. Both
  // halves of that are pinned here, so the label and the behaviour cannot drift apart.
  const on = computeCoverage({
    field, site, model: omni(), freqHz, txPowerDbm: 10, feederLossDb: 1.5,
    rxSensitivityDbm: -80, maxRangeM: 1000, clutterLossDb: 0, useDiffraction: true,
  });
  const off = computeCoverage({
    field, site, model: omni(), freqHz, txPowerDbm: 10, feederLossDb: 1.5,
    rxSensitivityDbm: -80, maxRangeM: 1000, clutterLossDb: 0, useDiffraction: false,
  });

  let asked = 0;
  let shadowed = 0;
  for (let i = 0; i < on.rssi.length; i += 1) {
    if (!on.evaluated[i] || on.budgetExcluded[i]) continue;
    asked += 1;
    if (on.obstructionDb[i] > 0) shadowed += 1;
    assert.equal(off.obstructionDb[i], 0, 'shadowing off pays the ground nothing anywhere');
    assert.equal(off.fresnelClearance[i], on.fresnelClearance[i],
      'and the zone verdict is exactly the answer the real ground gave');
    assert.equal(off.fresnelClear[i], on.fresnelClear[i], 'flag and all');
  }
  assert.ok(asked > 100, `this swept ${asked} points, which is not a test of anything`);
  assert.ok(shadowed > 0, 'the terrain has to actually shadow something for this to mean anything');

  // And the answer it keeps giving is the *curved* one. Over a plane the curvature has
  // nothing to hide behind, so the two walks can be told apart exactly - and the curved
  // earth is the worse of the two: the surface bows up into the space the ray needs, so
  // clearance shrinks. (A standard atmosphere bends rays *down*, which is exactly why the
  // equivalent earth is rounder; any model in which curvature helps a link has the sign
  // the wrong way round, and this assertion is what catches it.)
  const plane = new HeightField({ size: 121, worldSize: 3800 }).fillFromFunction(() => 0);
  const from = { x: -1800, y: 4, z: 0 };
  const to = { x: 1800, y: 0, z: 0 };
  const curved = fresnelStatus(plane, from, to, freqHz);
  const straight = fresnelStatus(plane, from, to, freqHz, { kFactor: 1e12 });
  assert.ok(Number.isFinite(curved.clearanceRatio) && Number.isFinite(straight.clearanceRatio));
  assert.ok(curved.clearanceRatio < straight.clearanceRatio,
    `a standard atmosphere takes room off the ray: ${curved.clearanceRatio.toFixed(4)} against `
    + `${straight.clearanceRatio.toFixed(4)} zone radii with the curve switched off`);
});
