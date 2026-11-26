/**
 * Deygout multi-edge diffraction: several screens on one path.
 *
 * Invariants and relationships, never golden decibels. Every comparison is between two
 * walks the test itself performs, and every profile is built through the app's own
 * `rayProfile` over a `HeightField`, so the edges come out of the same sampler the
 * coverage picture uses rather than out of a hand-written point list.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { RF } from '../../src/config.js';
import { HeightField } from '../../src/terrain/heightfield.js';
import { resolveSite } from '../../src/terrain/site.js';
import { createAntennaModel } from '../../src/antenna/model.js';
import { computeCoverage, sampleCoverage } from '../../src/propagation/coverage.js';
import { diffractionLossDb, multiEdgeDiffractionDb } from '../../src/propagation/diffraction.js';
import { profileObstructionDb, rayProfile } from '../../src/propagation/los.js';
import { screenEdges } from '../../src/propagation/diffraction.js';
import { wavelengthM } from '../../src/propagation/rf.js';

const FREQ = 868e6;
const SIZE = 161;
const WORLD_SIZE = 4000;

const TX = { x: -1800, y: 10, z: 0 };
const RX = { x: 1700, y: 0, z: 0 };

/** One triangular ridge, `crestM` tall, `baseM` wide, centred at `atX`. */
function ridgeProfile(ridges) {
  const field = new HeightField({ size: SIZE, worldSize: WORLD_SIZE })
    .fillFromFunction((x) => {
      let h = 0;
      for (const ridge of ridges) {
        const half = ridge.baseM / 2;
        const d = Math.abs(x - ridge.atX);
        if (d < half) h = Math.max(h, ridge.crestM * (1 - d / half));
      }
      return h;
    });
  const to = { x: RX.x, y: field.sample(RX.x, RX.z), z: RX.z };
  return { field, profile: rayProfile(field, TX, to, { freqHz: FREQ }) };
}

const lossOf = (entry) => multiEdgeDiffractionDb(entry.profile.points, entry.profile.totalDistance, FREQ);
const one = (ridge) => ridgeProfile([ridge]);

test('diffraction: one screen is exactly the single knife-edge loss for it', () => {
  const entry = one({ atX: -400, crestM: 14, baseM: 600 });
  const multi = lossOf(entry);
  const single = diffractionLossDb(
    entry.profile.diffractionExcess, entry.profile.diffractionD1, entry.profile.diffractionD2, FREQ,
  );
  assert.ok(multi > 6, `the ridge has to actually obstruct, got ${multi} dB`);
  assert.ok(Math.abs(multi - single) < 0.1,
    `one edge must reduce to the knife-edge formula: ${multi} vs ${single} dB`);
  assert.ok(Math.abs(multi - profileObstructionDb(entry.profile, FREQ)) < 0.1,
    'and the picture cannot charge something else for the same path');
});

test('diffraction: nothing in the way costs nothing', () => {
  const entry = ridgeProfile([]);
  assert.equal(lossOf(entry), 0);
  assert.equal(profileObstructionDb(entry.profile, FREQ), 0);
});

test('diffraction: a second ridge costs something, but not another ridge', () => {
  const ridge = { atX: -600, crestM: 14, baseM: 500 };
  const far = { atX: 800, crestM: 14, baseM: 500 };
  const alone = lossOf(one(ridge));
  const second = lossOf(one(far));
  const both = lossOf(ridgeProfile([ridge, far]));
  assert.ok(both > alone, `two ridges must cost more than one: ${both} vs ${alone} dB`);
  assert.ok(both < alone + second,
    `and less than the two charged separately - the second stands in the first's shadow: `
    + `${both} vs ${alone + second} dB`);
});

test('diffraction: raising the screen nearest the receiver never makes the path cheaper', () => {
  // Monotone in the last screen, always: nothing behind it depends on its height, so its own
  // term can only grow. Raising a *preceding* screen is a different matter and is the next
  // test's subject.
  const low = { atX: -700, crestM: 8, baseM: 500 };
  const far = { atX: 700, crestM: 6, baseM: 500 };
  let previous = -1;
  for (const crestM of [4, 6, 8, 10, 12, 16, 20]) {
    const loss = lossOf(ridgeProfile([low, { ...far, crestM }]));
    assert.ok(loss >= previous - 1e-9,
      `a taller far ridge cost less: ${loss} dB at ${crestM} m against ${previous} dB`);
    previous = loss;
  }
  assert.ok(previous > 0, 'and the tall far ridge actually obstructs');
});

