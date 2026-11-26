/**
 * Unit tests: the knife-edge diffraction model, how a shadow starts, and which point along
 * a path is allowed to be blamed for it.
 *
 * The property that matters most here is continuity. A path is in the geometric shadow the
 * centimetre the ray touches the ground, and before that it is not; if the model charges
 * nothing while the ray clears the ridge and the grazing 6 dB the moment it does, then
 * every map has a one-centimetre cliff in it and every statistic near a shadow line is an
 * artefact of where the samples fell. So these tests walk *through* the shadow line and
 * require the loss to climb rather than jump, and they check that the place where the climb
 * starts is where the Fresnel geometry says it should - about 0.7 zone radii of clearance,
 * which is where the Lee/Maqsood fit of the Fresnel integral stops being a fit.
 *
 * Nothing here asserts a golden decibel. `diffractionLossDb` is allowed to move by a few
 * tenths if the model is refined; it is not allowed to become discontinuous, non-monotone,
 * or to charge a ray that clears everything by many zone radii.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { diffractionLossDb, profileObstructionDb, rayProfile } from '../../src/propagation/los.js';
import { HeightField } from '../../src/terrain/heightfield.js';
import { generateTerrain } from '../../src/terrain/generators.js';
import { resolveSite } from '../../src/terrain/site.js';
import { createAntennaModel } from '../../src/antenna/model.js';
import { createDefaultParams } from '../../src/antenna/catalogue.js';
import { computeCoverage } from '../../src/propagation/coverage.js';
import { pathSamples } from '../../src/propagation/rf.js';
import { createInitialState } from '../../src/app/state.js';
import { fresnelRadiusM, wavelengthM } from '../../src/propagation/rf.js';
import { ANTENNA, RF, WORLD } from '../../src/config.js';

const FREQ = 868e6;

/** The mid-path geometry: an obstruction halfway along a 2 km link. */
const midPath = Object.freeze({ d1: 1000, d2: 1000 });
const lossAt = (excessM) => diffractionLossDb(excessM, midPath.d1, midPath.d2, FREQ);

/***
 * A walked-profile-shaped object: five samples along a 2 km path whose middle sample is a
 * crest `diffractionExcess` above the ray. It has to be samples rather than a summary field,
 * because `profileObstructionDb` reads the samples the way the sweep does; `diffractionExcess`
 * and friends stay on the object because `rayProfile` reports them and other tests read them.
 */
const profileWithWorst = (diffractionExcess) => {
  const total = midPath.d1 + midPath.d2;
  const at = (i, excess) => ({ distance: (total * i) / 4, excess });
  return {
    totalDistance: total,
    diffractionExcess,
    diffractionD1: midPath.d1,
    diffractionD2: midPath.d2,
    points: [at(0, -Infinity), at(1, diffractionExcess - 2), at(2, diffractionExcess),
      at(3, diffractionExcess - 2), at(4, -Infinity)],
  };
};


test('diffraction: the loss climbs through the shadow line instead of stepping over it', () => {
  const r1 = fresnelRadiusM(midPath.d1, midPath.d2, FREQ);
  // Well clear of everything: nothing to diffract, exactly zero, not a small number.
  assert.equal(lossAt(-3 * r1), 0, 'a ray three zone radii clear of the edge loses nothing');

  // Sweep from deep clearance to deep shadow and require no jump anywhere near the line.
  const step = 0.02;
  let previous = lossAt(-2 * r1);
  let biggestStep = 0;
  let biggestStepAt = 0;
  for (let e = -2 * r1 + step; e <= 5 * r1; e += step) {
    const loss = lossAt(e);
    assert.ok(loss >= previous - 1e-9, `the loss must never fall as the edge rises (at ${e} m)`);
    if (loss - previous > biggestStep) {
      biggestStep = loss - previous;
      biggestStepAt = e;
    }
    previous = loss;
  }
  assert.ok(biggestStep < 0.2,
    `the largest single ${step} m step anywhere was ${biggestStep.toFixed(3)} dB at ${biggestStepAt} m`);

  // The textbook anchor: a ray grazing a knife edge loses 6 dB.
  assert.ok(Math.abs(lossAt(0) - 6) < 0.2, `grazing costs about 6 dB, got ${lossAt(0).toFixed(2)}`);
  assert.ok(lossAt(4 * r1) > 20, 'and the deep shadow is worth far more than that');
});

