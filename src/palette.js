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

/** Coverage band colour; band === levels.length means "below sensitivity". */
export function coverageRgb(band) {
  if (band >= COLOURS.levels.length) return hexToRgb(COLOURS.noLink);
  return hexToRgb(COLOURS.levels[Math.max(0, band)]);
}

/**
 * A cell that meets the link budget but has the first Fresnel zone cut reads as
 * this, so "the budget says yes, the zone says no" is visible on the map.
 */
export function fresnelObstructedRgb() {
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
 * `FRESNEL.rampMaxRatio` radii of clearance, with the `RF.fresnelClearFraction`
 * criterion at the amber/green junction. Ramped rather than binary on purpose: on a
 * real map only about one cell in ten meets the criterion, so painting the flag
 * would wash the drape in one hue. The warm-to-cool language matches the signal ramp
 * so both overlays read the same way; only the "cut" hue is new, and it never
 * appears among the signal bands.
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
  ];
}

/**
 * The three stops of the range gradient, weakest last. Read in order: strong link,
 * margin shrinking, link only just made.
 */
const GRADIENT_STRONG = hexToRgb(COLOURS.gradientStops.strong);
const GRADIENT_MID = hexToRgb(COLOURS.gradientStops.mid);
const GRADIENT_WEAK = hexToRgb(COLOURS.gradientStops.weak);

/**
 * Colour for the continuous range-gradient view, from a link margin in dB.
 *
 * Margin is the only honest thing to ramp a coverage map against: the absolute dBm moves
 * with the receiver's sensitivity slider, and a map keyed to it would change colour
 * because you changed a spec sheet. Margin says how much room the link has left, which is
 * what "strong" and "weak" mean to a person choosing a site - yellow with room to spare,
 * pale yellow as it closes, pink for a link that survives by a decibel or two.
 *
 * Piecewise linear through the three stops, clamped at both ends, and `out`-writing like
 * `fresnelZoneRgb` because the drape calls this 30 000 times a rebuild.
 *
 * @param {number} marginDb RSSI minus the receiver sensitivity (negative = no link)
 * @param {number[]} [out] written to, when given
 * @returns {number[]} rgb triple, 0..1
 */
export function rangeGradientRgb(marginDb, out = null) {
  const top = Math.max(1, RF.gradientMaxMarginDb);
  const t = clamp01((Number.isFinite(marginDb) ? marginDb : 0) / top);
  // Exact at the ends: `mixRgb` interpolates, and `a + (b - a) * 1` is not always `b` in
  // floating point, which would make the legend's own swatch differ from the map's by an
  // increment nobody can see and everybody can fail a test over.
  const rgb = t >= 1 ? GRADIENT_STRONG
    : t <= 0 ? GRADIENT_WEAK
      : t >= 0.5
    ? mixRgb(GRADIENT_MID, GRADIENT_STRONG, (t - 0.5) / 0.5)
      : mixRgb(GRADIENT_WEAK, GRADIENT_MID, t / 0.5);
  if (!out) return rgb.slice();
  out[0] = rgb[0]; out[1] = rgb[1]; out[2] = rgb[2];
  return out;
}

/**
 * Legend for the gradient. The rows are still the band boundaries - the sweep counts
 * cells per band and those counts must keep adding up - but each colour is the gradient
 * sampled *at* that boundary, so the swatch is the colour a cell at the top of that band
 * actually gets painted, not a colour the ramp never produces. Below sensitivity and
 * out of budget are unchanged: they are not strengths of link, they are the absence of
 * one, and they keep their alpha contract (faint = asked and lost, none = never asked).
 */
export function rangeGradientLegendItems(coverage) {
  const rgb = [0, 0, 0];
  const items = coverage.margins.map((margin, band) => ({
    band,
    colour: rgbToHex(rangeGradientRgb(margin, rgb)),
    label: band === 0
      ? `strong: ${margin.toFixed(0)} dB or more over the receiver`
      : `>= ${margin.toFixed(0)} dB over${band === coverage.margins.length - 1 ? ' (pink: at the limit)' : ''}`,
    count: coverage.stats.levelCounts[band] ?? 0,
    alpha: 1,
  }));
  const last = coverage.margins.length;
  const excluded = coverage.stats.budgetExcludedCells ?? 0;
  items.push({
    band: last,
    colour: COLOURS.noLink,
    label: `< ${coverage.sensitivityDbm.toFixed(0)} dBm (faint: terrain stops the link)`,
    count: Math.max(0, (coverage.stats.levelCounts[last] ?? 0) - excluded),
    alpha: RF.noLinkAlpha,
  });
  if (excluded > 0) {
    items.push({
      band: last,
      colour: COLOURS.noLink,
      label: 'out of budget - not measured, not painted',
      count: excluded,
      alpha: 0,
    });
  }
  return items;
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
 * CSS-ready legend entries for the coverage ramp. The last entry describes the faint
 * rim (measured, and the terrain said no); a further entry names the area left bare
 * because free-space loss alone lost the link, which the drape does not paint at all.
 */
export function coverageLegendItems(coverage) {
  const items = coverage.margins.map((margin, band) => ({
    band,
    colour: COLOURS.levels[band],
    label: `>= ${(coverage.sensitivityDbm + margin).toFixed(0)} dBm`,
    count: coverage.stats.levelCounts[band] ?? 0,
    alpha: 1,
  }));
  const last = coverage.margins.length;
  const excluded = coverage.stats.budgetExcludedCells ?? 0;
  items.push({
    band: last,
    colour: COLOURS.noLink,
    label: `< ${coverage.sensitivityDbm.toFixed(0)} dBm (faint: terrain stops the link)`,
    // Only the painted ones: the points the pre-filter dismissed are the next row.
    count: Math.max(0, (coverage.stats.levelCounts[last] ?? 0) - excluded),
    alpha: RF.noLinkAlpha,
  });
  if (excluded > 0) {
    items.push({
      band: last,
      colour: COLOURS.noLink,
      label: 'out of budget - not measured, not painted',
      count: excluded,
      alpha: 0,
    });
  }
  return items;
}
