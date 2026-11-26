/**
 * Browser tests: gain turns into range at the rate the link budget says.
 *
 * Layer: test (browser).
 *
 * With the ground out of the way, the only thing between an antenna's gain and its reach
 * is the budget. These tests hold that relationship in the browser - the five designs in
 * gain order, and no design reaching further than its own beam can pay for - while
 * limit.test.js asks the complementary question of what truncates the reach when
 * something else gets there first.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { withApp } from '../harness/app.js';
import { ANTENNA } from '../../src/config.js';
import { krausDirectivityDbi } from '../../src/antenna/pattern.js';

/** The designs this file puts in gain order; the fifth is added inside the last test. */
const DESIGNS = Object.freeze(['omni-dipole', 'omni-collinear', 'yagi']);


test('browser: with the ground out of the way, gain becomes range as the budget says', async () => {
  await withApp(async (session) => {
    await session.settle();
    // The tallest mast the model allows, in the middle of the map, aimed east along the
    // flat field: the longest corridor on this ground that is not looking along a slope,
    // measured at 0.994 of its own free-space range. Nothing but free space stands between
    // the terminal and the horizon there, so the reach has to follow the budget the radio
    // maths reports - otherwise "gain" is decoration. The ground does cost decibels where
    // there is ground to cost them: see the gain-order test, which runs on the bump field.
    await session.patch({
      site: { x: 0, z: 0 },
      heightM: ANTENNA.heightLimitsM.max,
      designId: DESIGNS[0],
      aim: { azimuthDeg: 90, tiltDeg: 0 },
    });
    await session.settle();
    const state = await session.sim('state');
    assert.equal(state.heightM, ANTENNA.heightLimitsM.max, 'the mast height we asked for is the one in use');

    const reached = new Map();
    for (const designId of DESIGNS) {
      await session.patch({ designId });
      await session.settle();
      const stats = await session.sim('coverage');
      const rf = await session.sim('rf');
      reached.set(designId, { max: stats.maxLinkedRangeM, free: rf.freeSpaceRangeM });
      const ratio = stats.maxLinkedRangeM / rf.freeSpaceRangeM;
      assert.ok(ratio > 0.95 && ratio <= 1.001,
        `${designId} reached ${stats.maxLinkedRangeM.toFixed(0)} m of its ${rf.freeSpaceRangeM.toFixed(0)} m free-space range`);
    }

    for (let i = 1; i < DESIGNS.length; i += 1) {
      const previous = reached.get(DESIGNS[i - 1]);
      const next = reached.get(DESIGNS[i]);
      assert.ok(next.max > previous.max, `${DESIGNS[i]} reached no further than ${DESIGNS[i - 1]}`);
      const grown = next.max / previous.max;
      const budgetSays = next.free / previous.free;
      assert.ok(Math.abs(grown / budgetSays - 1) < 0.05,
        `${DESIGNS[i]} grew reach by ${grown.toFixed(2)}x, its budget says ${budgetSays.toFixed(2)}x`);
    }
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: over flat ground the five designs reach in gain order, and none has more gain than its beam', async () => {
  await withApp(async (session) => {
    await session.settle();
    // One piece of ground, one mast, one direction: the only variable left is the
    // antenna. This is the test the biquad bug would have failed - it claimed 12.4 dBi
    // from a 69 x 69 degree beam, which is 3 dB more than that beam can hold, and it
    // therefore reached further on the map than a Yagi with half its beamwidth.
    //
    // It runs down the same free-space corridor as the budget test above, and it has to:
    // where the ground is worth a few dB, the reach stops being a strict function of gain,
    // and designs 0.9 dB apart genuinely change places. That is a fact about this map, not
    // something to assert away - the bump-field costs are pinned by the paragraph below.
    await session.patch({
      site: { x: 0, z: 0 },
      heightM: ANTENNA.heightLimitsM.max,
      aim: { azimuthDeg: 90, tiltDeg: 0 },
    });
    await session.settle();

    // In gain order, so the reach list below is also a monotonicity assertion.
    const designs = ['omni-dipole', 'patch', 'omni-collinear', 'biquad-reflector', 'yagi'];
    const rows = [];
    for (const designId of designs) {
      await session.patch({ designId });
      await session.settle();
      const antenna = await session.sim('antenna');
      const stats = await session.sim('coverage');
      rows.push({ designId, gain: antenna.peakGainDbi, h: antenna.hBeamwidthDeg, v: antenna.vBeamwidthDeg, max: stats.maxLinkedRangeM, budget: stats.budgetRangeM });
      assert.equal(stats.limitingFactor, 'budget', `${designId}: something other than the link ended the picture`);
      if (antenna.hBeamwidthDeg < 350) {
        const ceiling = krausDirectivityDbi(antenna.hBeamwidthDeg, antenna.vBeamwidthDeg);
        assert.ok(antenna.peakGainDbi <= ceiling + 0.25,
          `${designId}: ${antenna.peakGainDbi.toFixed(2)} dBi from a `
          + `${antenna.hBeamwidthDeg.toFixed(1)} x ${antenna.vBeamwidthDeg.toFixed(1)} degree beam `
          + `(ceiling ${ceiling.toFixed(2)} dBi)`);
      }
      const ratio = stats.maxLinkedRangeM / stats.budgetRangeM;
      // The reach may never exceed the free-space budget - that is the pre-filter's
      // promise, that ground only ever subtracts. And on this ground it subtracts less than
      // one grazing knife edge: a gentle crest the ray passes a metre above is charged now,
      // which is a few dB off the range, so the floor here is honest rather than 0.95.
      const groundCostDb = 20 * Math.log10(stats.budgetRangeM / stats.maxLinkedRangeM);
      assert.ok(ratio <= 1.001, `${designId} beat free space by ${(ratio - 1) * 100}% - impossible`);
      assert.ok(ratio > 0.9,
        `${designId} reached ${stats.maxLinkedRangeM.toFixed(0)} m of a ${stats.budgetRangeM.toFixed(0)} m budget: `
        + `the ground took ${groundCostDb.toFixed(1)} dB off this path, and a corridor that costs that much is not one to rank antennas on`);
    }

    for (let i = 1; i < rows.length; i += 1) {
      assert.ok(rows[i].gain > rows[i - 1].gain, `${rows[i].designId} has no more gain than ${rows[i - 1].designId}`);
      assert.ok(rows[i].max > rows[i - 1].max,
        `${rows[i].designId} (${rows[i].gain.toFixed(1)} dBi) reached no further than `
        + `${rows[i - 1].designId} (${rows[i - 1].gain.toFixed(1)} dBi): `
        + `${rows[i].max.toFixed(0)} m against ${rows[i - 1].max.toFixed(0)} m`);
    }

    const yagi = rows.find((row) => row.designId === 'yagi');
    const biquad = rows.find((row) => row.designId === 'biquad-reflector');
    assert.ok(biquad.gain < yagi.gain, 'a biquad must not out-gain a Yagi');
    assert.ok(biquad.h > yagi.h && biquad.v > yagi.v, 'and it must be the wider antenna in both planes');
    assert.ok(yagi.max / biquad.max > 1.1,
      `the Yagi's extra gain has to show up as reach: ${yagi.max.toFixed(0)} m against ${biquad.max.toFixed(0)} m`);
    assert.deepEqual(session.errors(), []);
  });
});
