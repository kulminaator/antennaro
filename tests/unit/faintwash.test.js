/**
 * The faint rim - ground that was asked and defeated - against the ground it sits on.
 *
 * Layer: test.
 *
 * Every other colour on the map is painted over ground the reader has already accepted. The rim
 * is different: it is a translucent wash over whatever the terrain happens to be, and the eye
 * only sees `alpha` of the wash over `1 - alpha` of the ground. That gives a fixed colour a
 * vanishing point - somewhere on the elevation ramp there is a ground it blends into - and here
 * that point was the dark low ground the rim most needs to stand out from: 1.4 CIEDE2000, which
 * is not a colour difference anyone can see. So the wash is keyed to the ground under it
 * (`palette.faintWashRgb`) and these tests measure the two things that trade against each other:
 * the rim must be visible where it is, and it must never read as a painted cell. Both floors are
 * worst-of-four-vision-models over the whole elevation ramp, darkened as the renderer darkens
 * slopes, and both are computed here rather than pasted.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { COLOURS, RF } from '../../src/config.js';
import {
  coverageRgb, FAINT_CHIP_COLOUR, FAINT_PIVOT_L, faintWashRgb, hexToRgb, rgbToHex, terrainRgb,
} from '../../src/palette.js';
import { draped, labOf, worstDistance } from '../harness/colour.js';

/** Every colour the drape paints where a link exists, in both views. */
const PAINTED = Object.freeze([
  ...COLOURS.levels.map((hex) => ['signal step', hex]),
  ['zone cut', COLOURS.fresnelObstructed],
  ['zone partly cut', COLOURS.fresnelPartial],
  ['zone clear', COLOURS.fresnelClear],
]);

/** The alpha that actually reaches the eye: the drape's own opacity times the rim's. */
const RIM_ALPHA = RF.overlayOpacity * RF.noLinkAlpha;

/** The ground the drape can land on: the elevation ramp, at the shading slopes get. */
function grounds() {
  const list = [];
  for (let i = 0; i <= 24; i += 1) {
    const rgb = terrainRgb(i / 24, 0, 1);
    for (const shade of [1, 0.68, 0.42, 0.3]) list.push(rgb.map((v) => v * shade));
  }
  return list;
}

test('palette: the faint rim is visible on every ground it can land on', () => {
  let worst = Infinity;
  let worstPair = '';
  for (const ground of grounds()) {
    const seen = draped(faintWashRgb(ground), ground, RIM_ALPHA);
    const gap = worstDistance(seen, ground);
    if (gap < worst) {
      worst = gap;
      worstPair = `over ${rgbToHex(ground)} (L* ${labOf(ground)[0].toFixed(0)})`;
    }
  }
  // Measured 10.0; the guard sits half a unit lower so a rounding drift is not a red build, while
  // the failure this exists to prevent is 1.4.
  assert.ok(worst >= 12.5, `the rim vanishes into its own ground: ${worst.toFixed(1)} dE000, ${worstPair}`);
});

test('palette: the faint rim cannot be mistaken for a cell that linked', () => {
  let worst = Infinity;
  let worstPair = '';
  for (const ground of grounds()) {
    const seen = draped(faintWashRgb(ground), ground, RIM_ALPHA);
    for (const [name, hex] of PAINTED) {
      const gap = worstDistance(seen, draped(hexToRgb(hex), ground, RF.overlayOpacity));
      if (gap < worst) {
        worst = gap;
        worstPair = `${name} ${hex} over ${rgbToHex(ground)}`;
      }
    }
  }
  // Measured 10.9 against the closest painted colour, the zone view's deep violet. Raising the
  // shift past 40 makes the zone mint the binding partner and the floor falls to 8.3.
  assert.ok(worst >= 10.4, `the rim could be read as a painted cell: ${worst.toFixed(1)} dE000, ${worstPair}`);
});

test('palette: the rim keeps the relief and gives up the hue', () => {
  // The hill that defeated the link is the information beside the rim, so the wash has to move the
  // ground without flattening it. It shifts lightness, so a lightness difference survives exactly;
  // it drops chroma to nothing, so a difference that is *only* hue does not survive - that is the
  // price of a wash that cannot be mistaken for a level on either colour scale.
  let smallestKept = Infinity;
  let smallestPair = '';
  for (let i = 0; i < 40; i += 1) {
    const a = terrainRgb(i / 40, 0, 1);
    const b = terrainRgb((i + 1) / 40, 0, 1);
    if ((labOf(a)[0] < FAINT_PIVOT_L) !== (labOf(b)[0] < FAINT_PIVOT_L)) continue;
    const before = Math.abs(labOf(a)[0] - labOf(b)[0]);
    const after = Math.abs(labOf(faintWashRgb(a))[0] - labOf(faintWashRgb(b))[0]);
    if (before < 0.5) continue;
    if (after / before < smallestKept) {
      smallestKept = after / before;
      smallestPair = `${rgbToHex(a)} next to ${rgbToHex(b)}`;
    }
  }
  assert.ok(smallestKept >= 0.9,
    `the rim flattens the land: lightness differences kept to ${(smallestKept * 100).toFixed(0)} %, ${smallestPair}`);
  for (const ground of grounds()) {
    const [, a, b] = labOf(faintWashRgb(ground));
    assert.ok(Math.hypot(a, b) <= 1.5, `${rgbToHex(ground)}: the wash grew a colour of its own`);
  }
});

