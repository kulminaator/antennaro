/**
 * Browser tests: the first Fresnel zone.
 *
 * The unit suite pins the maths (a ridge cuts progressively, the criterion is a
 * threshold, the assumption cannot move the decibels). These pin what the feature
 * has to be true of in the running app: the flag lands where the geography says it
 * should, the volume rides the beam, and the map changes colour when the zone view
 * is switched on - all through `window.__sim` (GUIDELINES.md §9), never the DOM.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { withApp } from '../harness/app.js';

test('browser: the zone report agrees with the coverage grid it is drawn from', async () => {
  await withApp(async (session) => {
    await session.settle();
    const fresnel = await session.sim('fresnel');
    const coverage = await session.sim('coverage');

    assert.ok(fresnel.clearFraction > 0 && fresnel.clearFraction <= 1, 'a criterion exists');
    const state = await session.sim('state');
    assert.equal(fresnel.rxHeightM, state.zoneRxHeightM, 'the report states the assumption actually in use');

    const buckets = fresnel.clearCells + fresnel.partialCells + fresnel.cutCells;
    assert.equal(buckets, fresnel.evaluatedCells, 'cut, partial and clear partition the study area');
    assert.equal(fresnel.clearCells, coverage.fresnelClearCells, 'the zone view and the grid agree');
    assert.ok(fresnel.obstructedLinkedCells <= fresnel.linkedCells, 'the cut-but-linked set is a subset of the links');
    assert.ok(fresnel.obstructedLinkedCells > 0, 'a real map has links that make the budget with the zone cut');
    assert.ok(fresnel.worstClearance < 0, 'and at least one path whose ground stands above the ray');
    assert.ok(fresnel.worstClearanceDistanceM > 0, 'with a distance to go and look');
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: the zone is cut where the ground says it should be cut', async () => {
  await withApp(async (session) => {
    await session.settle();
    const ray = async (x, z) => {
      const cell = await session.sim('rssiAt', x, z);
      assert.ok(cell, `no cell at ${x}, ${z} to measure`);
      return cell;
    };

    // East is the flat field, north is the mountain, west is the bumps.
    const eastNear = await ray(400, 0);
    const northFar = await ray(0, -700);
    const westNear = await ray(-400, 0);
    assert.ok(eastNear.fresnelClear, 'over the flat field the zone stays clear');
    assert.ok(!northFar.fresnelClear, 'into the mountain it does not');
    assert.ok(!westNear.fresnelClear, 'and the western bumps cut it well before they block the ray');
    assert.ok(
      eastNear.fresnelClearanceRatio - northFar.fresnelClearanceRatio > 5,
      `east kept ${eastNear.fresnelClearanceRatio.toFixed(2)} r1, north ${northFar.fresnelClearanceRatio.toFixed(2)}`,
    );

    // The two measures are not the same measure: the diffraction loss is charged for
    // the ray that ends on the cell's own ground over the whole path, the zone for the
    // ray that ends at a terminal above it, judged outside the end guards. So a cell
    // can be badly diffracted by ground right next to it and still keep its zone.
    const northNear = await ray(0, -400);
    assert.ok(northNear.obstructionDb > 6, 'the northern ridge costs decibels');
    assert.ok(Number.isFinite(northNear.fresnelClearanceRatio));
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: a higher band has a smaller zone, so more of the map is clear', async () => {
  await withApp(async (session) => {
    await session.settle();
    const clearPct = {};
    for (const frequencyKey of ['433', '868', '2400', '5800']) {
      await session.patch({ frequencyKey });
      await session.settle();
      const fresnel = await session.sim('fresnel');
      assert.equal(fresnel.evaluatedCells, (await session.sim('coverage')).evaluatedCells,
        'the study area did not move, only the zone inside it');
      clearPct[frequencyKey] = fresnel.clearPct;
    }
    const keys = ['433', '868', '2400', '5800'];
    for (let i = 1; i < keys.length; i += 1) {
      assert.ok(
        clearPct[keys[i]] > clearPct[keys[i - 1]] + 1,
        `${keys[i]} MHz (${clearPct[keys[i]].toFixed(1)} %) should be more clear than ${keys[i - 1]} MHz (${clearPct[keys[i - 1]].toFixed(1)} %)`,
      );
    }
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: the receiver assumption moves the verdict and never the decibels', async () => {
  await withApp(async (session) => {
    await session.settle();
    const before = await session.sim('fresnel');
    const rssiBefore = await session.sim('rssiAt', 400, 0);

    await session.patch({ zoneRxHeightM: 0 });
    await session.settle();
    const ground = await session.sim('fresnel');

    await session.patch({ zoneRxHeightM: 10 });
    await session.settle();
    const rooftop = await session.sim('fresnel');

    assert.ok(ground.clearPct < before.clearPct, 'a terminal lying on the ground cuts its own zone');
    assert.ok(rooftop.clearPct > before.clearPct, 'lifting it opens the zone back up');
    assert.equal(ground.rxHeightM, 0, 'the report follows the slider');
    assert.equal(rooftop.rxHeightM, 10);

    const rssiAfter = await session.sim('rssiAt', 400, 0);
    assert.equal(rssiAfter.rssiDbm, rssiBefore.rssiDbm, 'the assumption must not buy or cost signal');
    assert.equal(rssiAfter.obstructionDb, rssiBefore.obstructionDb, 'nor double-count the same ridge as loss');
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: the toggle shows and hides the zone volume, riding the beam', async () => {
  await withApp(async (session) => {
    await session.settle();
    const off = await session.sim('fresnel');
    assert.equal(off.volume.visible, false, 'the volume starts hidden');

    await session.patch({ display: { showFresnel: true } });
    await session.settle();
    const on = await session.sim('fresnel');
    assert.equal(on.volume.visible, true, 'the toggle put the volume in the scene');
    assert.ok(on.volume.vertices > 100, `the tube has geometry (${on.volume.vertices} vertices)`);

    // Aim south and down: the far end of the drawn zone must be south (+z) and below
    // the phase centre, because the volume is drawn along the boresight.
    const site = await session.sim('site');
    await session.patch({ aim: { azimuthDeg: 180, tiltDeg: -6 } });
    await session.settle();
    const south = await session.sim('fresnel');
    assert.equal(south.volume.visible, true, 'rebuilding for the new aim kept it visible');
    assert.ok(south.link.to.z - site.z > 50, 'the zone extends south of the mast');
    assert.ok(south.link.to.y < south.link.from.y, 'and follows a downtilted beam down');
    assert.ok(Math.hypot(south.link.to.x - south.link.from.x, south.link.to.z - south.link.from.z) > 0.9 * south.link.distanceM,
      'the link is a straight line along the azimuth');

    const vertices = south.volume.vertices;
    await session.patch({ display: { showFresnel: false } });
    await session.settle();
    const offAgain = await session.sim('fresnel');
    assert.equal(offAgain.volume.visible, false, 'the toggle took it back out');
    assert.equal(offAgain.volume.vertices, vertices, 'hiding does not rebuild the geometry');
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: the zone view repaints the coverage drape and gives it back', async () => {
  await withApp(async (session) => {
    await session.settle();
    const rssiView = await session.sim('pixelStats');

    await session.patch({ display: { showFresnel: true } });
    await session.settle();
    const zoneView = await session.sim('pixelStats');
    assert.notEqual(zoneView.distinctColours, rssiView.distinctColours, 'the drape did not change colour');
    assert.ok(zoneView.distinctColours > rssiView.distinctColours,
      'the zone ramp is a continuous scale, so it shows more distinct colours than four bands');

    await session.patch({ display: { showFresnel: false } });
    await session.settle();
    const back = await session.sim('pixelStats');
    assert.deepEqual(
      { distinct: back.distinctColours, luminance: back.meanLuminance },
      { distinct: rssiView.distinctColours, luminance: rssiView.meanLuminance },
      'switching the view off restored the picture exactly - the mode is a re-paint, not a rebuild',
    );
    assert.deepEqual(session.errors(), []);
  });
});
