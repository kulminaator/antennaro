/**
 * Unit tests: what the coverage **grid** is, and what the whole-map sweep promises.
 *
 * These are the contracts that make the drape trustworthy at the scale of the whole
 * map: the pre-filter may never move a link boundary, the grid may not pretend to know
 * more than it evaluated, and when something other than the link cuts the coverage off
 * the result has to say so out loud. Model *behaviour* (shadowing, aiming, bands) is in
 * `coveragebehaviour.test.js`; the radio maths itself is in `propagation.test.js`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RF, WORLD } from '../../src/config.js';
import { approxEqual } from '../../src/math/scalar.js';
import { generateTerrain } from '../../src/terrain/generators.js';
import { resolveSite } from '../../src/terrain/site.js';
import { createAntennaModel } from '../../src/antenna/model.js';
import { createDefaultParams } from '../../src/antenna/catalogue.js';
import { wavelengthM } from '../../src/propagation/rf.js';
import {
  SECTOR_COUNT, SECTOR_LABELS, bandFor, computeCoverage, coverageLegend, sampleCoverage, sectorIndexForAzimuth,
} from '../../src/propagation/coverage.js';

const freqHz = 868e6;

/** The default map, the one the user sees: whole world, full resolution. */
const map = generateTerrain();
const centre = resolveSite(map, { heightM: 10 });

/** A smaller map so the sweep-heavy tests stay quick. */
const small = generateTerrain({ size: 81, worldSize: 2400, seed: 4242 });
const smallSite = resolveSite(small, { heightM: 12 });

function omni() {
  return createAntennaModel({ designId: 'omni-dipole', aim: { azimuthDeg: 0, tiltDeg: 0 }, wavelength: wavelengthM(freqHz) });
}

function yagiEast() {
  return createAntennaModel({
    designId: 'yagi', params: createDefaultParams('yagi'),
    aim: { azimuthDeg: 90, tiltDeg: 0 }, wavelength: wavelengthM(freqHz),
  });
}

function biquad() {
  return createAntennaModel({
    designId: 'biquad-reflector', params: createDefaultParams('biquad-reflector'),
    aim: { azimuthDeg: 90, tiltDeg: 0 }, wavelength: wavelengthM(freqHz),
  });
}

/** Sweep the whole map the way the application does: no range clamp from the test. */
function wholeMap(options) {
  return computeCoverage({
    field: map, site: centre, freqHz, feederLossDb: 1.5, ...options,
  });
}

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

test('coverage: the grid is a decimation of the ground, not a copy of it', () => {
  const run = computeCoverage({
    field: small, site: smallSite, model: omni(), freqHz, txPowerDbm: 10, maxRangeM: 1000,
  });
  assert.equal(run.stride, RF.coverageStride);
  assert.equal(run.terrainSize, small.size, 'it remembers whose ground it stands on');
  assert.equal(run.size, Math.floor((small.size - 1) / run.stride) + 1,
    'one coverage point per stride-th terrain vertex, the last row included');
  assert.equal(run.cellSize, small.cellSize * run.stride, 'a coverage cell is that many ground cells wide');
  assert.equal(run.stats.coverageCellSizeM, run.cellSize);
  for (const [name, array] of Object.entries({
    rssi: run.rssi, level: run.level, evaluated: run.evaluated, distanceM: run.distanceM,
    obstructionDb: run.obstructionDb, fresnelClearance: run.fresnelClearance,
    fresnelClear: run.fresnelClear, budgetExcluded: run.budgetExcluded,
  })) {
    assert.equal(array.length, run.size * run.size, `${name} is indexed by coverage point, not terrain vertex`);
  }
  assert.equal(run.stats.cells, run.size * run.size);
  assert.ok(run.cellSize > 20 && run.cellSize < 200,
    `a coverage cell is coarse enough to be cheap and fine enough to show a beam (${run.cellSize} m)`);

  // The stride is a knob, not a law: stride 1 must still be a legal, finer answer.
  const fine = computeCoverage({
    field: small, site: smallSite, model: omni(), freqHz, txPowerDbm: 10, maxRangeM: 1000, stride: 1,
  });
  assert.equal(fine.size, small.size, 'stride 1 evaluates every terrain vertex');
  assert.equal(fine.cellSize, small.cellSize);
  assert.ok(fine.stats.linkedCells > run.stats.linkedCells * 0.9,
    'a finer grid finds about the same links, just more of them per point');
});

