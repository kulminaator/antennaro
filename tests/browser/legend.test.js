/**
 * Browser test: the legend is allowed to say what the map is painted with.
 *
 * Layer: test (browser).
 *
 * The legend exists only in the document - rows, words, swatch colours and alphas are DOM
 * presentation, with no `__sim` counterpart - so this is one of the three places in the suite
 * that reads the document instead of the API (the others are the About dialog in
 * app-boot.test.js and the curvature sentence in curvature.test.js, each justified in GUIDELINES
 * section 9). What it demands is that the words, the swatches and the faintness a reader trusts
 * are the scale the code actually ships: a legend that drifts from the drape is a chart lying
 * about its own axis.
 *
 * Split out of interaction.test.js, which is about gestures and the panel; this file is about the
 * one piece of presentation that is read out of the DOM.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { withApp } from '../harness/app.js';
import { COLOURS, RF } from '../../src/config.js';
import { hexToRgb, FAINT_CHIP_COLOUR } from '../../src/palette.js';

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
    assert.equal(faint.colour, cssRgb(FAINT_CHIP_COLOUR),
      'the rim chip is `faintWashRgb` on a representative ground, not a colour the legend invented');
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
    const outOfBudget = zone.rows[zone.rows.length - 1];
    assert.equal(outOfBudget.colour, cssRgb(FAINT_CHIP_COLOUR),
      'both legends name the absence of paint with one pigment, so a blank chip cannot mean two things');
    assert.equal(outOfBudget.alpha, 0, 'and none of it is applied to ground that was never asked');
    assert.equal(zone.rows.reduce((sum, row) => sum + row.count, 0),
      coverage.walkedCells + coverage.budgetExcludedCells,
    'and the zone legend counts the same ground');
    assert.deepEqual(session.errors(), []);
  });
});
