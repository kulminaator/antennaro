/**
 * Unit tests: the colours the map is painted with.
 *
 * Colour is a user-facing claim, and the claim is *readability* - so it is tested as a
 * readability claim, in a colour space where distance means "an eye sees a difference".
 * The previous version of this file asserted a story instead ("yellow to pink", "the weak
 * end is paler than the strong end") and the ramp it guarded had stops at L* 76/89/76: its
 * two ends were 0.4 apart and its middle was the brightest pixel on the map, so every
 * assertion passed on a scale with no direction. What is asserted here is measured:
 * neighbour separation under four vision models, survival under the drape's own alpha, and
 * a legend that paints the colours the map paints and counts the ground it counts.
 *
 * The ruler is CIEDE2000 (`tests/harness/colour.js`) and it is calibrated below, against
 * published values, before it is allowed to judge anything.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COLOURS, RF } from '../../src/config.js';
import {
  coverageLegendItems, coverageRgb, FAINT_CHIP_COLOUR, faintWashRgb, fresnelZoneLegendItems,
  hexToRgb, rgbToHex, terrainRgb,
} from '../../src/palette.js';
import { generateTerrain } from '../../src/terrain/generators.js';
import { resolveSite } from '../../src/terrain/site.js';
import { createAntennaModel } from '../../src/antenna/model.js';
import { createDefaultParams } from '../../src/antenna/catalogue.js';
import { computeCoverage } from '../../src/propagation/coverage.js';
import { wavelengthM } from '../../src/propagation/rf.js';
import {
  VISION, chroma, deltaE000Lab, distance, draped, hueAngle, lightness, see, worstDistance,
} from '../harness/colour.js';

/** How far apart two hex colours must be to read as two colours, worst eye first. */
const DISTINCT = 11;

/** The five colours the terrain ramp passes through, darkest ground to rock, made by the
    ramp itself rather than by a copy of its numbers in here. */
const terrainStops = () => [0, 0.25, 0.5, 0.75, 1].map((t) => terrainRgb(t, 0, 1));

/** A real coverage result from an ordinary link, at a size cheap enough to build in a test. */
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

test('palette: the ruler measures what the published CIEDE2000 table says', () => {
  // Three rows of Sharma et al.'s (2005) published table: a small difference, a middle one,
  // and the pair whose blue sign flips - the case that exercises the rotation term, the part
  // of CIEDE2000 most hand-rolled implementations get wrong. If the ruler drifts, every
  // colour assertion below becomes meaningless, so it is tested before it is used.
  const published = [
    [[50.0000, -1.3802, -84.2814], [50.0000, 0.0000, -82.7485], 1.0000],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[22.7233, 20.0904, -43.6940], [23.0331, 14.9730, 42.2885], 45.5335],
  ];
  for (const [lab1, lab2, expected] of published) {
    assert.ok(Math.abs(deltaE000Lab(lab1, lab2) - expected) < 1e-3,
      `CIEDE2000 says ${deltaE000Lab(lab1, lab2).toFixed(4)}, the table says ${expected}`);
  }
});

test('palette: the signal scale is four steps and every neighbour is a different colour', () => {
  const steps = COLOURS.levels;
  assert.equal(steps.length, RF.levelMarginsDb.length, 'one threshold per step');
  assert.equal(steps.length, RF.levelNames.length, 'one name per step');
  assert.equal(steps.length, 4, 'four steps: the most this hue path carries (see below)');

  const margins = RF.levelMarginsDb;
  for (let i = 1; i < margins.length; i += 1) {
    assert.ok(margins[i] < margins[i - 1], `threshold ${i} must sit below threshold ${i - 1}`);
  }
  assert.equal(margins[margins.length - 1], 0,
    'the weakest step starts at the receiver sensitivity itself, so no linked cell goes unpainted');

  for (let i = 1; i < steps.length; i += 1) {
    const gap = worstDistance(hexToRgb(steps[i]), hexToRgb(steps[i - 1]));
    assert.ok(gap >= DISTINCT, `steps ${i - 1} and ${i} are only ${gap.toFixed(1)} dE000 apart`);
  }
  // Ten dE000 is roughly where two patches stop being "different, somehow" and become two
  // colours. The measured floor is 11.5 - step 0 from step 1 under deuteranopia - so the
  // four steps clear it, and a fifth step on this red-through-yellow path would not: that,
  // and not taste, is why the count is four.
  const deutan = steps.map((hex) => see(hexToRgb(hex), 'deutan'));
  for (let i = 1; i < deutan.length; i += 1) {
    assert.ok(distance(deutan[i], deutan[i - 1]) > 10,
      `deuteranopia cannot separate step ${i} from step ${i - 1}`);
  }
});

