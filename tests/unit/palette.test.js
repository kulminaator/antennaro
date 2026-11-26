/**
 * Unit tests: the colour helpers, mainly the range gradient.
 *
 * Colours are user-facing claims. A gradient that is not monotone, or a legend whose
 * swatch is not the colour the map paints, is a lie you cannot unit-test by looking at
 * a screenshot - so these check the shape of the ramp, the endpoints, the clamping, and
 * that the legend's counts still add up to what the sweep measured.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COLOURS, FRESNEL, RF } from '../../src/config.js';
import {
  coverageLegendItems, fresnelZoneLegendItems, fresnelZoneRgb, hexToRgb, rangeGradientLegendItems,
  rangeGradientRgb, rgbToHex,
} from '../../src/palette.js';
import { generateTerrain } from '../../src/terrain/generators.js';
import { resolveSite } from '../../src/terrain/site.js';
import { createAntennaModel } from '../../src/antenna/model.js';
import { createDefaultParams } from '../../src/antenna/catalogue.js';
import { computeCoverage } from '../../src/propagation/coverage.js';
import { wavelengthM } from '../../src/propagation/rf.js';

const luminance = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

/** A real coverage result, at a size cheap enough to build in a test. */
function coverageFixture() {
  const field = generateTerrain({ size: 121, worldSize: 2400, seed: 9711 });
  const site = resolveSite(field, { heightM: 12 });
  const model = createAntennaModel({
    designId: 'omni-collinear', params: createDefaultParams('omni-collinear'),
    aim: { azimuthDeg: 90, tiltDeg: 0 }, wavelength: wavelengthM(868e6),
  });
  return computeCoverage({
    field, site, model, freqHz: 868e6, txPowerDbm: 10, feederLossDb: 1.5,
    rxSensitivityDbm: -80, maxRangeM: RF.defaultMaxRangeM, clutterLossDb: 0, useDiffraction: true,
  });
}

const stops = Object.freeze({
  strong: hexToRgb(COLOURS.gradientStops.strong),
  mid: hexToRgb(COLOURS.gradientStops.mid),
  weak: hexToRgb(COLOURS.gradientStops.weak),
});

test('palette: the range gradient runs yellow to pink as the margin runs out', () => {
  const top = RF.gradientMaxMarginDb;
  const at = (margin) => rangeGradientRgb(margin);
  assert.deepEqual(at(top), stops.strong, 'a full budget of margin is the strong stop exactly');
  assert.deepEqual(at(top / 2), stops.mid, 'half of it is the middle stop exactly');
  assert.deepEqual(at(0), stops.weak, 'and a link at the limit is the pink stop exactly');

  // The direction the user asked for, measured rather than opined on. "Yellow to pink"
  // is a rotation of the hue, not a darkening, so the honest invariants are the two
  // channel relationships that define it: yellow is red-dominant over blue and has a lot
  // more green than blue, and pink has neither. Both must fall monotonically as the
  // margin runs out. (An earlier draft of this test asserted monotone *saturation*, which
  // the ramp does not do: a pale yellow mixes *less* saturated than the pure pink it
  // sits above, so the middle of the scale is the flat part. The colours are fine; the
  // guess about them was wrong.)
  let previousRedOverBlue = Infinity;
  let previousYellowness = Infinity;
  for (let margin = top; margin >= 0; margin -= 3) {
    const rgb = at(margin);
    const redOverBlue = rgb[0] / rgb[2];
    const yellowness = rgb[1] - rgb[2];
    assert.ok(redOverBlue <= previousRedOverBlue + 1e-9,
      `margin ${margin} dB: pink is redder against blue than yellow (${redOverBlue.toFixed(3)})`);
    assert.ok(yellowness <= previousYellowness + 1e-9,
      `margin ${margin} dB: green falls towards blue as the link weakens (${yellowness.toFixed(3)})`);
    previousRedOverBlue = redOverBlue;
    previousYellowness = yellowness;
  }
  assert.ok(luminance(at(0)) > luminance(at(top)),
    'and the very-weak end is the pale one, not the dark one');
});

