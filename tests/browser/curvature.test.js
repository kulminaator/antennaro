/**
 * Browser tests: what the app says about the round earth, and whether the map obeys it.
 *
 * Two claims are under test here, and they pull in opposite directions, which is why both
 * are pinned rather than one of them summarised away:
 *
 * - The earth never **ends** coverage on a 5.2 km map. The bulge under the longest link is
 *   centimetres to a fraction of a metre, the horizon the `Curvature` row quotes is
 *   computed for the receiver height and is two to seven times across the world, and the
 *   sweep still finishes on the edge of the picture with everything it asked about linked.
 * - The earth is still **in** the model, and measurably so. The ray the decibels are
 *   charged against is lowered by the effective-earth bulge at the very point where the
 *   path is worst - which a browser test can prove on real terrain, by asking the app for
 *   the same ray twice (`__sim.rayTo` with and without curvature) and looking at the
 *   difference. At the panel's lowest mast that much earth is enough to obstruct the far
 *   parts of the map; at 40 m it is not.
 *
 * The premise this file was drafted with - "make a low mast die at the radio horizon and
 * watch the coverage stop there" - remains impossible: dying at the horizon needs a
 * *budget* that reaches the horizon, and the horizon for a mast the panel can build is
 * never inside this map. What the lowest mast does get is a few dB of earth in its far
 * corners, which the third test below measures instead of staging.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { withApp } from '../harness/app.js';
import { ANTENNA, RF } from '../../src/config.js';
import { earthBulgeM, radioHorizonM } from '../../src/propagation/rf.js';

/** The distance at which a mast of `heightM` loses a terminal standing on the ground. */
const groundTerminalHorizonM = (heightM) => Math.sqrt(2 * RF.kFactor * RF.earthRadiusM * heightM);