test('coverage: the whole map is looked at, and the sweep says what limited it', () => {
  const dipole = wholeMap({ model: omni(), txPowerDbm: 10 });
  const { stats } = dipole;
  assert.equal(stats.studyRangeM, RF.defaultMaxRangeM, 'the default study area comes from config');
  assert.ok(stats.studyRangeM >= map.worldSize / 2,
    'the default study area reaches past the map edge, so no ring can masquerade as range');
  assert.equal(stats.limitingFactor, 'budget', 'a modest link over this map is limited by its own budget');
  assert.equal(stats.clippedByRangeCells, 0, 'nothing is cut by our own work area');
  assert.equal(stats.clippedByMapCells, 0, 'and nothing by the edge of the world either');
  assert.ok(stats.budgetExcludedCells > 0, 'the far map is dismissed by arithmetic, not by rays');

  // A study range that bites must be reported, not drawn as an antenna limit.
  const clamped = wholeMap({ model: omni(), txPowerDbm: 10, maxRangeM: 600 });
  assert.equal(clamped.stats.limitingFactor, 'study-range');
  assert.ok(clamped.stats.clippedByRangeCells > 0, 'linked points sit on the rim we drew');
  assert.ok(clamped.stats.maxLinkedRangeM < 620, 'and the reach stops there');

  // A mast with more reach than the world, near an edge.
  const edgeSite = resolveSite(map, { x: -WORLD.worldSize / 2 + 200, z: 0, heightM: 10 });
  const loud = computeCoverage({
    field: map, site: edgeSite, model: biquad(), freqHz, txPowerDbm: 27, feederLossDb: 1.5,
  });
  assert.ok(loud.stats.budgetRangeM > loud.stats.nearestMapEdgeM * 2,
    'the budget reaches far past the map');
  assert.equal(loud.stats.limitingFactor, 'map-edge', 'the world runs out first, and says so');
  assert.ok(loud.stats.clippedByMapCells > 0);
});

test('coverage: the budget pre-filter cannot move the link boundary', () => {
  const cases = [
    ['dipole over the whole map', { field: map, site: centre, model: omni(), txPowerDbm: 10 }],
    ['Yagi aimed east across the map', { field: map, site: centre, model: yagiEast(), txPowerDbm: 20 }],
    ['biquad, high power, worst case', wholeMapCase()],
  ];
  for (const [title, options] of cases) {
    const filtered = computeCoverage({ field: map, site: centre, freqHz, feederLossDb: 1.5, ...options });
    const walked = computeCoverage({
      field: map, site: centre, freqHz, feederLossDb: 1.5, ...options, budgetPrefilter: false,
    });
    assert.equal(filtered.stats.budgetExcludedCells > 0, true, `${title}: the filter must actually be working`);

    let excluded = 0;
    let linkedDiff = 0;
    let bandDiff = 0;
    let walkedDrift = 0;
    for (let i = 0; i < filtered.evaluated.length; i += 1) {
      assert.equal(filtered.evaluated[i], walked.evaluated[i], `${title}: same points looked at`);
      const a = filtered.evaluated[i] === 1;
      if (!a) continue;
      if (filtered.rssi[i] >= filtered.sensitivityDbm !== walked.rssi[i] >= walked.sensitivityDbm) linkedDiff += 1;
      if (filtered.level[i] !== walked.level[i]) bandDiff += 1;
      if (filtered.budgetExcluded[i] === 1) {
        excluded += 1;
        // The value stored is the free-space upper bound, so the true value can only
        // be lower - and it must still miss, or the bound was wrong.
        assert.ok(walked.rssi[i] <= filtered.rssi[i] + 1e-4, `${title}: the bound is an upper bound`);
        assert.ok(walked.rssi[i] < walked.sensitivityDbm, `${title}: a dismissed point could not have linked`);
      } else {
        walkedDrift = Math.max(walkedDrift, Math.abs(filtered.rssi[i] - walked.rssi[i]));
      }
    }
    assert.equal(linkedDiff, 0, `${title}: the shortcut changed which points link`);
    assert.equal(bandDiff, 0, `${title}: the shortcut changed a band`);
    assert.equal(walkedDrift, 0, `${title}: a point that was walked must be bit-identical`);
    assert.equal(filtered.stats.linkedCells, walked.stats.linkedCells, `${title}: linked total`);
    assert.equal(filtered.stats.maxLinkedRangeM, walked.stats.maxLinkedRangeM, `${title}: reach`);
    assert.ok(excluded > 0, `${title}: nothing was skipped, so this proved nothing`);
  }
});