test('palette: the gradient clamps, and can be told where to write', () => {
  const top = RF.gradientMaxMarginDb;
  assert.deepEqual(rangeGradientRgb(top * 10), stops.strong, 'more margin than the scale holds is still strong');
  assert.deepEqual(rangeGradientRgb(-999), stops.weak, 'a negative margin does not invent a fourth colour');
  assert.deepEqual(rangeGradientRgb(Number.NaN), stops.weak, 'and a missing margin is treated as no margin');

  const out = [0, 0, 0];
  const returned = rangeGradientRgb(top, out);
  assert.equal(returned, out, 'the out argument is what comes back, so the drape allocates once');
  assert.deepEqual(out, stops.strong);
  assert.notEqual(rangeGradientRgb(top), stops.strong, 'a fresh call does not hand out a shared array');
});

test('palette: the gradient legend paints the colours the map paints, and counts honestly', () => {
  const coverage = coverageFixture();
  const items = rangeGradientLegendItems(coverage);
  assert.equal(items.length, coverage.margins.length + 2, 'one row per band, plus lost and never-asked');

  // Every swatch must be a colour the ramp actually produces at that boundary.
  const rgb = [0, 0, 0];
  items.slice(0, coverage.margins.length).forEach((item, band) => {
    const expected = rgbToHex(rangeGradientRgb(coverage.margins[band], rgb));
    assert.equal(item.colour, expected, `band ${band} swatch is the ramp at its own boundary`);
    assert.equal(item.alpha, 1, 'a working link is painted solid');
    assert.ok(item.count >= 0);
  });

  const faint = items[coverage.margins.length];
  assert.equal(faint.alpha, RF.noLinkAlpha, 'asked and lost stays faint');
  const never = items[items.length - 1];
  assert.equal(never.alpha, 0, 'never asked stays unpainted');
  assert.equal(never.colour, COLOURS.noLink);

  const total = items.reduce((sum, item) => sum + item.count, 0);
  assert.equal(total, coverage.stats.walkedCells + coverage.stats.budgetExcludedCells,
    'the legend counts every point the sweep can account for, no more and no fewer');
  assert.ok(coverage.stats.budgetExcludedCells > 0, 'this fixture must actually exercise the excluded row');

  // The banded legend still exists and counts the same ground.
  const banded = coverageLegendItems(coverage);
  assert.equal(banded.reduce((sum, item) => sum + item.count, 0), total,
    'both legends describe the same set of painted points');
});

test('palette: the gradient and the Fresnel zone view never share a colour', () => {
  const gradientHexes = new Set([
    COLOURS.gradientStops.strong, COLOURS.gradientStops.mid, COLOURS.gradientStops.weak,
  ]);
  const zoneHexes = new Set([
    COLOURS.fresnelObstructed, COLOURS.fresnelPartial, COLOURS.fresnelClear, COLOURS.fresnelVolume,
  ]);
  for (const hex of gradientHexes) {
    assert.ok(!zoneHexes.has(hex), `${hex} belongs to two different views`);
  }
  // And the ramps are distinguishable in the middle, not merely named differently: the
  // two views can be switched, so a cell that looks the same in both tells the reader
  // nothing about which one they are looking at.
  const worstGap = Math.min(...[0.1, 0.35, 0.6, 0.85, 1].map((t) => {
    const signal = rangeGradientRgb(t * RF.gradientMaxMarginDb);
    const zone = fresnelZoneRgb(FRESNEL.rampMaxRatio * t);
    return Math.abs(luminance(signal) - luminance(zone)) + Math.abs(signal[2] - zone[2]);
  }));
  assert.ok(worstGap > 0.08, `the two ramps converge too closely (${worstGap.toFixed(3)})`);

  const coverage = coverageFixture();
  const zoneItems = fresnelZoneLegendItems(coverage.stats);
  const gradientItems = rangeGradientLegendItems(coverage).slice(0, coverage.margins.length);
  for (const zoneItem of zoneItems) {
    for (const signalItem of gradientItems) {
      assert.notEqual(zoneItem.colour, signalItem.colour,
        `zone row "${zoneItem.label}" and gradient row "${signalItem.label}" are the same colour`);
    }
  }
});