test('browser: the horizon the app quotes is nowhere near where the coverage stops', async () => {
  await withApp(async (session) => {
    await session.settle();
    const stats = await session.sim('coverage');
    const state = await session.sim('state');

    // The three curvature facts the HUD row is built from, checked against the maths.
    assert.equal(stats.kFactor, RF.kFactor, 'the sweep uses the configured refraction factor');
    const half = stats.maxLinkedRangeM / 2;
    assert.ok(Math.abs(stats.earthBulgeUnderMaxLinkM - earthBulgeM(half, half, RF.kFactor)) < 1e-12,
      `the quoted bulge is the bulge of the reported last link (${stats.earthBulgeUnderMaxLinkM})`);
    assert.equal(stats.radioHorizonM, radioHorizonM(state.heightM, RF.fresnelRxHeightM, RF.kFactor),
      'the quoted horizon is for this mast and the stated receiver height');

    // ... and what they mean: the link ends long before the curve has anything to say.
    assert.equal(stats.limitingFactor, 'budget', 'the default picture ends because the link does');
    assert.ok(stats.maxLinkedRangeM > 0, 'and a link exists to talk about');
    assert.ok(stats.radioHorizonM > stats.worldSizeM,
      `the horizon ${(stats.radioHorizonM / 1000).toFixed(1)} km is beyond the ${(stats.worldSizeM / 1000).toFixed(1)} km map`);
    assert.ok(stats.maxLinkedRangeM < 0.5 * stats.radioHorizonM,
      'the last link is a fraction of the way to the horizon');
    assert.ok(stats.earthBulgeUnderMaxLinkM < 0.2,
      `and it curved over ${(stats.earthBulgeUnderMaxLinkM * 100).toFixed(1)} cm of world`);
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: even the loudest link the panel allows ends before the curve matters', async () => {
  await withApp(async (session) => {
    await session.settle();
    // 43 dBm into a receiver that hears -124 dBm: a budget of thousands of kilometres, so
    // the only things left to end the picture are the map and our study range.
    await session.patch({ txPowerDbm: 43, rxSensitivityDbm: -124, designId: 'omni-collinear' });
    await session.settle();
    const stats = await session.sim('coverage');
    const state = await session.sim('state');

    assert.equal(stats.limitingFactor, 'map-edge', 'so the edge of the world is what stops it');
    assert.ok(stats.radioHorizonM > stats.worldSizeM,
      'and the horizon is still off the map, even for this link');
    assert.ok(stats.maxLinkedRangeM < stats.radioHorizonM, 'no linked point is beyond the horizon');
    // The most curvature this map can put under any link, reached by shouting at it.
    assert.ok(stats.earthBulgeUnderMaxLinkM > 0.1 && stats.earthBulgeUnderMaxLinkM < 0.8,
      `the worst bulge on this map is ${stats.earthBulgeUnderMaxLinkM.toFixed(2)} m - fractions of a wavelength`);
    assert.ok(stats.budgetRangeM > 10 * stats.radioHorizonM,
      `the budget (${(stats.budgetRangeM / 1000).toFixed(0)} km) dwarfs even the horizon `
      + `(${(stats.radioHorizonM / 1000).toFixed(1)} km): nothing here is horizon-limited`);

    // The row tracks the mast, though: climb, and the smooth earth lets you see further.
    const lower = stats.radioHorizonM;
    await session.patch({ heightM: ANTENNA.heightLimitsM.max });
    await session.settle();
    const higher = await session.sim('coverage');
    assert.ok(higher.radioHorizonM > lower * 1.2,
      `a ${(ANTENNA.heightLimitsM.max).toFixed(0)} m mast reaches ${(higher.radioHorizonM / 1000).toFixed(1)} km of horizon `
      + `against ${(lower / 1000).toFixed(1)} km at ${(state.heightM).toFixed(0)} m`);
    assert.ok(higher.radioHorizonM > higher.worldSizeM, 'and it is still off the map');
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: the app lowers its ray by exactly the earth, wherever the path is worst', async () => {
  await withApp(async (session) => {
    await session.settle();
    // The lowest mast the panel allows, in a legal corner, shouting at a budget that
    // cannot run out: the longest paths this picture can contain, over real ground.
    await session.patch({
      designId: 'omni-collinear', txPowerDbm: 43, rxSensitivityDbm: -124,
      maxRangeM: RF.maxRangeLimitsM.max, heightM: ANTENNA.heightLimitsM.min,
      site: { x: ANTENNA.siteLimitsM.max, z: ANTENNA.siteLimitsM.max },
    });
    await session.settle();
    const stats = await session.sim('coverage');
    assert.equal(stats.limitingFactor, 'map-edge',
      'the earth costs decibels here, it does not end the picture');

    for (const [label, x, z] of [['opposite corner', -2500, -2500], ['map centre', 0, 0]]) {
      const curved = await session.sim('rayTo', x, z);
      const flat = await session.sim('rayTo', x, z, { kFactor: 0 });
      const bulgeAtWorst = earthBulgeM(curved.maxExcessDistanceM, curved.distanceM - curved.maxExcessDistanceM);
      const delta = curved.worstExcess - flat.worstExcess;
      assert.ok(delta > 0, `${label}: the round earth must make the path worse, not better`);
      assert.ok(curved.minClearance < flat.minClearance, `${label}: and eat into the first zone`);
      assert.ok(curved.obstructionDb >= flat.obstructionDb, `${label}: charging at least as much`);
      // The bulge peaks mid-path, so no path's difference can exceed its own mid-path bulge.
      const peak = earthBulgeM(curved.distanceM / 2, curved.distanceM / 2);
      assert.ok(delta <= peak + 1e-9,
        `${label}: ${delta.toFixed(3)} m of difference is more earth than the path holds`);
      if (Math.abs(curved.maxExcessDistanceM - flat.maxExcessDistanceM) < 1) {
        assert.ok(Math.abs(delta - bulgeAtWorst) < 1e-6,
          `${label}: the difference should be exactly the bulge at the worst sample, `
          + `got ${delta.toFixed(4)} against ${bulgeAtWorst.toFixed(4)}`);
      }
    }

    // The two horizons, told apart: what the row quotes is off the map, and what a
    // terminal lying on the ground implies is inside it. Both are true, and conflating
    // them is how this app once claimed the curvature never obstructs anything here.
    const farthest = Math.hypot(
      ANTENNA.siteLimitsM.max + stats.worldSizeM / 2, ANTENNA.siteLimitsM.max + stats.worldSizeM / 2);
    assert.ok(stats.radioHorizonM > stats.worldSizeM,
      `the quoted horizon ${(stats.radioHorizonM / 1000).toFixed(1)} km is off the map`);
    assert.ok(groundTerminalHorizonM(ANTENNA.heightLimitsM.min) < farthest,
      `while a 0.5 m mast loses the ground itself at ${(groundTerminalHorizonM(ANTENNA.heightLimitsM.min) / 1000).toFixed(2)} km, `
      + `well inside the ${(farthest / 1000).toFixed(2)} km of map a corner mast can look across`);
    assert.ok(groundTerminalHorizonM(ANTENNA.heightLimitsM.max) > farthest,
      'and a 40 m mast has the whole map inside its own horizon');
    assert.deepEqual(session.errors(), []);
  });
});
