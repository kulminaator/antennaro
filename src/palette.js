/**
 * Colour helpers shared by the WebGL overlays and the DOM legend.
 *
 * Layer: L1 (pure domain). No DOM, no three.js: colours are returned as
 * [r, g, b] floats in 0..1 (what three.js vertex colours want) plus hex strings
 * for CSS. Centralising them keeps the 3D view and the legend in agreement.
 */

import { COLOURS } from './config.js';
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

/** CSS-ready legend entries for the coverage ramp. */
export function coverageLegendItems(coverage) {
  const items = coverage.margins.map((margin, band) => ({
    band,
    colour: COLOURS.levels[band],
    label: `>= ${(coverage.sensitivityDbm + margin).toFixed(0)} dBm`,
    count: coverage.stats.levelCounts[band] ?? 0,
  }));
  items.push({
    band: coverage.margins.length,
    colour: COLOURS.noLink,
    label: `< ${coverage.sensitivityDbm.toFixed(0)} dBm (no link)`,
    count: coverage.stats.levelCounts[coverage.margins.length] ?? 0,
  });
  return items;
}