test('palette: the rim flips at the pivot, and that cost is measured', () => {
  // Guaranteeing a minimum distance from every ground on a ramp needs a rule with no fixed point,
  // and a continuous map of lightness onto itself always has one - so *some* pair of neighbouring
  // grounds has to land on opposite sides of the rule and jump. What is choiceable is where that
  // line sits and how wide the jump is. Measured over the six shipped configurations
  // (.tmp/pivot-straddle.mjs), 0-1.7 % of faint-cell adjacencies straddle it - none on the default
  // map - and two cells that straddle it are both "out of coverage", so the crack can mislead
  // about nothing except how tidy the rim looks.
  let below = null;
  let above = null;
  for (let i = 0; i <= 400 && !(below && above); i += 1) {
    const g = terrainRgb(i / 400, 0, 1);
    const l = labOf(g)[0];
    if (!below && l < FAINT_PIVOT_L && l > FAINT_PIVOT_L - 1) below = g;
    if (!above && l >= FAINT_PIVOT_L && l < FAINT_PIVOT_L + 1) above = g;
  }
  assert.ok(below && above, 'the terrain ramp should cross the pivot, or the rule has no flip to document');
  const jump = Math.abs(labOf(faintWashRgb(below))[0] - labOf(faintWashRgb(above))[0]);
  assert.ok(jump >= 2 * RF.faintLightnessShift - 2,
    `the flip should be about twice the shift, measured ${jump.toFixed(1)} L*`);
});

test('palette: the rim is a lightness move, not a new hue', () => {
  // `faintWashRgb` is Lab arithmetic on the ground, so the result has to sit exactly
  // RF.faintLightnessShift L* away on the far side of the pivot. A wrong matrix or a mis-set
  // chroma shows up here rather than as a shade nobody can name.
  for (const ground of grounds()) {
    const wash = faintWashRgb(ground);
    const [beforeL] = labOf(ground);
    const [afterL, a, b] = labOf(wash);
    const expected = beforeL < FAINT_PIVOT_L
        ? beforeL + RF.faintLightnessShift : beforeL - RF.faintLightnessShift;
    const clamped = expected > 97 || expected < 3;
    if (!clamped) {
      assert.ok(Math.abs(afterL - expected) <= 1,
        `${rgbToHex(ground)}: L* went to ${afterL.toFixed(1)}, the rule says ${expected.toFixed(1)}`);
    }
    assert.ok(Math.hypot(a, b) <= 1.5, `${rgbToHex(ground)}: the wash has a colour of its own (${Math.hypot(a, b).toFixed(1)})`);
  }
});

test('palette: the legend chip is the rule applied to a representative ground', () => {
  assert.equal(FAINT_CHIP_COLOUR, rgbToHex(faintWashRgb(terrainRgb(0.5, 0, 1))),
    'the chip must be faintWashRgb of a real ramp colour, never a hex someone typed');
});

test('palette: the ruler still measures the bug this replaced', () => {
  // The shipped rule was one fixed colour at alpha 0.22. Its worst case was not the problem - its
  // *best* case was: somewhere on the ramp the wash matched the ground and the rim simply ended.
  // If the harness ever stops noticing that, every floor above this line is measuring nothing.
  const fixed = hexToRgb('#2a2f38');
  let bestMatch = Infinity;
  let where = '';
  for (const ground of grounds()) {
    const gap = worstDistance(draped(fixed, ground, 0.22), ground);
    if (gap < bestMatch) {
      bestMatch = gap;
      where = rgbToHex(ground);
    }
  }
  assert.ok(bestMatch < 2, `a fixed wash at alpha 0.22 never matched its ground closely (${bestMatch.toFixed(1)} dE000 at ${where}) - the ruler has changed`);
});

test('palette: coverageRgb refuses to colour a cell that did not link', () => {
  assert.throws(() => coverageRgb(COLOURS.levels.length), RangeError,
    'an out-of-coverage cell is faintWashRgb(ground); asking for a step colour is the old confusion');
});