test('palette: the scale reads as more signal where there is more signal', () => {
  const steps = COLOURS.levels.map(hexToRgb);
  // Lightness is the axis that survives colour blindness, so it has to carry the order on
  // its own: strongest first in config means brightest first.
  for (let i = 1; i < steps.length; i += 1) {
    const brighter = lightness(steps[i - 1]);
    const darker = lightness(steps[i]);
    assert.ok(brighter > darker + 5,
      `step ${i} is not darker than step ${i - 1} (${brighter.toFixed(0)} vs ${darker.toFixed(0)} L*)`);
  }
  // The hue story the user asked for, in the axis that means it: LCh hue angle, where red
  // sits near 0 deg and yellow near 100. The scale must also rotate one way - a zig-zag
  // would put two steps on the same side of a neighbour and lose the order for anybody
  // reading hue at all.
  const hues = steps.map(hueAngle);
  assert.ok(hues[0] > 85 && hues[0] < 115,
    `the strongest step is not yellow (${rgbToHex(steps[0])}, hue ${hues[0].toFixed(1)} deg)`);
  assert.ok(hues[hues.length - 1] < 45,
    `the weakest step is not red (${rgbToHex(steps[steps.length - 1])}, hue ${hues[hues.length - 1].toFixed(1)} deg)`);
  const weak = steps[steps.length - 1];
  assert.ok(chroma(weak) > 40 && lightness(weak) < 45,
    `the weakest step is a pale wash rather than a deep red (C ${chroma(weak).toFixed(0)}, L* ${lightness(weak).toFixed(0)})`);
  for (let i = 1; i < hues.length; i += 1) {
    assert.ok(hues[i] < hues[i - 1] - 5,
      `the scale zig-zags back towards yellow at step ${i} (${hues[i - 1].toFixed(1)} -> ${hues[i].toFixed(1)} deg)`);
  }
  assert.ok(distance(steps[0], weak) > 40,
    'the two ends of the scale are not a shade apart, they are different colours');
  // And it stays warm throughout: no step goes cool, or the middle of the scale starts
  // meaning "cold", which is what made the old ramp unreadable.
  for (const rgb of steps) {
    assert.ok(rgb[0] > rgb[2], `${rgbToHex(rgb)} is not a warm colour`);
  }
});

test('palette: a step survives the drape, the ground and the faint rim', () => {
  const terrain = terrainStops();
  let worstGround = Infinity;
  let worstGroundPair = '';
  let worstFaint = Infinity;
  let worstFaintPair = '';
  for (const hex of COLOURS.levels) {
    for (const ground of terrain) {
      const painted = draped(hexToRgb(hex), ground, RF.overlayOpacity);
      const againstBare = distance(painted, ground);
      if (againstBare < worstGround) {
        worstGround = againstBare;
        worstGroundPair = `${hex} over ${rgbToHex(ground)}`;
      }
      // The faint rim is now the cell's own ground, muted and shifted, under the same drape: a
      // painted cell and an asked-and-lost one differ in colour *and* alpha. Measured floor 24.9.
      const faint = draped(faintWashRgb(ground), ground, RF.overlayOpacity * RF.noLinkAlpha);
      const againstFaint = distance(painted, faint);
      if (againstFaint < worstFaint) {
        worstFaint = againstFaint;
        worstFaintPair = `${hex} over ${rgbToHex(ground)}`;
      }
    }
  }
  assert.ok(worstGround >= 20, `a step is invisible on bare ground: ${worstGround.toFixed(1)} dE000, ${worstGroundPair}`);
  assert.ok(worstFaint >= 20, `a step could be mistaken for the faint rim: ${worstFaint.toFixed(1)} dE000, ${worstFaintPair}`);
});

test('palette: the zone view keeps colours that belong to no step', () => {
  const zone = [COLOURS.fresnelObstructed, COLOURS.fresnelPartial, COLOURS.fresnelClear];
  for (const hex of zone.concat([COLOURS.fresnelVolume])) {
    assert.ok(!COLOURS.levels.includes(hex), `${hex} is used by both views`);
  }
  // The two views are switched, so a colour that means "clear zone" cannot also mean
  // "comfortable link" - not in the same eye and not in any of the four simulated ones.
  // Measured floor: 15.7 dE000, the yellow step against mint in normal vision.
  let worst = Infinity;
  let worstPair = '';
  for (const step of COLOURS.levels) {
    for (const hex of zone) {
      const gap = worstDistance(hexToRgb(step), hexToRgb(hex));
      if (gap < worst) {
        worst = gap;
        worstPair = `${step} vs ${hex}`;
      }
    }
  }
  assert.ok(worst >= 12, `the two views converge: ${worst.toFixed(1)} dE000, ${worstPair}`);
  // The zone ramp's own neighbours, since it is a three-state scale a reader also orders.
  for (let i = 1; i < zone.length; i += 1) {
    const gap = worstDistance(hexToRgb(zone[i]), hexToRgb(zone[i - 1]));
    assert.ok(gap >= DISTINCT, `zone states ${i - 1} and ${i} are ${gap.toFixed(1)} dE000 apart`);
  }
});

