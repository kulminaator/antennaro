/**
 * Colour helpers shared by the WebGL overlays and the DOM legend.
 *
 * Layer: L1 (pure domain). No DOM, no three.js: colours are returned as
 * [r, g, b] floats in 0..1 (what three.js vertex colours want) plus hex strings
 * for CSS. Centralising them keeps the 3D view and the legend in agreement.
 */

import { COLOURS, FRESNEL, RF } from './config.js';
import { clamp, clamp01, lerp } from './math/scalar.js';

/** '#rrggbb' -> [r, g, b] floats. */
export function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const value = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export function rgbToHex(rgb) {
  const to255 = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
  return `#${to255(rgb[0])}${to255(rgb[1])}${to255(rgb[2])}`;
}

export function mixRgb(a, b, t) {
  const k = clamp01(t);
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}

// sRGB <-> CIE Lab (D65). The white point, the matrices and the two transfer functions are
// identities of the colour spaces, not knobs, so they live here next to the maths that uses them
// rather than in `config.js`.
const D65 = Object.freeze([0.95047, 1, 1.08883]);
const LINEARISE = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const GAMMA = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToLab(rgb) {
  const [r, g, b] = rgb.map(LINEARISE);
  const [fx, fy, fz] = [
    r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    r * 0.2126729 + g * 0.7151522 + b * 0.0721750,
    r * 0.0193339 + g * 0.1191920 + b * 0.9503041,
  ].map((v, i) => v / D65[i]).map((v) => (v > 0.008856451679 ? Math.cbrt(v) : (903.2962962 * v + 16) / 116));
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToRgb([l, a, b]) {
  const fy = (l + 16) / 116;
  const f = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const xyz = [f(fy + a / 500) * D65[0], f(fy), f(fy - b / 200) * D65[2]];
  return [
    xyz[0] * 3.2406 + xyz[1] * -1.5372 + xyz[2] * -0.4986,
    xyz[0] * -0.9689 + xyz[1] * 1.8758 + xyz[2] * 0.0415,
    xyz[0] * 0.0557 + xyz[1] * -0.204 + xyz[2] * 1.057,
  ].map((v) => clamp01(GAMMA(v)));
}

/** Colour ramp stops for terrain elevation, from low ground to rock. */
const TERRAIN_RAMP = Object.freeze([
  Object.freeze([0.13, 0.24, 0.20]), // shadowed low ground
  Object.freeze([0.24, 0.36, 0.20]), // pasture
  Object.freeze([0.45, 0.46, 0.26]), // dry field
  Object.freeze([0.42, 0.36, 0.30]), // scree
  Object.freeze([0.72, 0.74, 0.76]), // rock / snow
]);

/** Elevation colour, normalised by the field's own min/max so any seed looks right. */
export function terrainRgb(height, min, max, slopeDeg = 0) {
  const t = clamp01((height - min) / Math.max(1e-6, max - min));
  const pos = t * (TERRAIN_RAMP.length - 1);
  const i = Math.min(TERRAIN_RAMP.length - 2, Math.floor(pos));
  const rgb = mixRgb(TERRAIN_RAMP[i], TERRAIN_RAMP[i + 1], pos - i);
  const shade = 1 - clamp01(slopeDeg / 70) * 0.28; // steep faces read darker
  return [rgb[0] * shade, rgb[1] * shade, rgb[2] * shade];
}

/**
 * Signal-step colour. A step is a range of margin over the receiver sensitivity
 * (`RF.levelMarginsDb`, strongest first), not a continuous ramp: four unmistakable
 * colours beat a smooth gradient that a red-green colour-blind eye reads as one wash.
 * There is no colour here for "below sensitivity": an out-of-coverage cell is painted
 * `faintWashRgb` over its own ground, which is not a colour a table can hold - so a
 * caller that asks for a band outside the steps has mixed the two up, and says so.
 */
export function coverageRgb(band) {
  if (band < 0 || band >= COLOURS.levels.length) {
    throw new RangeError(`no signal step ${band}: an out-of-coverage cell is faintWashRgb(ground), not a level`);
  }
  return hexToRgb(COLOURS.levels[band]);
}

/** L* the faint wash pushes away from: below it the ground is lifted, above it pressed down.
 * Exported because the rule's discontinuity is documented by tests, which need the number. */
export const FAINT_PIVOT_L = 55;

/**
 * Colour of a cell the sweep asked and the terrain defeated, keyed to the ground under it.
 *
 * A faint rim painted with one fixed colour is invisible wherever the terrain happens to match
 * that colour: the shipped `COLOURS.noLink` at the old `RF.noLinkAlpha` measured 1.4 CIEDE2000
 * from the dark low ground it replaced, which is exactly where the rim has work to do. No fixed
 * colour fixes this, because over a ramp of backdrops every colour has a backdrop it blends
 * into. So the wash moves the *ground itself* - `RF.faintLightnessShift` L* away from
 * `FAINT_PIVOT_L`, dark ground up and bright ground down, chroma scaled to
 * `RF.faintChromaKeep` - and there is no ground on the ramp it can disappear into. Measured
 * floors (`tests/unit/palette.test.js`), worst of four vision models over the whole terrain ramp
 * including shade: 10.0 from the bare ground, 11.2 from any painted cell. And because the rule
 * shifts rather than replaces lightness, two neighbouring faint cells keep their difference -
 * the hill that blocked the link is still visible under the rim.
 */
export function faintWashRgb(ground, out = null) {
  const [l, a, b] = rgbToLab(ground);
  const shifted = l < FAINT_PIVOT_L ? l + RF.faintLightnessShift : l - RF.faintLightnessShift;
  const rgb = labToRgb([shifted, a * RF.faintChromaKeep, b * RF.faintChromaKeep]);
  if (!out) return rgb;
  out[0] = rgb[0]; out[1] = rgb[1]; out[2] = rgb[2];
  return out;
}

/**
 * The legend chip for an out-of-coverage cell: `faintWashRgb` applied to the middle of the
 * elevation ramp. The rule has no single colour to name - it moves each cell's own ground - so
 * the chip is the same rule on a representative ground, and the legend's own opacity carries
 * `RF.noLinkAlpha`, exactly as the drape's does.
 */
export const FAINT_CHIP_COLOUR = rgbToHex(faintWashRgb(terrainRgb(0.5, 0, 1)));

/**
 * A cell that meets the link budget but has the first Fresnel zone cut reads as
 * this, so "the budget says yes, the zone says no" is visible on the map.
 */export function fresnelObstructedRgb() {
  return hexToRgb(COLOURS.fresnelObstructed);
}

/** Colour of the semi-transparent Fresnel-zone volume. */
export function fresnelVolumeRgb() {
  return hexToRgb(COLOURS.fresnelVolume);
}

/** ...and the same as a CSS hex string, for the material. */
export function fresnelVolumeHex() {
  return COLOURS.fresnelVolume;
}

const ZONE_CUT = hexToRgb(COLOURS.fresnelObstructed);
const ZONE_PARTIAL = hexToRgb(COLOURS.fresnelPartial);
const ZONE_CLEAR = hexToRgb(COLOURS.fresnelClear);

/**
 * Colour for the first-Fresnel-zone view, from a clearance ratio in zone radii.
 *
 * The scale runs from "ground above the ray" (the zone is fully cut) to
 * `FRESNEL.rampMaxRatio` radii of clearance, with the `RF.fresnelClearFraction` criterion at
 * the violet/mint junction. Ramped rather than binary on purpose: on the default map only
 * 1080 of 30624 cells meet the criterion (38 % of the paths the ground was asked about), so
 * painting the flag alone would wash the drape in one hue.
 * It borrows nothing from the signal scale - not a hue, not a warmth - because the two views
 * are switched and a shared colour would make a pixel mean two things; the palette test
 * refuses any signal step within 12 CIEDE2000 of any zone state, in every eye it simulates.
 *
 * @param {number} clearanceRatio worst clearance along the path, in first-zone radii
 * @param {number[]} [out] written to, when given (the drape loops over 25k cells)
 * @returns {number[]} rgb triple, 0..1
 */
export function fresnelZoneRgb(clearanceRatio, out = null) {
  const fraction = RF.fresnelClearFraction;
  const ratio = Number.isFinite(clearanceRatio) ? clearanceRatio : FRESNEL.rampMaxRatio;
  const rgb = ratio <= 0
    ? ZONE_CUT
    : ratio < fraction
      ? mixRgb(ZONE_CUT, ZONE_PARTIAL, ratio / fraction)
      : mixRgb(ZONE_PARTIAL, ZONE_CLEAR, clamp((ratio - fraction) / Math.max(0.001, FRESNEL.rampMaxRatio - fraction), 0, 1));
  if (!out) return rgb.slice();
  out[0] = rgb[0]; out[1] = rgb[1]; out[2] = rgb[2];
  return out;
}

/**
 * Legend rows for the zone view. The assumptions are part of the label: a clearance
 * figure without them is not a claim anyone can check, and the receiver height is a
 * slider, so the number shown is the one the counts were computed with.
 */
export function fresnelZoneLegendItems(stats = {}) {
  const rxHeightM = Number.isFinite(stats.fresnelRxHeightM)
    ? stats.fresnelRxHeightM
    : RF.fresnelRxHeightM;
  const fraction = Number.isFinite(stats.fresnelClearFraction) ? stats.fresnelClearFraction : RF.fresnelClearFraction;
  return [
    {
      band: 0,
      colour: rgbToHex(ZONE_CUT),
      label: 'zone cut: ground reaches the ray',
      count: stats.fresnelCutCells ?? 0,
    },
    {
      band: 1,
      colour: rgbToHex(ZONE_PARTIAL),
      label: `partly cut: under ${Math.round(fraction * 100)}% of the first zone clear`,
      count: stats.fresnelPartialCells ?? 0,
    },
    {
      band: 2,
      colour: rgbToHex(ZONE_CLEAR),
      label: `clear: judged to a terminal ${rxHeightM} m above the ground`,
      count: stats.fresnelClearCells ?? 0,
    },
    // The clearance rows above count every path the ground was asked about - links that
    // work and links the ground stopped alike - so the two absences the drape also shows
    // have to be named here too, or the faint rim and the bare far ground would be
    // pixels with no row. The faint rim is described in the card's note, because its
    // cells are already counted once by clearance and must not be counted twice.
    ...(Number.isFinite(stats.budgetExcludedCells) && stats.budgetExcludedCells > 0
      ? [{
        band: 3,
        colour: FAINT_CHIP_COLOUR,
        label: 'out of budget - not measured, not painted',
        count: stats.budgetExcludedCells,
        alpha: 0,
      }]
      : []),
  ];
}

/**
 * Radiation-pattern colour: hot at the peak lobe, cold in the nulls.
 * @param {number} db absolute gain in dBi
 * @param {number} peakDbi peak gain of the design
 * @param {number} dynamicRangeDb clip depth
 */
export function patternRgb(db, peakDbi, dynamicRangeDb = 30) {
  const t = clamp01((db - (peakDbi - Math.abs(dynamicRangeDb))) / Math.max(1e-6, dynamicRangeDb));
  const ramp = [
    [0.16, 0.28, 0.45],
    [0.16, 0.55, 0.62],
    [0.95, 0.78, 0.25],
    [0.92, 0.35, 0.22],
  ];
  const pos = t * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(pos));
  return mixRgb(ramp[i], ramp[i + 1], pos - i);
}

