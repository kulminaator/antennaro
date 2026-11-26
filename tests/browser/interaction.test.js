/**
 * Browser tests: user-visible patches change the physics and the pixels.
 *
 * The unit suite pins the maths; these tests pin the wiring - that a patch
 * through `window.__sim.patch()` reaches the model, the coverage grid and the
 * drawn frame, and that what the page reports agrees with the pure model the
 * rest of the suite covers.
 *
 * Reference numbers below come from running the same pure pipeline in Node
 * (`node tools/test.js --unit` covers them); here we check the browser agrees.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { withApp } from '../harness/app.js';
import { ANTENNA, COLOURS, RF } from '../../src/config.js';
import { hexToRgb } from '../../src/palette.js';

const YAGI_PARAMS = Object.freeze({ directors: 10, spacingLambda: 0.28, beamTiltDeg: 0 });
const sector = (stats, label) => stats.sectors.find((entry) => entry.label === label);

/** How the browser writes one of our hex colours back out in a `style` attribute. */
const cssRgb = (hex) => `rgb(${hexToRgb(hex).map((c) => Math.round(c * 255)).join(', ')})`;

/** The legend as a reader sees it: rows of words, swatches and counts, plus its footnote. */
const READ_LEGEND = `({
  title: document.querySelector('.hud-legend')?.previousElementSibling?.textContent ?? null,
  rows: [...document.querySelectorAll('.hud-legend .legend-item')].map((li) => ({
    label: li.querySelector('.legend-label')?.textContent ?? '',
    count: Number(li.querySelector('.legend-count')?.textContent ?? '-1'),
    colour: li.querySelector('.legend-swatch')?.style.background ?? '',
    alpha: Number(li.querySelector('.legend-swatch')?.style.opacity ?? '-1'),
  })),
  note: document.querySelector('.hud-legend .legend-note')?.textContent ?? null,
})`;