/** The most expensive sweep the application can be asked for: gain, power, whole map. */
function wholeMapCase() {
  return { field: map, site: centre, model: biquad(), txPowerDbm: 27 };
}

test('coverage: statistics describe what was measured, to whom', () => {
  const { stats } = wholeMap({ model: yagiEast(), txPowerDbm: 17 });
  assert.ok(stats.evaluatedCells > 0.9 * stats.cells,
    `the default sweep covers the map, not a disc (${stats.evaluatedCells} of ${stats.cells})`);
  assert.ok(stats.linkedCells > 0, 'and finds links');

  // The three zone buckets are a partition of the walked set; the linked shares are a
  // partition of the linked set. Both have to add up, and neither may be quoted
  // against the other's denominator.
  assert.equal(stats.fresnelDenominatorCells, stats.linkedCells);
  assert.equal(
    stats.fresnelClearLinkedCells + stats.fresnelObstructedLinkedCells, stats.linkedCells,
    'every working link either meets the clearance criterion or does not',
  );
  assert.ok(approxEqual(stats.fresnelClearPct + stats.fresnelObstructedLinkedPct, 100, 0.001),
    'the two shares are of the same denominator');
  assert.equal(
    stats.fresnelClearCells + stats.fresnelPartialCells + stats.fresnelCutCells,
    stats.evaluatedCells - stats.budgetExcludedCells,
    'the colour ramp buckets account for every point the ground was asked about',
  );

  // Decibel statistics are over walked points, so the dismissed tail cannot drag them.
  assert.ok(stats.meanDbm < 0 && stats.meanDbm > -140, 'a plausible median-world RSSI');
  assert.ok(stats.worstDbm >= -160 && stats.bestDbm < 40, 'and plausible extremes');
  assert.equal(stats.budgetRangeM > 0, true, 'the free-space reach of the boresight is reported');
  assert.ok(stats.nearestMapEdgeM <= map.worldSize / 2, 'and the distance to the edge of the world');

  // Two shares of the links, and the reader has to be able to tell them apart: of what
  // was possible, and of the whole map.
  assert.equal(stats.walkedCells, stats.evaluatedCells - stats.budgetExcludedCells);
  assert.ok(approxEqual(stats.mapCoveragePct, (100 * stats.linkedCells) / stats.evaluatedCells, 1e-9),
    'map coverage is the whole-study-area share');
  assert.ok(approxEqual(stats.linkAvailabilityPct, (100 * stats.linkedCells) / stats.walkedCells, 1e-9),
    'link availability is the share of ground where a link was possible');
  assert.ok(stats.linkAvailabilityPct >= stats.mapCoveragePct,
    'a share of what was possible is never smaller than a share of the whole map');
  assert.equal(stats.sectors.reduce((acc, sector) => acc + sector.evaluated, 0), stats.evaluatedCells,
    'the direction table accounts for every looked-at point');
  for (const sector of stats.sectors) {
    assert.ok(sector.excluded <= sector.evaluated, 'a sector cannot dismiss more than it saw');
    assert.ok(sector.linked <= sector.evaluated - sector.excluded,
      `${sector.label}: links only appear among the points the ground was asked about`);
  }
});

test('coverage: sampling finds the nearest evaluated coverage point', () => {
  const run = computeCoverage({
    field: small, site: smallSite, model: omni(), freqHz, txPowerDbm: 10, maxRangeM: 1000,
  });
  assert.equal(sampleCoverage(run, small, 90_000, 0), null, 'off the map');
  assert.equal(sampleCoverage(run, small, 5000, 0), null, 'beyond the edge of the world');
  assert.equal(sampleCoverage(run, small, 4, 4), null, 'inside the transmitter footprint');
  const probe = sampleCoverage(run, small, 400, 0);
  assert.ok(probe && Number.isFinite(probe.rssiDbm), 'a real point samples');
  assert.ok(Math.abs(probe.distanceM - 400) <= small.cellSize * run.stride,
    `the sample belongs to the point nearest the request (${probe.distanceM})`);
  assert.equal(typeof probe.budgetExcluded, 'boolean', 'and says whether the ground was asked at all');

  const legend = coverageLegend(run);
  assert.equal(legend.length, RF.levelMarginsDb.length);
  for (let i = 1; i < legend.length; i += 1) {
    assert.ok(legend[i].minDbm < legend[i - 1].minDbm, 'legend thresholds descend');
  }
  assert.equal(bandFor(legend[0].minDbm, run), 0);
  assert.equal(bandFor(-200, run), RF.levelMarginsDb.length);
});