test('diffraction: the climb begins where the Fresnel geometry says it must', () => {
  const r1 = fresnelRadiusM(midPath.d1, midPath.d2, FREQ);
  // Walk down from clear to shadowed and find the first clearance that is charged anything.
  const step = 0.05;
  let firstCharged = null;
  for (let e = -2 * r1; e <= 0; e += step) {
    if (lossAt(e) > 0) {
      firstCharged = -e;
      break;
    }
  }
  assert.ok(firstCharged !== null, 'the loss has to start somewhere before the edge is reached');
  const clearanceInRadii = firstCharged / r1;
  // The published fit is good down to v ~ -0.78; the physical loss below that is fractions
  // of a dB, so "starts between half a radius and one radius clear" is the honest bound.
  assert.ok(clearanceInRadii > 0.5 && clearanceInRadii < 1,
    `the climb started ${clearanceInRadii.toFixed(2)} first-zone radii clear of the edge`);
});

test('diffraction: a profile is charged for its signed worst point', () => {
  const grazing = profileWithWorst(0);
  const clearsByTwoRadii = profileWithWorst(-2 * fresnelRadiusM(midPath.d1, midPath.d2, FREQ));
  assert.ok(profileObstructionDb(grazing, FREQ) > 5,
    'a ray grazing the ground is in the shadow and pays for it');
  assert.equal(profileObstructionDb(clearsByTwoRadii, FREQ), 0,
    'a ray two zone radii clear of the ground is not, and pays nothing');
  // The identity that makes the two functions one story rather than two.
  for (const excess of [-40, -5, -0.5, 0, 0.5, 12]) {
    assert.equal(
      profileObstructionDb(profileWithWorst(excess), FREQ),
      diffractionLossDb(excess, midPath.d1, midPath.d2, FREQ),
      `the profile charge is the knife-edge charge for the worst excess, signed (${excess} m)`,
    );
  }
  // A path with no interior sample at all has no obstruction to charge.
  assert.equal(profileObstructionDb({ diffractionExcess: -Infinity, diffractionD1: 1000, diffractionD2: 1000 }, FREQ), 0,
    'no interior sample means no diffraction, not NaN');
});

test('diffraction: frequency enters through the zone, and only through the zone', () => {
  const bands = Object.freeze([433e6, 868e6, 2.4e9]);
  // A fixed obstruction in metres is deeper in zone radii at a higher band, so it costs
  // more there. (The intuition that "long wavelengths diffract better" is about a fixed
  // obstruction *relative to the zone*, which is the second half of this test.)
  const fiveMetres = bands.map((f) => diffractionLossDb(5, 1000, 1000, f));
  assert.ok(fiveMetres[0] < fiveMetres[1] && fiveMetres[1] < fiveMetres[2],
    `a 5 m edge cost ${fiveMetres.map((l) => l.toFixed(2)).join(' / ')} dB at 433 MHz, 868 MHz, 2.4 GHz`);

  // The same obstruction expressed in zone radii costs the same everywhere: this model is
  // a function of v alone. Worth stating out loud, because it is the whole of what the app
  // can claim about frequency dependence behind an edge.
  const sameRelief = bands.map((f) => {
    const r1 = fresnelRadiusM(1000, 1000, f);
    return diffractionLossDb(0.5 * r1, 1000, 1000, f);
  });
  assert.ok(Math.max(...sameRelief) - Math.min(...sameRelief) < 1e-9,
    `half a zone radius behind the edge cost ${sameRelief.join(' / ')} dB across the bands`);
});

test('diffraction: the ground the receiver stands on is not the thing in the way', () => {
  // The decibels belong to a terminal standing on the ground, so the terrain always meets
  // the ray at the last sample. Charge that and every clear path on the map costs the
  // grazing 6 dB, and the "obstruction" is ranked highest of all because the zone it is
  // judged against collapses towards zero at an antenna. This is the flat world proving it.
  const field = new HeightField({ size: 201, worldSize: 2000 }).fillFromFunction(() => 0);
  const from = { x: -1000, y: 10, z: 0 };
  const to = { x: 1000, y: 0, z: 0 };
  const profile = rayProfile(field, from, to, { samples: 193, freqHz: FREQ });
  assert.ok(profile.maxExcessDistance > 0.95 * profile.totalDistance,
    `the ray gets closest to the ground at its far end, ${profile.maxExcessDistance} of ${profile.totalDistance} m`);
  assert.ok(!Number.isFinite(profile.diffractionExcess),
    'and yet no sample along it is offered up as a screen');
  assert.equal(profileObstructionDb(profile, FREQ), 0, 'so a flat world costs nothing, at any range');

  // A wall right on top of the receiver is excused for the same reason - and that is a
  // stated limit of the model, not an oversight: obstructions within `RF.diffractionNearEndM`
  // of an antenna are not charged. Buildings and hedges that close are what `clutterLossDb`
  // is for.
  const atTheDoor = new HeightField({ size: 201, worldSize: 2000 })
    .fillFromFunction((x) => (Math.abs(x - 990) < 12 ? 8 : 0));
  assert.equal(profileObstructionDb(rayProfile(atTheDoor, from, to, { samples: 193, freqHz: FREQ }), FREQ), 0,
    'a wall 10 m in front of the receiver is the receivers own surroundings, not a knife edge');
  // Move it back outside that distance and the same wall is a real obstruction.
  const roundTheCorner = new HeightField({ size: 201, worldSize: 2000 })
    .fillFromFunction((x) => (Math.abs(x - 900) < 12 ? 8 : 0));
  assert.ok(
    profileObstructionDb(rayProfile(roundTheCorner, from, to, { samples: 193, freqHz: FREQ }), FREQ) > 5,
    'the same wall 100 m back is charged, because it is now in the way',
  );
});

