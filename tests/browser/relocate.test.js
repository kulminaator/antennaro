/**
 * Browser tests: relocating the antenna.
 *
 * The unit suite pins the maths (the ground ignores the site, picking round-trips);
 * these tests pin the wiring a user actually experiences: a patch or a drag moves the
 * mast, the coverage grid and the pixels together while the ground under the mountain
 * does not move at all, the drag cycle works through the test surface (never by
 * clicking at coordinates, GUIDELINES.md §9), and both resets bring the mast home.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ANTENNA } from '../../src/config.js';
import { withApp } from '../harness/app.js';

const YAGI_PARAMS = Object.freeze({ directors: 8, spacingLambda: 0.3, beamTiltDeg: 0 });
const almost = (value, expected, tolerance) => Math.abs(value - expected) < tolerance;

test('browser: relocating moves the rig and the coverage, and not one metre of ground', async () => {
  await withApp(async (session) => {
    await session.settle();
    const groundAtCentre = await session.sim('heightAt', 0, 0);
    assert.ok(almost(groundAtCentre, (await session.sim('site')).groundY, 1e-6),
      `the mast starts off the surface it stands on (${groundAtCentre})`);
    const before = await session.sim('pixelStats');
    // Ground all over the map, including where the mast stands now and where it is
    // about to stand. Relocation must leave every one of them exactly as it was.
    const probe = async () => {
      const out = [];
      for (const [x, z] of [[0, 0], [0, -900], [0, 900], [400, 200], [900, 200], [-700, -700], [1100, 200]]) {
        out.push(await session.sim('heightAt', x, z));
      }
      return out;
    };
    const groundBefore = await probe();

    const patched = await session.patch({ site: { x: 400, z: 200 } });
    assert.deepEqual(patched.rejected, [], 'a valid relocation was rejected');
    assert.deepEqual(patched.clamped, [], 'the offsets are inside the map, so nothing should clamp');
    await session.settle();

    const site = await session.sim('site');
    assert.equal(site.x, 400);
    assert.equal(site.z, 200);
    assert.deepEqual((await session.sim('scene')).sitePosition, [400, 200], 'the rig did not follow the state');
    assert.ok(almost(site.groundY, await session.sim('heightAt', 400, 200), 1e-6),
      'the mast base is not on the ground it was placed on');

    // The map is the map: moving the antenna changed the map nowhere.
    const groundAfter = await probe();
    for (let i = 0; i < groundBefore.length; i += 1) {
      assert.ok(almost(groundBefore[i], groundAfter[i], 1e-6),
        `moving the antenna changed the ground: ${groundBefore[i]} -> ${groundAfter[i]} m`);
    }

    const after = await session.sim('pixelStats');
    assert.notDeepEqual(
      { c: before.distinctColours, l: before.meanLuminance },
      { c: after.distinctColours, l: after.meanLuminance },
      'moving the antenna changed nothing on screen',
    );
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: the beam and the link budget follow the mast to its new home', async () => {
  await withApp(async (session) => {
    // Shadowing off isolates the pattern: what is being tested is "the beam is
    // aimed east from wherever the mast stands", not the ground in between.
    await session.patch({
      designId: 'yagi',
      params: YAGI_PARAMS,
      aim: { azimuthDeg: 90, tiltDeg: 0 },
      useDiffraction: false,
      site: { x: 400, z: 200 },
    });
    await session.settle();

    const ahead = await session.sim('rssiAt', 900, 200);
    const behind = await session.sim('rssiAt', -100, 200);
    assert.ok(ahead && behind, 'both samples are inside the study area');
    assert.ok(ahead.rssiDbm > behind.rssiDbm + 10,
      `aimed east from (400, 200): ahead ${ahead.rssiDbm} dBm vs behind ${behind.rssiDbm} dBm`);
    // Distance is measured from the site, not from the map centre: 500 m out both
    // ways, so the free-space loss is the same and only the pattern can differ.
    assert.ok(almost(ahead.distanceM, 500, 15) && almost(behind.distanceM, 500, 15),
      `ranges should match: ${ahead.distanceM} vs ${behind.distanceM}`);
    assert.ok((await session.sim('coverage')).evaluatedCells > 0, 'nothing was evaluated at the new site');
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: the mast stands on the surface on high ground and in the valley', async () => {
  await withApp(async (session) => {
    // The mast foot is the ground wherever it is put: up the mountain, down in the
    // channel, without anything being graded to make that true.
    await session.patch({ site: { x: 0, z: -900 } });
    await session.settle();
    const hilltop = await session.sim('site');
    assert.ok(hilltop.groundY > 100, `the mast did not ride up the mountain: ${hilltop.groundY} m`);
    assert.ok(almost(await session.sim('heightAt', hilltop.x, hilltop.z), hilltop.groundY, 1e-6),
      'the mast base is not standing on the ground');

    await session.patch({ site: { x: 0, z: 900 } });
    await session.settle();
    const valley = await session.sim('site');
    assert.ok(valley.groundY < hilltop.groundY - 100,
      `the mast foot is not terrain-driven: hilltop ${hilltop.groundY} m vs valley floor ${valley.groundY} m`);
    assert.ok(almost(await session.sim('heightAt', 0, 900), valley.groundY, 1e-6),
      'the valley mast is not standing on the ground');
    // Either way the hardware is above the surface it stands on.
    assert.ok((await session.sim('scene')).antennaY > valley.groundY, 'the hardware sits below the ground');
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: the ridge keeps its shape when the mast stands on its shoulder', async () => {
  await withApp(async (session) => {
    // Regression, and the reason the pad is gone: with a flattened platform under
    // the mast, putting the antenna on a ridge flank filled the slope by tens of
    // metres, the plateau travelled with the mast, and the mountain looked like it
    // grew sideways.
    const probes = [[0, -200], [0, 200], [200, 0], [-200, 0], [140, -140], [-140, 140]];
    const probe = async () => {
      const out = [];
      for (const [dx, dz] of probes) out.push(await session.sim('heightAt', 500 + dx, -600 + dz));
      return out;
    };

    await session.patch({ site: { x: 500, z: -600 } });
    await session.settle();
    const site = await session.sim('site');
    assert.ok(almost(site.groundY, await session.sim('heightAt', 500, -600), 1e-6), 'the mast is not on the ground');
    const withMastHere = await probe();
    // The slope next to the mast is still a slope: nothing was filled in to make a
    // plateau. Half a metre tolerance because the grid is sampled between cells.
    const downhill = await session.sim('heightAt', 500, -560);
    assert.ok(downhill < site.groundY - 1,
      `the ground 40 m from the mast was levelled to it: ${downhill} m vs a mast foot at ${site.groundY} m`);

    await session.patch({ site: { x: -900, z: 900 } });
    await session.settle();
    const afterItLeft = await probe();
    for (let i = 0; i < probes.length; i += 1) {
      assert.ok(almost(withMastHere[i], afterItLeft[i], 1e-6),
        `the mast shaped ground 200 m away: ${withMastHere[i]} vs ${afterItLeft[i]}`);
    }
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: grabbing the mast and dragging moves the site', async () => {
  await withApp(async (session) => {
    await session.settle();
    assert.deepEqual((await session.sim('state')).site, { x: ANTENNA.defaultSiteXm, z: ANTENNA.defaultSiteZm });

    const grab = await session.sim('grabSite');
    assert.equal(grab.ok, true, 'the drag adapter refused the grab');
    assert.ok(almost(grab.planeY, (await session.sim('site')).groundY, 1e-6), 'the drag slides on the plane of the ground it grabbed');

    const moved = await session.sim('dragSiteTo', 0.45, 0);
    assert.equal(moved.ok, true, JSON.stringify(moved));
    assert.ok(Number.isFinite(moved.x) && Number.isFinite(moved.z), `drag left the map: ${JSON.stringify(moved)}`);
    assert.ok(Math.abs(moved.x) > 1 || Math.abs(moved.z) > 1, 'a drag that moves nothing is not a drag');
    assert.equal((await session.sim('dragState')).active, true, 'the drag should still be in progress');

    const released = await session.sim('releaseSite');
    assert.equal(released.ok, true);
    assert.equal((await session.sim('dragState')).active, false, 'release left the drag hanging');
    await session.settle();

    // The reducer snaps the offsets to the panel step, so compare to within one step.
    const state = await session.sim('state');
    assert.ok(almost(state.site.x, moved.x, ANTENNA.siteStepM), `state x ${state.site.x} vs dragged ${moved.x}`);
    assert.ok(almost(state.site.z, moved.z, ANTENNA.siteStepM), `state z ${state.site.z} vs dragged ${moved.z}`);

    const site = await session.sim('site');
    assert.deepEqual((await session.sim('scene')).sitePosition, [site.x, site.z], 'the rig is not where the site is');
    // The drag slides on a horizontal plane at the height the grab happened at, but
    // the mast is placed on the ground where it lands - not on the plane it was
    // dragged along.
    assert.ok(almost(site.groundY, await session.sim('heightAt', site.x, site.z), 1e-6),
      `after the drag the mast floats ${site.groundY} m above the ground`);
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: picking at the mast returns the site footprint', async () => {
  await withApp(async (session) => {
    await session.patch({ site: { x: 300, z: -150 } });
    await session.settle();
    const site = await session.sim('site');
    // Aim the camera at the site itself: then the centre of the screen is exactly
    // the mast's footprint, with no framing ambiguity left.
    await session.sim('setCamera', { targetX: site.x, targetY: site.groundY, targetZ: site.z });
    await session.settle();

    const centre = await session.sim('pick', 0, 0);
    assert.ok(centre, 'the centre of the screen picked nothing');
    const toSite = Math.hypot(centre.x - site.x, centre.z - site.z);
    const toCentre = Math.hypot(centre.x, centre.z);
    assert.ok(toSite < 5, `centre pick (${centre.x}, ${centre.z}) is ${toSite} m from the site`);
    assert.ok(toSite < toCentre, 'the pick was closer to the map centre than to the mast');
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: reset placement and reset all both bring the mast home', async () => {
  await withApp(async (session) => {
    await session.patch({ site: { x: 500, z: -300 } });
    await session.settle();
    assert.equal((await session.sim('site')).x, 500, 'setup: the mast should have moved first');

    const placement = await session.action({ type: 'reset-site' });
    assert.equal(placement.ok, true, placement.reason);
    await session.settle();
    let site = await session.sim('site');
    assert.equal(site.x, ANTENNA.defaultSiteXm);
    assert.equal(site.z, ANTENNA.defaultSiteZm);
    assert.ok(almost(await session.sim('heightAt', 0, 0), (await session.sim('site')).groundY, 1e-6),
      'the mast is not on the ground after the reset');

    await session.patch({ designId: 'yagi', params: YAGI_PARAMS, site: { x: -800, z: 600 } });
    await session.settle();
    const everything = await session.action({ type: 'reset-all' });
    assert.equal(everything.ok, true, everything.reason);
    await session.settle();
    site = await session.sim('site');
    assert.equal(site.x, 0, 'reset-all must relocate the site too');
    assert.equal(site.z, 0);
    assert.equal((await session.sim('state')).designId, ANTENNA.defaultDesignId, 'the old full reset stopped working');

    const bogus = await session.action({ type: 'no-such-action' });
    assert.equal(bogus.ok, false);
    assert.match(bogus.reason, /unknown action/);
    assert.deepEqual(session.errors(), []);
  });
});