test('palette: the legend paints the colours the map paints, and counts every point', () => {
  const coverage = coverageFixture();
  const items = coverageLegendItems(coverage);
  assert.equal(items.length, COLOURS.levels.length + 2, 'one row per step, then lost and never-asked');

  items.slice(0, COLOURS.levels.length).forEach((item, band) => {
    assert.equal(item.colour, COLOURS.levels[band], `row ${band} shows the step's own colour`);
    assert.equal(rgbToHex(coverageRgb(band)), COLOURS.levels[band],
      `row ${band}'s colour is what the drape paints for that band`);
    assert.equal(item.alpha, 1, 'a working link is painted solid');
    assert.ok(item.label.startsWith(`${RF.levelNames[band]}:`), `row ${band} names its step`);
    assert.ok(item.label.includes((coverage.sensitivityDbm + RF.levelMarginsDb[band]).toFixed(0)),
      `row ${band} states the dBm that enters it`);
  });

  const faint = items[COLOURS.levels.length];
  assert.equal(faint.alpha, RF.noLinkAlpha, 'asked and lost stays faint');
  assert.equal(faint.colour, FAINT_CHIP_COLOUR, 'the rim chip is the wash rule on a representative ground');
  const never = items[items.length - 1];
  assert.equal(never.alpha, 0, 'never asked stays unpainted');
  assert.equal(never.count, coverage.stats.budgetExcludedCells);

  // Recount the steps out of the raw arrays: the legend must agree with the sweep, and the
  // sweep must not have quietly put every linked cell into one row.
  const buckets = COLOURS.levels.map(() => 0);
  const margins = [];
  let linked = 0;
  for (let i = 0; i < coverage.rssi.length; i += 1) {
    if (coverage.evaluated[i] !== 1 || coverage.budgetExcluded?.[i] === 1) continue;
    const margin = coverage.rssi[i] - coverage.sensitivityDbm;
    if (margin < 0) continue;
    linked += 1;
    margins.push(margin);
    const band = RF.levelMarginsDb.findIndex((min) => margin >= min);
    buckets[band < 0 ? buckets.length - 1 : band] += 1;
  }
  assert.deepEqual(items.slice(0, buckets.length).map((item) => item.count), buckets,
    'each row counts the margins that fall in it');
  assert.ok(linked > 0, 'this fixture must link something');
  assert.equal(buckets.filter((count) => count > 0).length, buckets.length,
    'every step must occur on an ordinary link');

  // The thresholds have to *divide* the map, which is the assertion the shipped 45/30/15/0
  // would have failed: it left 93-98 % of every preset's linked cells in one row. Measured
  // over the default map and all five presets, the busiest step holds 35-40 % of the linked
  // cells and the median linked cell lands in one of the two middle steps. (The loudest link
  // the panel allows is 100 % in the top step, and rightly so - 38 dB of margin everywhere on
  // the map is comfortable everywhere. This fixture is an ordinary link, and so is a user.)
  const shares = buckets.map((count) => count / linked);
  assert.ok(Math.max(...shares) <= 0.7,
    `one step holds ${(100 * Math.max(...shares)).toFixed(0)} % of the linked cells - the scale divides nothing`);
  // And both ends have to be reachable, or the legend advertises a colour the map never
  // paints. Measured here: top step 29 %, weakest step 3 cells; over the six real
  // configurations the top step runs 13-33 % and the weakest 10-21 %. Thresholds of
  // 30/15/5/0 reach the top step on 0.2 % of this fixture and are refused; 45/30/15/0 never
  // reaches it at all.
  assert.ok(shares[0] >= 0.05,
    `the strongest step holds ${(100 * shares[0]).toFixed(1)} % of the linked cells - nothing here is ever painted yellow`);
  assert.ok(buckets[buckets.length - 1] > 0,
    'the at-the-limit step never occurs, so it does not belong in the legend');
  const sorted = margins.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const medianStep = RF.levelMarginsDb.findIndex((min) => median >= min);
  assert.ok(medianStep === 1 || medianStep === 2,
    `the median linked cell (${median.toFixed(1)} dB of margin) sits in step ${medianStep}: the scale's middle is not where the ground is`);

  assert.equal(faint.count, (coverage.stats.levelCounts[coverage.margins.length] ?? 0)
    - coverage.stats.budgetExcludedCells,
  'the faint row is the measured-and-lost cells, never the ones nobody asked about');
  const total = items.reduce((sum, item) => sum + item.count, 0);
  assert.equal(total, coverage.stats.walkedCells + coverage.stats.budgetExcludedCells,
    'the legend accounts for every point the sweep can see, no more and no fewer');

  const zoneItems = fresnelZoneLegendItems(coverage.stats);
  assert.equal(zoneItems.reduce((sum, item) => sum + item.count, 0),
    coverage.stats.walkedCells + coverage.stats.budgetExcludedCells,
  'the zone legend counts the same ground, with its own three states');
  for (const zoneItem of zoneItems) {
    assert.ok(!COLOURS.levels.includes(zoneItem.colour), `zone row "${zoneItem.label}" wears a signal colour`);
  }
});