test('diffraction: the first obstacle that costs anything costs less than 6 dB', () => {
  // The claim step-007 exists for. A crest the ray has not yet touched used to cost 0 dB up
  // to the centimetre it was touched and the grazing 6 dB after it: a one-centimetre cliff
  // that no measurement has ever shown. Walk a ridge up through the ray and the loss has to
  // climb - so the first height that is charged at all is charged gently, and 6 dB arrives
  // somewhere in the middle of the climb rather than being the price of entry.
  const worldSize = 8000;
  const ridge = (crestM) => new HeightField({ size: 201, worldSize })
    .fillFromFunction((x, z) => crestM * Math.exp(-((x - 100) ** 2 + z ** 2) / (2 * 300 ** 2)));
  const from = { x: -worldSize / 2 + 200, y: 40, z: 0 };
  const to = { x: worldSize / 2 - 200, y: 0, z: 0 };
  const cost = (crestM) => profileObstructionDb(
    rayProfile(ridge(crestM), from, to, { samples: 401, freqHz: FREQ }), FREQ,
  );
  const heights = [4, 8, 12, 16, 20, 24, 28, 32, 36];
  const depths = heights.map(cost);
  assert.ok(depths[0] === 0, `a 4 m ridge under a ray 20 m up is free (${depths[0].toFixed(2)} dB)`);
  const first = depths.findIndex((db) => db > 0);
  assert.ok(first > 0, `the climb has to start part-way up the ridge list: ${depths.join(' / ')}`);
  assert.ok(depths[first] < 3,
    `the first charged crest cost ${depths[first].toFixed(2)} dB; a jump to the grazing 6 dB here is the bug`);
  for (let i = 1; i < depths.length; i += 1) {
    assert.ok(depths[i] >= depths[i - 1], `raising the ridge cannot help: ${depths.join(' / ')}`);
    assert.ok(depths[i] - depths[i - 1] < 2,
      `no 4 m of ridge should be worth a cliff: ${depths.map((x) => x.toFixed(2)).join(' / ')}`);
  }
  // The grazing 6 dB has to be *crossed*, not landed on: the step that passes it must come
  // from below it, which is exactly what a 0 dB-then-6-dB model cannot do.
  const crossed = depths.findIndex((db) => db >= 6);
  assert.ok(crossed > 0, `the ladder never reaches the grazing loss: ${depths.join(' / ')}`);
  assert.ok(depths[crossed - 1] < 6 && depths[crossed] < 8,
    `6 dB was crossed from ${depths[crossed - 1].toFixed(2)} to ${depths[crossed].toFixed(2)} dB`);
  assert.ok(depths[depths.length - 1] > 12,
    `and a ridge that buries the ray is worth far more (${depths[depths.length - 1].toFixed(2)} dB)`);
});