test('diffraction: Deygout is not monotone in a preceding screen, and that is its own doing', () => {
  // The construction measures each screen against the line grazed over the steepest screen
  // before it. Raise the near screen and its own term grows while the line it casts over the
  // far screen rises faster, so the far screen's term collapses: measured here, 8 m of near
  // ridge costs 13.32 dB and 12 m of the same ridge costs 9.99 dB, a link that gets better
  // when a hill gets taller. Physically impossible, and an artefact - measured against the
  // *direct* ray line every screen's height falls as the mast rises. Pinned rather than
  // papered over: this is the property that decides whether the sweep can use the sum, and
  // if the model is ever replaced the test has to be read first.
  const far = { atX: 700, crestM: 6, baseM: 500 };
  const near8 = lossOf(ridgeProfile([{ atX: -700, crestM: 8, baseM: 500 }, far]));
  const near12 = lossOf(ridgeProfile([{ atX: -700, crestM: 12, baseM: 500 }, far]));
  assert.ok(near12 < near8 - 1,
    `expected the known non-monotonicity, got ${near8} dB at 8 m and ${near12} dB at 12 m`);
  // The single-screen model this would replace has no such wrinkle.
  const singleOf = (crestM) => {
    const entry = one({ atX: -700, crestM, baseM: 500 });
    return profileObstructionDb(entry.profile, FREQ);
  };
  assert.ok(singleOf(12) > singleOf(8), 'one screen: a taller ridge always costs more');
});

test('diffraction: a long slope is one screen, not one per sample', () => {
  // A mesa: a rise that runs for a kilometre before it levels off. Every sample of that
  // slope is above the ray, so without collapsing contiguous obstruction into one edge the
  // superposition would charge the same hillside again and again.
  const field = new HeightField({ size: SIZE, worldSize: WORLD_SIZE })
    .fillFromFunction((x) => {
      if (x < -1200 || x > 900) return 0;
      return x < -200 ? 12 * (x + 1200) / 1000 : 12;
    });
  const to = { x: RX.x, y: field.sample(RX.x, RX.z), z: RX.z };
  const profile = rayProfile(field, TX, to, { freqHz: FREQ });
  const buried = profile.points.filter((p) => Number.isFinite(p.excess) && p.excess > 0).length;
  assert.ok(buried > 8, `the slope has to bury the ray over many samples, got ${buried}`);
  const multi = multiEdgeDiffractionDb(profile.points, profile.totalDistance, FREQ);
  const single = diffractionLossDb(
    profile.diffractionExcess, profile.diffractionD1, profile.diffractionD2, FREQ,
  );
  assert.ok(multi > 6, `the plateau has to obstruct, got ${multi} dB`);
  assert.ok(multi < single + 0.1,
    `one slope charged once: ${multi} dB against ${single} dB for its single edge`);
});

test('diffraction: the first screen is charged in full, the ones behind it are not', () => {
  // Broken ground offers more screens than are worth summing; the cap keeps the tallest and
  // must not change the order they are superposed in, which is what Deygout's construction
  // is. Two bounds hold for any set of edges: the first screen sees the true ray line, so the
  // total is never less than that edge alone; and every later screen is measured against a
  // line that is never below the ray, so each term is no more than the same edge alone. Note
  // what does *not* hold, and was assumed here first: the sum can be less than the tallest
  // edge standing on its own (12.98 dB against 15.38 dB measured below), because a preceding
  // screen lowers the effective height of everything behind it. That is the shadow, working.
  const ridges = [
    { atX: -1100, crestM: 9, baseM: 400 },
    { atX: -300, crestM: 16, baseM: 400 },
    { atX: 500, crestM: 7, baseM: 400 },
    { atX: 1200, crestM: 12, baseM: 400 },
  ];
  const entry = ridgeProfile(ridges);
  const multi = lossOf(entry);
  assert.ok(multi > 0, 'the broken ground obstructs');
  let everyEdge = 0;
  for (const ridge of ridges) everyEdge += lossOf(one(ridge));
  const firstEdge = lossOf(one(ridges[0]));
  assert.ok(multi >= firstEdge - 0.1,
    `the first screen sees the true ray line, so it is charged in full: ${multi} vs ${firstEdge} dB`);
  assert.ok(multi <= everyEdge + 0.1,
    `nor dearer than each charged on its own: ${multi} vs ${everyEdge} dB`);
  const capped = multiEdgeDiffractionDb(
    entry.profile.points, entry.profile.totalDistance, FREQ, { edgeLimit: 1 },
  );
  assert.ok(capped <= multi + 0.1 && capped > 0,
    `edgeLimit 1 must cost no more than the full sum: ${capped} vs ${multi} dB`);
  assert.ok(RF.diffractionEdgeLimit >= 2, 'the shipped cap has to allow superposition at all');
});

