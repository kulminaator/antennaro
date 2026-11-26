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
import { RF, WORLD } from '../../src/config.js';

test('browser: the zone report agrees with the coverage grid it is drawn from', async () => {
  await withApp(async (session) => {
    await session.settle();
    const fresnel = await session.sim('fresnel');
    const coverage = await session.sim('coverage');

    assert.ok(fresnel.clearFraction > 0 && fresnel.clearFraction <= 1, 'a criterion exists');
    const state = await session.sim('state');
    assert.equal(fresnel.rxHeightM, state.zoneRxHeightM, 'the report states the assumption actually in use');

    const buckets = fresnel.clearCells + fresnel.partialCells + fresnel.cutCells;
    // The buckets partition the ground the sweep *asked*, not everything it looked at:
    // a point the budget dismissed before the ray was ever walked carries no zone verdict.
    assert.equal(buckets, coverage.walkedCells, 'cut, partial and clear partition the walked ground');
    assert.equal(fresnel.walkedCells, coverage.walkedCells, 'the report names the same walked set as the grid');
    assert.equal(fresnel.denominatorCells, coverage.linkedCells,
      'the clear percentage is stated over the links, not over ground that cannot receive');
    assert.ok(coverage.budgetExcludedCells > 0, 'some of the map should be dismissed as unreachable');
    assert.ok(buckets < coverage.evaluatedCells, 'unasked ground must not carry a zone verdict');
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
    // A receiver so sensitive that the link budget is not what these probes are about:
    // here we read the ground, and no probe may be a point the sweep refused to walk.
    await session.patch({ rxSensitivityDbm: -124, heightM: 10 });
    await session.settle();

    const half = WORLD.worldSize / 2;
    const ray = async (eastFraction, southFraction) => {
      const x = eastFraction * half;
      const z = southFraction * half;
      const cell = await session.sim('rssiAt', x, z);
      assert.ok(cell, `no cell at ${x.toFixed(0)}, ${z.toFixed(0)} to measure`);
      assert.equal(cell.budgetExcluded, false, 'this probe has to be ground the sweep actually walked');
      return cell;
    };

    // Fractions of the map, because the landforms scale with it. East is the flat field,
    // north the flank above the ridge, west the wall of the bump field.
    const eastFlat = await ray(0.08, 0);
    const northFlank = await ray(0, -0.27);
    const westWall = await ray(-0.15, 0);

    // Flat ground is not forgiving ground. A terminal a few metres above a field that
    // runs on to the horizon has its first zone in the dirt even on the strongest path on
    // the map - which is exactly why the zone is reported beside the decibels.
    assert.ok(eastFlat.rssiDbm > -80, `east should be a strong path, measured ${eastFlat.rssiDbm.toFixed(1)} dBm`);
    assert.equal(eastFlat.fresnelClear, false, 'a grazing path over a flat field has its zone cut');
    assert.ok(northFlank.fresnelClear,
      `a terminal high above the surrounding ground keeps its zone open, saw ${northFlank.fresnelClearanceRatio.toFixed(2)} r1`);
    assert.ok(northFlank.fresnelClearanceRatio - eastFlat.fresnelClearanceRatio > 4,
      `the flank kept ${northFlank.fresnelClearanceRatio.toFixed(2)} r1 against the field's ${eastFlat.fresnelClearanceRatio.toFixed(2)}`);
    assert.equal(westWall.fresnelClear, false, 'behind the western wall nothing is clear');
    assert.ok(westWall.fresnelClearanceRatio < -1,
      `and the wall buries the ray: ${westWall.fresnelClearanceRatio.toFixed(2)} r1`);
    assert.ok(westWall.obstructionDb > 20, `the wall costs ${westWall.obstructionDb.toFixed(1)} dB as well`);

    // The two measures are not the same measure: the diffraction loss is charged for the
    // ray that ends on the cell's own ground over the whole path, the zone for the ray
    // that ends at a terminal above it, judged outside the end guards. So a cell can be
    // badly diffracted by ground right next to it and still keep its zone.
    const northNear = await ray(0, -0.15);
    assert.ok(northNear.obstructionDb > 6, `the northern ridge costs only ${northNear.obstructionDb.toFixed(1)} dB`);
    assert.equal(northNear.fresnelClear, true, 'while the zone up to a terminal above that ground stays open');
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: a higher band has a smaller zone, so more of the map is clear', async () => {
  await withApp(async (session) => {
    // The zone radius goes as the square root of the wavelength, so a band climbs and the
    // ground that was in the way is not. That claim can only be measured on ground that is
    // being looked at in every band, and a band is also a link budget: over the default
    // configuration this sweep links 2271 cells at 433 MHz and 14 at 5800 MHz, and comparing
    // "share of linked cells that are clear" between those two is comparing two different
    // maps. So the budget is opened until nothing is ever out of reach and the same cells
    // are walked and linked in every band; the last paragraph is the shuffle itself.
    await session.patch({ txPowerDbm: 43, rxSensitivityDbm: -124, heightM: 10 });
    await session.settle();
    const keys = ['433', '868', '2400', '5800'];
    const clearPct = {};
    const linked = {};
    for (const frequencyKey of keys) {
      await session.patch({ frequencyKey });
      await session.settle();
      const fresnel = await session.sim('fresnel');
      const coverage = await session.sim('coverage');
      assert.equal(fresnel.evaluatedCells, coverage.evaluatedCells,
        'the study area did not move, only the zone inside it');
      clearPct[frequencyKey] = fresnel.clearPct;
      linked[frequencyKey] = coverage.linkedCells;
    }
    for (let i = 1; i < keys.length; i += 1) {
      assert.ok(clearPct[keys[i]] > clearPct[keys[i - 1]] + 0.75,
        `${keys[i]} MHz (${clearPct[keys[i]].toFixed(1)} %) should be more clear than ${keys[i - 1]} MHz (${clearPct[keys[i - 1]].toFixed(1)} %)`,
      );
    }
    // Diffraction itself grows with the band, so the highest band is the one that starts
    // losing links to the ground: the zone gets easier and the decibels get harder.
    assert.ok(linked['5800'] < linked['2400'],
      `5800 MHz kept ${linked['5800']} of ${linked['2400']} links that 2400 MHz kept`);
    assert.ok(linked['433'] === linked['868'] && linked['868'] === linked['2400'],
      `the lower three bands all reached the edge of the map: ${keys.map((k) => linked[k]).join(' / ')}`);

    // And the shuffle is worth stating, because it is the trap: with the default budget the
    // band is deciding what gets measured at all, not how clear the zone is.
    await session.patch({ txPowerDbm: 10, rxSensitivityDbm: RF.defaultRxSensitivityDbm });
    await session.settle();
    const byBand = [];
    for (const frequencyKey of ['433', '5800']) {
      await session.patch({ frequencyKey });
      await session.settle();
      byBand.push((await session.sim('coverage')).linkedCells);
    }
    assert.ok(byBand[0] > 20 * byBand[1],
      `the default budget links ${byBand[0]} cells at 433 MHz against ${byBand[1]} at 5800 MHz`);
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

test('browser: the coverage view repaints the drape, and no view changes a decibel', async () => {
  await withApp(async (session) => {
    await session.settle();
    const pictures = new Map();
    const stats = new Map();
    const seen = [];
    for (const view of ['gradient', 'bands', 'zone', 'gradient']) {
      await session.patch({ display: { coverageView: view } });
      await session.settle();
      assert.equal((await session.sim('scene')).coverageView, view, 'the scene says which colours are up');
      seen.push({ view, frame: await session.sim('pixelStats'), stats: await session.sim('coverage') });
      pictures.set(view, seen[seen.length - 1].frame);
      stats.set(view, seen[seen.length - 1].stats);
    }
    assert.equal(seen.length, 4, 'the last visit to gradient is a separate reading, not the first');
    const [firstVisit, , , lastVisit] = seen;

    // Each view is a different picture - otherwise the select is decoration.
    assert.notEqual(pictures.get('bands').meanLuminance, pictures.get('zone').meanLuminance,
      'the zone ramp and the RSSI bands do not paint the same map');

    // Coming back to the view you started on restores the frame exactly: the mode is a
    // re-paint of the same coverage grid, not a rebuild of it.
    assert.deepEqual(
      { distinct: lastVisit.frame.distinctColours, luminance: lastVisit.frame.meanLuminance },
      { distinct: firstVisit.frame.distinctColours, luminance: firstVisit.frame.meanLuminance },
      'the picture came back unchanged',
    );

    // And the physics never moved. Three views, one sweep: a mode that changed a linked
    // cell, a range or a percentage would be a second model wearing a colour scheme.
    for (const view of ['bands', 'zone']) {
      assert.deepEqual(stats.get(view), stats.get('gradient'),
        `switching to ${view} changed the coverage statistics`);
    }
    assert.ok(stats.get('gradient').linkedCells > 0, 'this map has to have a link to look at');
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: the zone volume switch no longer chooses the colours', async () => {
  await withApp(async (session) => {
    await session.settle();
    await session.patch({ display: { coverageView: 'bands' } });
    await session.settle();
    const before = await session.sim('scene');
    assert.equal(before.coverageView, 'bands');

    await session.patch({ display: { showFresnel: true } });
    await session.settle();
    const after = await session.sim('scene');
    assert.equal(after.coverageView, 'bands', 'the volume left the drape wearing the bands');
    assert.equal((await session.sim('fresnel')).volume.visible, true, 'and did put the tube in the scene');
    assert.deepEqual(session.errors(), []);
  });
});