/**
 * CSS-ready legend entries for the four signal steps: the step's word, and the dBm that
 * enters it. The last entry describes the faint rim (measured, and the terrain said no);
 * a further entry names the area left bare because free-space loss alone lost the link,
 * which the drape does not paint at all.
 */
export function coverageLegendItems(coverage) {
  const items = coverage.margins.map((margin, band) => ({
    band,
    colour: COLOURS.levels[band],
    label: `${RF.levelNames[band] ?? `step ${band + 1}`}: >= ${(coverage.sensitivityDbm + margin).toFixed(0)} dBm`,
    count: coverage.stats.levelCounts[band] ?? 0,
    alpha: 1,
  }));
  const last = coverage.margins.length;
  const excluded = coverage.stats.budgetExcludedCells ?? 0;
  items.push({
    band: last,
    colour: FAINT_CHIP_COLOUR,
    label: `< ${coverage.sensitivityDbm.toFixed(0)} dBm (faint: terrain stops the link)`,
    // Only the painted ones: the points the pre-filter dismissed are the next row.
    count: Math.max(0, (coverage.stats.levelCounts[last] ?? 0) - excluded),
    alpha: RF.noLinkAlpha,
  });
  if (excluded > 0) {
    items.push({
      band: coverage.margins.length,
      colour: FAINT_CHIP_COLOUR,
      label: 'out of budget - not measured, not painted',
      count: excluded,
      alpha: 0,
    });
  }
  return items;
}