test('browser: switching design changes the model, the rig and the coverage', async () => {
  await withApp(async (session) => {
    await session.settle();
    const before = await session.sim('antenna');
    const beforeScene = await session.sim('scene');
    const beforeLinked = (await session.sim('coverage')).linkedCells;

    const patched = await session.patch({ designId: 'yagi', params: YAGI_PARAMS });
    assert.deepEqual(patched.rejected, [], 'a valid design patch was rejected');
    await session.settle();

    const after = await session.sim('antenna');
    const afterScene = await session.sim('scene');
    assert.equal(after.id, 'yagi');
    assert.equal(after.family, 'directional');
    assert.equal(after.aimsInAzimuth, true);
    assert.equal(after.params.directors, 10);
    assert.ok(after.frontToBackDb > 15, `yagi front-to-back only ${after.frontToBackDb} dB`);
    assert.ok(after.peakGainDbi > before.peakGainDbi + 3, 'the Yagi is not higher gain than the dipole');
    assert.notEqual(afterScene.antennaParts, beforeScene.antennaParts, 'the rig did not change shape');
    assert.notEqual((await session.sim('coverage')).linkedCells, beforeLinked);
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: junk input is rejected and leaves the state untouched', async () => {
  await withApp(async (session) => {
    await session.settle();
    const before = await session.sim('state');

    const result = await session.patch({ notAField: 12, seed: 'banana', aim: { tiltDeg: null } });
    assert.equal(result.ok, false);
    assert.equal(result.changed.length, 0, `something changed: ${result.changed.join(', ')}`);
    assert.ok(result.rejected.length >= 3, `expected rejections, got ${JSON.stringify(result.rejected)}`);

    const after = await session.sim('state');
    assert.equal(after.seed, before.seed);
    assert.deepEqual(after.aim, before.aim);
  });
});

test('browser: out-of-range numbers clamp, and compass angles wrap', async () => {
  await withApp(async (session) => {
    const patched = await session.patch({ heightM: 900, aim: { tiltDeg: 900 } });
    assert.equal(patched.ok, true, 'clamping is still a valid patch');
    assert.deepEqual(patched.clamped.map((entry) => entry.key).sort(), ['aim.tiltDeg', 'heightM']);

    const state = await session.sim('state');
    assert.equal(state.heightM, 40, 'height must clamp to ANTENNA.heightLimitsM.max');
    assert.equal(state.aim.tiltDeg, 60, 'tilt must clamp to ANTENNA.tiltLimitsDeg.max');

    const spun = await session.patch({ aim: { azimuthDeg: 405 } });
    assert.deepEqual(spun.clamped, [], 'azimuth is a compass heading: it wraps, it does not clamp');
    assert.equal((await session.sim('state')).aim.azimuthDeg, 45);

    await session.settle();
    assert.equal(Number((await session.sim('scene')).mastHeightM.toFixed(2)), 40);
  });
});

test('browser: azimuth reaches the model, the coverage grid and the pixels', async () => {
  await withApp(async (session) => {
    // Shadowing off first: that isolates the antenna pattern, so the east and
    // west samples are a clean read of "where is the beam".
    //
    // The mast goes east of centre on purpose. From the map centre the western ground
    // rises into the bump field as a wall, and no cell in the west sector can link at any
    // aim or mast height - a test there can only ever compare zeros. On the flat field
    // east of centre both compass directions have ground to serve, which is what this
    // test is actually about.
    const siteX = ANTENNA.siteLimitsM.max * 0.6;
    await session.patch({
      designId: 'yagi', params: YAGI_PARAMS, aim: { azimuthDeg: 90, tiltDeg: 0 }, useDiffraction: false,
      site: { x: siteX, z: 0 },
    });
    await session.settle();

    const model = await session.sim('antenna');
    assert.equal(model.boresightDeg.azimuthDeg, 90, 'the model did not follow the requested azimuth');
    assert.equal(model.boresightDeg.elevationDeg, 0, 'level tilt should mean level boresight');

    // Sample points the same distance from the mast on either side, so the only
    // difference between them is which way the beam is pointing.
    const eastPoint = await session.sim('rssiAt', siteX + 700, 0);
    const westPoint = await session.sim('rssiAt', siteX - 700, 0);
    assert.ok(eastPoint && westPoint, 'coverage samples missing on the east-west axis');
    assert.ok(eastPoint.rssiDbm > westPoint.rssiDbm + 10,
      `aimed east: east ${eastPoint.rssiDbm} dBm vs west ${westPoint.rssiDbm} dBm`);

    await session.patch({ aim: { azimuthDeg: 270 } });
    await session.settle();
    const eastPointNow = await session.sim('rssiAt', siteX + 700, 0);
    const westPointNow = await session.sim('rssiAt', siteX - 700, 0);
    assert.ok(westPointNow.rssiDbm > eastPointNow.rssiDbm + 10,
      `aimed west: west ${westPointNow.rssiDbm} dBm vs east ${eastPointNow.rssiDbm} dBm`);
    assert.ok(westPointNow.rssiDbm > westPoint.rssiDbm + 10, 'the west sample did not hear the swing');
    assert.ok(eastPoint.rssiDbm > eastPointNow.rssiDbm + 10, 'the east sample did not hear the swing');

    // With shadowing back on, sector counts must not be read as an absolute race: what
    // must hold is that swinging the beam changes each sector relative to itself.
    await session.patch({ useDiffraction: true });
    await session.settle();
    const aimedWest = await session.sim('coverage');
    await session.patch({ aim: { azimuthDeg: 90 } });
    await session.settle();
    const aimedEast = await session.sim('coverage');

    assert.ok(sector(aimedEast, 'E').linked > 4 * sector(aimedWest, 'E').linked,
      `east sector did not collapse when the beam swung away (${sector(aimedWest, 'E').linked} -> ${sector(aimedEast, 'E').linked})`);
    assert.ok(sector(aimedWest, 'W').linked > sector(aimedEast, 'W').linked,
      `west sector did not improve when the beam swung in (${sector(aimedEast, 'W').linked} -> ${sector(aimedWest, 'W').linked})`);
    assert.ok(aimedEast.maxLinkedBearingDeg > 45 && aimedEast.maxLinkedBearingDeg < 135,
      `longest link while aimed east points at ${aimedEast.maxLinkedBearingDeg} deg`);

    // The same aim change must move pixels: otherwise the picture is decoupled
    // from the numbers above.
    await session.patch({ aim: { azimuthDeg: 270 } });
    await session.sim('settle');
    const westPixels = await session.sim('pixelStats');
    await session.patch({ aim: { azimuthDeg: 90 } });
    await session.sim('settle');
    const eastPixels = await session.sim('pixelStats');
    assert.notDeepEqual(
      { c: westPixels.distinctColours, l: westPixels.meanLuminance },
      { c: eastPixels.distinctColours, l: eastPixels.meanLuminance },
      'aiming the antenna changed nothing on screen',
    );
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: a taller mast buys clearance, not just a bigger number', async () => {
  await withApp(async (session) => {
    await session.patch({ designId: 'omni-dipole', heightM: 2, rxSensitivityDbm: -80 });
    await session.settle();
    const low = await session.sim('coverage');

    await session.patch({ heightM: 30 });
    await session.settle();
    const high = await session.sim('coverage');

    assert.ok(high.linkedCells > low.linkedCells,
      `30 m mast linked ${high.linkedCells} cells, 2 m linked ${low.linkedCells}`);
    assert.ok(high.blockedCells < low.blockedCells, 'more height should un-shadow cells');
    // The three westerly directions together: on this map due west is a wall of ground
    // that no mast in the model reaches over, so the sector that gains reach with height
    // is south-west and north-west. Summing the westerly directions keeps the claim - the
    // bumps stop being the limit as the mast grows - without pinning it to one compass
    // point that the terrain happens to make hopeless.
    const westward = (stats) => ['W', 'SW', 'NW'].reduce((sum, label) => sum + sector(stats, label).maxRangeM, 0);
    assert.ok(westward(high) > westward(low),
      `reach towards the bumps was ${westward(low).toFixed(0)} m at 2 m and ${westward(high).toFixed(0)} m at 30 m`);
    for (const label of ['W', 'SW', 'NW']) {
      assert.ok(sector(high, label).maxRangeM >= sector(low, label).maxRangeM - 1e-9,
        `${label} lost reach when the mast grew: ${sector(low, label).maxRangeM} m to ${sector(high, label).maxRangeM} m`);
    }
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: display toggles hide objects without hiding the ground', async () => {
  await withApp(async (session) => {
    await session.settle();
    const on = await session.sim('scene');
    assert.equal(on.coverageVisible, true);
    assert.equal(on.patternVisible, true);
    assert.equal(on.labelsVisible, true);

    await session.patch({ display: { showCoverage: false, showPattern: false, showSectors: false } });
    await session.settle();
    const off = await session.sim('scene');
    assert.equal(off.coverageVisible, false);
    assert.equal(off.patternVisible, false);
    assert.equal(off.labelsVisible, false);

    const pixels = await session.sim('pixelStats');
    assert.ok(pixels.nonBackgroundFraction > 0.05, 'the terrain vanished along with the overlays');
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: presets arrive through the action channel', async () => {
  await withApp(async (session) => {
    const applied = await session.action({ type: 'apply-preset', value: 'valley-reach' });
    assert.equal(applied.ok, true, applied.reason);
    const state = await session.sim('state');
    assert.equal(state.designId, 'yagi');
    assert.equal(state.aim.azimuthDeg, 180, 'the valley preset should point south');
    assert.equal(state.aim.tiltDeg, -6);
    assert.equal(state.heightM, 24);

    await session.settle();
    const stats = await session.sim('coverage');
    assert.ok(sector(stats, 'S').linked > sector(stats, 'N').linked,
      'aimed south but the north sector is better linked');

    const bogus = await session.action({ type: 'apply-preset', value: 'no-such-preset' });
    assert.equal(bogus.ok, false);
    assert.match(bogus.reason, /unknown preset/);
  });
});

test('browser: the terrain seed is deterministic, and "New terrain" re-rolls it', async () => {
  await withApp(async (session) => {
    const shape = async () => {
      const stats = await session.sim('terrain');
      return { cells: stats.cells, min: stats.min, max: stats.max, mean: Number(stats.mean.toFixed(6)) };
    };

    await session.patch({ seed: 777 });
    await session.settle();
    const first = await shape();
    await session.patch({ seed: 4242 });
    await session.settle();
    const other = await shape();
    await session.patch({ seed: 777 });
    await session.settle();
    const again = await shape();

    assert.deepEqual(first, again, 'the same seed produced different ground');
    assert.notDeepEqual(first, other, 'different seeds produced identical ground');
    assert.equal((await session.sim('state')).seed, 777);

    const rolled = await session.action({ type: 'new-seed' });
    assert.equal(rolled.ok, true);
    assert.notEqual(rolled.seed, 777);
    await session.settle();
    assert.equal((await session.sim('state')).seed, rolled.seed);
    assert.deepEqual(session.errors(), []);
  });
});

test('browser: the ?preset= query parameter is honoured at boot', async () => {
  await withApp(async (session) => {
    const state = await session.sim('state');
    assert.equal(state.designId, 'patch');
    assert.equal(state.heightM, 18);
    assert.equal(state.aim.azimuthDeg, 135);
    assert.equal(state.params.beamTiltDeg, 8, 'electrical downtilt should survive the URL');
  }, { query: '?preset=site-sector' });
});

test('browser: a reload boots a clean app with an empty error list', async () => {
  await withApp(async (session) => {
    await session.patch({ designId: 'biquad-reflector', aim: { azimuthDeg: 123 } });
    await session.settle();
    await session.reload();

    const state = await session.sim('state');
    assert.equal(state.designId, 'omni-dipole', 'state should not survive a reload');
    assert.deepEqual(await session.appErrors(), []);
    assert.deepEqual(session.errors(), []);
    assert.ok((await session.sim('scene')).triangles > 1000);
  });
});

test('browser: the legend says what the map is painted with', async () => {
  // Presentation, not state. The legend exists only in the document, so this is the second
  // browser test that reads the DOM instead of `window.__sim` - the About dialog in
  // app-boot.test.js being the first, for the same reason. What it demands is that the words,
  // the swatches and the faintness a reader trusts are the scale the code actually ships,
  // because a legend that drifts from the drape is a chart lying about its own axis.
  await withApp(async (session) => {
    await session.settle();
    const coverage = await session.sim('coverage');
    const legend = await session.evaluate(READ_LEGEND);

    assert.equal(legend.title, 'Coverage legend');
    const steps = legend.rows.slice(0, COLOURS.levels.length);
    assert.equal(steps.length, RF.levelNames.length, 'one row per step, and no hidden fifth');
    steps.forEach((row, band) => {
      assert.ok(row.label.startsWith(`${RF.levelNames[band]}:`), `row ${band} reads "${row.label}"`);
      assert.equal(row.colour, cssRgb(COLOURS.levels[band]), `row ${band} is not the colour the map paints`);
      assert.equal(row.alpha, 1, `row ${band} is a working link, so it is painted solid`);
    });

    const faint = legend.rows[COLOURS.levels.length];
    assert.equal(faint.alpha, RF.noLinkAlpha, 'the rim swatch is as faint as the rim it describes');
    const never = legend.rows[legend.rows.length - 1];
    assert.equal(never.alpha, 0, 'the ground nobody asked about has no colour at all');
    assert.equal(legend.rows.reduce((sum, row) => sum + row.count, 0),
      coverage.walkedCells + coverage.budgetExcludedCells,
    'the rows count the same ground the sweep reports, no more and no fewer');
    const populated = steps.filter((row) => row.count > 0).length;
    assert.equal(populated, steps.length, 'every step occurs on the default map');

    await session.patch({ display: { coverageView: 'zone' } });
    await session.settle();
    const zone = await session.evaluate(READ_LEGEND);
    assert.equal(zone.title, 'Fresnel zone legend', 'the legend changes with the picture under it');
    assert.ok(zone.note, 'the zone rows need the sentence about what they count');
    const stepColours = COLOURS.levels.map(cssRgb);
    for (const row of zone.rows) {
      assert.ok(!stepColours.includes(row.colour), `zone row "${row.label}" wears a signal colour`);
    }
    assert.equal(zone.rows.reduce((sum, row) => sum + row.count, 0),
      coverage.walkedCells + coverage.budgetExcludedCells,
    'and the zone legend counts the same ground');
    assert.deepEqual(session.errors(), []);
  });
});