test('diffraction: on the map the app ships, ground only ever subtracts', () => {
  // The budget pre-filter is allowed to skip a point only because a ray can be losing
  // *nothing* but never losing *less than nothing*, so free space is an upper bound on what
  // the terrain will do. Charging a signed excess puts that argument under pressure - a
  // signed quantity is one sign error away from a path that gains power by passing behind a
  // hill - so the property is checked on every cell the sweep looked at, not assumed.
  const state = createInitialState();
  const field = generateTerrain({ seed: state.terrainSeed, kind: state.terrainKind });
  const site = resolveSite(field, { x: state.site.x, z: state.site.z, heightM: state.heightM });
  const options = {
    field, site, freqHz: FREQ, txPowerDbm: state.txPowerDbm, feederLossDb: state.feederLossDb,
    rxSensitivityDbm: state.rxSensitivityDbm, maxRangeM: state.maxRangeM, clutterLossDb: 0,
    model: createAntennaModel({
      designId: state.designId, params: createDefaultParams(state.designId),
      aim: state.aim, wavelength: wavelengthM(FREQ),
    }),
  };
  const freeSpace = computeCoverage({ ...options, useDiffraction: false });
  const ground = computeCoverage(options);

  let charged = 0;
  let clear = 0;
  for (let i = 0; i < ground.rssi.length; i += 1) {
    if (!ground.evaluated[i] || ground.budgetExcluded[i]) continue;
    assert.ok(ground.obstructionDb[i] >= 0, `cell ${i} was charged ${ground.obstructionDb[i]} dB`);
    assert.ok(ground.rssi[i] <= freeSpace.rssi[i] + 1e-9,
      `cell ${i}: ${ground.rssi[i].toFixed(2)} dBm with ground against ${freeSpace.rssi[i].toFixed(2)} in free space`);
    assert.equal(freeSpace.obstructionDb[i], 0, 'with shadowing off nothing carries a loss');
    if (ground.obstructionDb[i] > 0) charged += 1;
    else clear += 1;
  }
  assert.ok(charged > 0 && clear > 0,
    `both regimes have to exist on this map for the loop above to mean anything (${charged} charged, ${clear} clear)`);
  assert.ok(freeSpace.stats.linkedCells >= ground.stats.linkedCells,
    'turning the ground off cannot leave less of the map served');
});

test('diffraction: the ray walk is dense enough to see the mesh it walks over', () => {
  // A ray sampled too coarsely steps clean over a narrow hill and charges nothing for the
  // ground in the way. The app does not sample at a fixed count: `pathSamples()` gives one
  // sample per terrain cell along the path, because the thing a ray walk can resolve is the
  // mesh it is reading, and no cell of ground should be able to hide a crest. What that is
  // worth was measured on the longest path the map can hold - a legal corner mast looking at
  // the opposite corner - over ridges from one to three cells wide, each slid through the
  // phase of the sample grid: at the old 96-sample cap (4.9 cells apart) the worst case was
  // 6.5 dB short of the same path walked dense, at one sample per cell it is 1.9 dB, and
  // finer than the mesh afterwards buys almost nothing. Dense answers are computed here.
  const cell = WORLD.worldSize / (WORLD.gridSize - 1);
  const corner = ANTENNA.siteLimitsM.max;
  const far = { x: corner, y: 0, z: corner };
  const dist = Math.hypot(far.x + corner, far.z + corner);
  const steps = pathSamples(dist, cell);
  assert.ok(dist / steps <= 1.05 * cell,
    `the longest path gets a sample per terrain cell, got one every ${(dist / steps).toFixed(1)} m`);
  assert.ok((7 * cell) / pathSamples(7 * cell, cell) <= cell,
    'and a short path never steps wider than a cell either');

  let worstDb = 0;
  let coarseWorstDb = 0;
  for (const sigma of [15, 30]) {
    for (const crestM of [6, 16]) {
      for (const shift of [0, 0.25, 0.5, 0.75]) {
        // Slide the ridge by fractions of a *coarse* sample interval, so it is deliberately
        // between the samples of an old 96-sample walk and not sitting on one.
        const at = (shift * dist) / 96 / Math.SQRT2;
        const field = new HeightField({ size: WORLD.gridSize, worldSize: WORLD.worldSize })
          .fillFromFunction((x, z) => crestM * Math.exp(-(((x - at) ** 2 + (z - at) ** 2) / (2 * sigma ** 2))));
        const mast = resolveSite(field, { x: -corner, z: -corner, heightM: ANTENNA.defaultHeightM });
        const walk = (n) => profileObstructionDb(rayProfile(field, mast, far, { samples: n, freqHz: FREQ }), FREQ);
        const dense = walk(4096);
        worstDb = Math.max(worstDb, Math.abs(walk(steps) - dense));
        coarseWorstDb = Math.max(coarseWorstDb, Math.abs(walk(96) - dense));
      }
    }
  }
  assert.ok(worstDb < 2.5,
    `the app's walk was up to ${worstDb.toFixed(2)} dB away from a dense walk of the same paths`);
  // The test has to be able to fail: the same paths walked at the old cap do fail it.
  assert.ok(coarseWorstDb > worstDb + 1.5,
    `96 samples gave ${coarseWorstDb.toFixed(2)} dB of error against ${worstDb.toFixed(2)} at the shipped rule - `
    + 'if that gap closes, this test is measuring nothing');
});