/**
 * The same ground, swept, with and without a second ridge behind the first: the end-to-end
 * version of the defect, in dBm, at cells the picture paints. The ridges are 6 m tall and 700 m
 * apart, which is the geometry where they stay two separate screens rather than merging into
 * one long hillside, and where the far one is still below the line the near one casts - so the
 * near screen is only grazing the ray and the sum has somewhere to go.
 */
function ridgedSweep(withSecondRidge) {
  const field = new HeightField({ size: 201, worldSize: 6000 }).fillFromFunction((x, z) => {
    const bump = (bx) => 6 * Math.exp(-(((x - bx) ** 2 + z ** 2) / (2 * 260 * 260)));
    return bump(700) + (withSecondRidge ? bump(1400) : 0);
  });
  const site = resolveSite(field, { x: 0, z: 0, heightM: 10 });
  const model = createAntennaModel({
    designId: 'omni-dipole',
    aim: { azimuthDeg: 0, tiltDeg: 0 },
    wavelength: wavelengthM(FREQ),
  });
  return {
    field,
    site,
    coverage: computeCoverage({
      field, site, model, freqHz: FREQ, txPowerDbm: 43, rxSensitivityDbm: -124, maxRangeM: 2600,
    }),
  };
}

test('diffraction: a ridge behind the ridge shows up in the coverage, not only in the model', () => {
  const both = ridgedSweep(true);
  const oneOnly = ridgedSweep(false);
  const behindBoth = sampleCoverage(both.coverage, both.field, 2100, 0);
  const behindOne = sampleCoverage(oneOnly.coverage, oneOnly.field, 2100, 0);
  const clear = sampleCoverage(both.coverage, both.field, 0, 2100);
  assert.ok(behindBoth && behindOne && clear, 'all three cells are inside the study range');
  assert.ok(Math.abs(behindBoth.distanceM - clear.distanceM) < 60,
    `the clear cell is as far away, so free space cannot explain the gap: `
    + `${behindBoth.distanceM} vs ${clear.distanceM} m`);

  assert.equal(clear.obstructionDb, 0, 'nothing in the way, nothing charged');
  assert.ok(behindOne.obstructionDb > 1, `the near ridge alone obstructs: ${behindOne.obstructionDb} dB`);
  assert.ok(behindBoth.obstructionDb > behindOne.obstructionDb + 0.5,
    `the far ridge is not free to charge: ${behindOne.obstructionDb.toFixed(2)} -> `
    + `${behindBoth.obstructionDb.toFixed(2)} dB when it appears`);
  assert.ok(clear.rssiDbm > behindBoth.rssiDbm + 1,
    `at the same range the sheltered cell is quieter: ${clear.rssiDbm.toFixed(1)} vs `
    + `${behindBoth.rssiDbm.toFixed(1)} dBm`);

  // The signature the single-screen model could not produce, from the same ray the sweep
  // walked: two screens, and a charge greater than the worse of them standing on its own.
  const profile = rayProfile(both.field, both.site, { x: 2100, y: both.field.sample(2100, 0), z: 0 },
    { freqHz: FREQ });
  const edges = screenEdges(profile.points, profile.totalDistance,
    RF.diffractionEndpointGuard, RF.diffractionNearEndM);
  assert.ok(edges.length >= 2, `the path has to cross two screens, found ${edges.length}`);
  const worstAlone = Math.max(...edges.map((edge) => diffractionLossDb(
    edge.excess, edge.distance, profile.totalDistance - edge.distance, FREQ,
  )));
  const charged = multiEdgeDiffractionDb(profile.points, profile.totalDistance, FREQ);
  assert.ok(charged > worstAlone + 0.5,
    `${edges.length} screens must cost more than the worst one alone: ${charged.toFixed(2)} vs `
    + `${worstAlone.toFixed(2)} dB`);
  assert.ok(Math.abs(charged - behindBoth.obstructionDb) < 0.5,
    `and the map charged what this ray says it costs: ${behindBoth.obstructionDb.toFixed(2)} vs `
    + `${charged.toFixed(2)} dB`);
});
