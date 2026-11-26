/**
 * Browser tests: what the edge of the coverage picture actually *is*.
 *
 * The complaint this task exists for: several antenna designs appeared to reach the
 * same distance, so the drape looked like a circle the app had chosen rather than a
 * link the antenna had earned. These tests drive only `window.__sim` (GUIDELINES.md §9)
 * and pin the four things that have to stay true: the far edge of the drape is the link,
 * gain really does move the reach when the ground allows it, our own study range binds
 * only when someone asks for it, and ground we never asked about is never painted as a
 * link or reported as zone-clear.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { withApp } from '../harness/app.js';
import { ANTENNA, RF, WORLD } from '../../src/config.js';
import { krausDirectivityDbi } from '../../src/antenna/pattern.js';

const DESIGNS = Object.freeze(['omni-dipole', 'omni-collinear', 'yagi']);
/** The western edge of the flat field: a clear run east, the mast away from the mountain. */
const WESTERN_FIELD_X = -1000;

const sector = (stats, label) => stats.sectors.find((cell) => cell.label === label);

test('browser: the far edge of the drape is the link, not the map or our cap', async () => {
  await withApp(async (session) => {
    await session.settle();
    await session.patch({ designId: 'omni-collinear' });
    await session.settle();

    const stats = await session.sim('coverage');
    assert.equal(stats.limitingFactor, 'budget', `something other than the link ended the picture: ${stats.limitingFactor}`);
    assert.equal(stats.clippedByRangeCells, 0, 'our study range cut off linked ground');
    assert.equal(stats.clippedByMapCells, 0, 'the map border cut off linked ground');
    assert.equal(stats.sectors.filter((cell) => cell.clippedBy).length, 0, 'a direction ran out of map or work area');

    // The reach should sit on the free-space budget - that is the link running out -
    // and be comfortably inside both of the limits the app imposes on itself.
    const ratio = stats.maxLinkedRangeM / stats.budgetRangeM;
    assert.ok(ratio > 0.85 && ratio <= 1.001,
      `last link ${stats.maxLinkedRangeM.toFixed(0)} m against a budget of ${stats.budgetRangeM.toFixed(0)} m`);
    assert.ok(stats.maxLinkedRangeM < 0.5 * stats.studyRangeM,
      `last link ${stats.maxLinkedRangeM.toFixed(0)} m is half of our ${stats.studyRangeM} m study range`);
    assert.ok(stats.maxLinkedRangeM < 0.7 * stats.nearestMapEdgeM,
      `last link ${stats.maxLinkedRangeM.toFixed(0)} m against the nearest map edge at ${stats.nearestMapEdgeM.toFixed(0)} m`);
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: with the ground out of the way, gain becomes range as the budget says', async () => {
  await withApp(async (session) => {
    await session.settle();
    // The tallest mast the model allows, over the flat field, aimed east: here nothing
    // but free space stands between the terminal and the horizon, so the reach has to
    // follow the budget the radio maths reports - otherwise "gain" is decoration.
    await session.patch({
      site: { x: WESTERN_FIELD_X, z: 0 },
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

test('browser: a low mast puts the ground between gain and range, and says which won', async () => {
  await withApp(async (session) => {
    await session.settle();
    // Same place, same radio, mast down at the default height: the Yagi's budget is the
    // largest of the three and its reach is not. That is not a broken model - a terminal
    // on the ground sees a radio horizon the extra decibels cannot buy back - but the
    // statistics have to show the ground as the winner, not hide it.
    await session.patch({
      site: { x: WESTERN_FIELD_X, z: 0 },
      heightM: ANTENNA.defaultHeightM,
      designId: 'omni-collinear',
      aim: { azimuthDeg: 90, tiltDeg: 0 },
    });
    await session.settle();
    const collinear = await session.sim('coverage');
    await session.patch({ designId: 'yagi' });
    await session.settle();
    const yagi = await session.sim('coverage');

    assert.ok(yagi.budgetRangeM > 1.2 * collinear.budgetRangeM,
      `the beam starts with more budget: ${yagi.budgetRangeM.toFixed(0)} m against ${collinear.budgetRangeM.toFixed(0)} m`);
    assert.ok(yagi.maxLinkedRangeM < collinear.maxLinkedRangeM,
      `and still dies nearer: ${yagi.maxLinkedRangeM.toFixed(0)} m against ${collinear.maxLinkedRangeM.toFixed(0)} m`);
    // Both are still limited by the link, not by anything the app chose.
    assert.equal(yagi.limitingFactor, 'budget');
    assert.equal(collinear.limitingFactor, 'budget');
    // The dB tells the story the picture cannot: the beam falls further short of its own
    // budget than the omni does, which is what "the ground decided, not the radio" looks
    // like in numbers.
    const yagiFraction = yagi.maxLinkedRangeM / yagi.budgetRangeM;
    const omniFraction = collinear.maxLinkedRangeM / collinear.budgetRangeM;
    assert.ok(yagiFraction < omniFraction - 0.2,
      `the beam used ${(yagiFraction * 100).toFixed(0)} % of its budget, the omni ${(omniFraction * 100).toFixed(0)} %`);
    // A beam concentrates its links, so a smaller served area is not a smaller link.
    assert.ok(yagi.linkedCells < collinear.linkedCells, 'the beam serves a narrower area');
    assert.ok(sector(yagi, 'E').maxRangeM > 0, 'and it still serves the direction it points at');
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: our study range binds only when somebody asks for it', async () => {
  await withApp(async (session) => {
    await session.settle();
    await session.patch({ designId: 'omni-collinear' });
    await session.settle();

    const open = await session.sim('coverage');
    const openScene = await session.sim('scene');
    assert.notEqual(open.limitingFactor, 'study-range', 'the default work area covers the map, so it cannot be the limit');
    assert.equal(open.clippedByRangeCells, 0);
    assert.equal(openScene.rangeRing.visible, false, 'a ring that cannot bind should not be drawn to be ignored');

    await session.patch({ maxRangeM: 1400 });
    await session.settle();
    const cut = await session.sim('coverage');
    const cutScene = await session.sim('scene');
    assert.equal(cut.limitingFactor, 'study-range', 'a work area smaller than the link must name itself as the limit');
    assert.ok(cut.clippedByRangeCells > 0, 'linked ground sits on the border of the work area');
    assert.equal(cutScene.rangeRing.visible, true, 'the border of the work area has to be visible');
    assert.equal(cutScene.rangeRing.canBind, true);
    const marked = cut.sectors.filter((cell) => cell.clippedBy === 'study-range');
    assert.ok(marked.length > 0, 'the direction table should mark the ranges that were still alive there');
    for (const cell of marked) {
      assert.ok(cell.maxRangeM >= cell.limitM - 2 * cut.coverageCellSizeM,
        `${cell.label} is marked although its range ${cell.maxRangeM} m stops short of ${cell.limitM} m`);
    }
    assert.ok(cut.maxLinkedRangeM < open.maxLinkedRangeM, 'the cut picture is shorter than the honest one');
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: ground we never asked about is not painted as a link', async () => {
  await withApp(async (session) => {
    await session.settle();
    await session.patch({ designId: 'omni-collinear' });
    await session.settle();

    const stats = await session.sim('coverage');
    const state = await session.sim('state');
    const sensitivity = state.rxSensitivityDbm;
    assert.ok(stats.budgetExcludedCells > 0, 'the sweep should be dismissing some of the map as unreachable');

    let walked = 0;
    let dismissed = 0;
    let lastExcluded = null;
    for (let distance = 300; distance <= 3000; distance += 150) {
      const cell = await session.sim('rssiAt', distance, 0);
      if (!cell) continue;
      if (cell.budgetExcluded) {
        dismissed += 1;
        assert.ok(cell.rssiDbm < sensitivity,
          `at ${distance} m the free-space upper bound ${cell.rssiDbm.toFixed(1)} dBm still clears the receiver`);
      } else {
        walked += 1;
      }
      lastExcluded = cell.budgetExcluded;
    }
    assert.ok(walked > 3 && dismissed > 3, `the walk should cross the budget edge, not sit on one side: ${walked} walked, ${dismissed} dismissed`);
    assert.equal(lastExcluded, true, 'once free space stops being enough, the ground stops being asked');

    // Past the budget radius the free-space upper bound cannot reach the receiver, so no
    // sample out there may claim a link - and none may be painted as a Fresnel verdict.
    for (let distance = Math.ceil(stats.budgetRangeM) + 120; distance <= 3000; distance += 240) {
      const cell = await session.sim('rssiAt', distance, 0);
      if (!cell) continue;
      assert.ok(cell.rssiDbm < sensitivity, `a link at ${distance} m, past a ${stats.budgetRangeM.toFixed(0)} m budget`);
      if (cell.budgetExcluded) assert.equal(cell.fresnelClear, false, 'an unasked point must not carry a zone verdict');
    }
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: the sweep looks at the whole map, not a plate on top of it', async () => {
  await withApp(async (session) => {
    await session.settle();
    const stats = await session.sim('coverage');
    // At the map centre the default study range reaches past the corners, so every
    // coverage point must have been evaluated: a circular cap inside a square map was
    // the old behaviour and it hid the answer at the edges.
    assert.equal(stats.studyRangeM, RF.defaultMaxRangeM);
    assert.ok(stats.evaluatedCells >= stats.cells - 4,
      `${stats.evaluatedCells} of ${stats.cells} points at stride ${stats.coverageStride}: the sweep is not covering the grid`);
    assert.ok(stats.cells < 349 * 349, `the coverage grid should be a decimation, saw ${stats.cells} points`);
    assert.equal(stats.coverageStride, RF.coverageStride);
    assert.ok(Math.abs(stats.coverageCellSizeM - RF.coverageStride * (WORLD.worldSize / (WORLD.gridSize - 1))) < 0.2,
      `coverage cells of ${stats.coverageCellSizeM.toFixed(1)} m`);

    // A mast in a corner, at the default study range: the far side of the map is 3.5 km
    // of ground away and still has to be looked at.
    await session.patch({ site: { x: ANTENNA.siteLimitsM.min, z: ANTENNA.siteLimitsM.min } });
    await session.settle();
    const corner = await session.sim('coverage');
    const centre = await session.sim('rssiAt', 0, 0);
    assert.ok(centre, 'a corner mast at the default study range still gets an answer at the map centre');
    const distance = Math.hypot(ANTENNA.siteLimitsM.min, ANTENNA.siteLimitsM.min);
    assert.ok(distance > 3000, `the map centre is ${distance.toFixed(0)} m from that corner`);
    assert.equal(corner.limitingFactor, 'map-edge',
      'in a corner the border is what stops the search, and the sweep has to admit it');
    assert.ok(corner.sectors.some((cell) => cell.clippedBy === 'map-edge'), 'and mark the directions it cut');
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
    await session.patch({
      site: { x: WESTERN_FIELD_X, z: 0 },
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
      assert.ok(ratio > 0.85 && ratio <= 1.001,
        `${designId} reached ${stats.maxLinkedRangeM.toFixed(0)} m of a ${stats.budgetRangeM.toFixed(0)} m budget - ground, not gain, is deciding here`);
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
