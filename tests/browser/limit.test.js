/**
 * Browser tests: what actually binds the coverage the map shows.
 *
 * Layer: test (browser).
 *
 * Four different things can be the outermost edge of the drape - the link budget, the map
 * edge, the study range the operator asked for, and the work area the sweep is allowed to
 * walk - and the app has to say which one it is drawing, and not paint ground it never
 * measured. Each test here makes one of those the binding limit and checks the report
 * names it; they came out of reach.test.js because "how far does it reach" and "what
 * stopped it" are different questions, and a suite that conflates them cannot tell a
 * correct simulation from a truncated one.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { withApp } from '../harness/app.js';
import { ANTENNA, RF, WORLD } from '../../src/config.js';

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

test('browser: a work area wider than the map is a real limit for a mast in a corner', async () => {
  await withApp(async (session) => {
    // The cap on the study range is deliberately wider than the map, for the one place it
    // can matter: a corner mast has more than 6 km of ground on the other side of the
    // picture, while the same work area at the map centre is decoration.
    await session.patch({
      designId: 'omni-collinear', txPowerDbm: 43, rxSensitivityDbm: -124, clutterLossDb: 0,
      heightM: 30, site: { x: ANTENNA.siteLimitsM.max, z: ANTENNA.siteLimitsM.max },
      maxRangeM: RF.maxRangeLimitsM.max,
    });
    await session.settle();
    const corner = await session.sim('coverage');
    const cornerScene = await session.sim('scene');
    assert.ok(corner.clippedByRangeCells > 0, 'the work area cut off linked ground');
    const byRange = corner.sectors.filter((cell) => cell.clippedBy === 'study-range');
    const byEdge = corner.sectors.filter((cell) => cell.clippedBy === 'map-edge');
    assert.ok(byRange.length > 0, 'across the map, in the directions with room for it');
    assert.ok(byEdge.length > 0, 'and in the other directions the wall, 100 m away, first');
    // Both boundaries coexist, and the single summary line names the nearer one: a mast
    // 100 m from two walls has the wall in front of it long before 6 km.
    assert.equal(corner.limitingFactor, 'map-edge', 'the nearer boundary is the one named');
    assert.equal(cornerScene.rangeRing.canBind, true, 'the wider work area is a real ring here');
    assert.equal(cornerScene.rangeRing.visible, true, 'drawn because there is ground beyond it');

    await session.patch({ site: { x: 0, z: 0 } });
    await session.settle();
    const centre = await session.sim('coverage');
    const centreScene = await session.sim('scene');
    assert.equal(centre.clippedByRangeCells, 0, 'at the centre nothing lies past it');
    assert.equal(centreScene.rangeRing.canBind, false, 'and the ring knows it, because it follows the mast');
    assert.equal(centreScene.rangeRing.visible, false, 'so it stays out of the picture');
    assert.deepEqual(session.errors(), []);
  });
});
