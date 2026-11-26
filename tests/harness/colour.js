/**
 * Colour measurement for tests: CIELAB, CIEDE2000, dichromat simulation and the drape's
 * own alpha compositing.
 *
 * A colour assertion written in raw RGB channels asserts nothing about what an eye sees,
 * so any test that judges a colour judges it here instead. The maths is shared with
 * `palette.test.js` because a ruler duplicated per test file drifts, and a drifted ruler
 * silently passes whatever it was copied next to.
 *
 * References: CIE 15:2004 (CIELAB, D65), Sharma et al. (2005) for CIEDE2000 - whose
 * published table is checked by a test before it is allowed to judge anything - and
 * Machado, Oliveira & Fernandes (2009) severity-1.0 dichromacy matrices. The vision
 * models are not a medical claim about any particular reader; they are the reason a scale
 * that only works for one kind of eye is not shipped.
 */

const WHITE = Object.freeze([0.95047, 1, 1.08883]);

const linearise = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gammas = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB (0..1 triple) -> CIELAB (D65). */
export function labOf(rgb) {
  const [r, g, b] = rgb.map(linearise);
  const xyz = [
    r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    r * 0.2126729 + g * 0.7151522 + b * 0.0721750,
    r * 0.0193339 + g * 0.1191920 + b * 0.9503041,
  ].map((v, i) => v / WHITE[i]);
  const f = (v) => (v > 0.008856451679 ? Math.cbrt(v) : (903.2962962 * v + 16) / 116);
  const [fx, fy, fz] = xyz.map(f);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * CIEDE2000 between two **Lab** triples.
 *
 * Lab in, not sRGB - `distance`/`worstDistance`/`seenDistance` are the sRGB API. Feeding it
 * `see()` output (which is sRGB, and for `normal` is the input unchanged) returns a plausible
 * small number instead of a distance: this file's author did it twice before noticing, which is
 * why the name now says what the arguments are.
 */
export function deltaE000Lab(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = (Math.atan2(b1, a1p) * deg + 360) % 360;
  const h2p = (Math.atan2(b2, a2p) * deg + 360) % 360;
  const dL = L2 - L1;
  const dC = C2p - C1p;
  let dh = h2p - h1p;
  if (Math.abs(dh) > 180) dh += dh > 0 ? -360 : 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
  const Lb = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 360 : -360;
  hbp /= 2;
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
    + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

/** Perceptual distance between two sRGB (0..1) colours. */
export const distance = (rgb1, rgb2) => deltaE000Lab(labOf(rgb1), labOf(rgb2));

/** L* - the axis an eye reads as "more", and the only ordering colour blindness keeps. */
export const lightness = (rgb) => labOf(rgb)[0];

/** LCh hue angle in degrees: red sits near 0, yellow near 100, mint near 160, violet near 315. */
export function hueAngle(rgb) {
  const [, a, b] = labOf(rgb);
  return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
}

/** LCh chroma - how much colour there is, as opposed to grey. */
export function chroma(rgb) {
  const [, a, b] = labOf(rgb);
  return Math.hypot(a, b);
}

/**
 * Severity-1.0 dichromacy matrices (Machado et al. 2009), applied to linear RGB. `normal`
 * is the identity, so a test can loop over the keys and demand the worst case.
 */
export const VISION = Object.freeze({
  normal: null,
  protan: Object.freeze([Object.freeze([0.152286, 1.052583, -0.204868]), Object.freeze([0.114503, 0.786281, 0.099216]), Object.freeze([-0.003882, -0.048116, 1.051998])]),
  deutan: Object.freeze([Object.freeze([0.367322, 0.860646, -0.227968]), Object.freeze([0.280085, 0.672501, 0.047413]), Object.freeze([-0.011820, 0.042940, 0.968881])]),
  tritan: Object.freeze([Object.freeze([1.255528, -0.076749, -0.178779]), Object.freeze([-0.078411, 0.930809, 0.147602]), Object.freeze([0.004733, 0.691367, 0.303900])]),
});

/** What an eye of the given kind sees of an sRGB (0..1) colour, as sRGB (0..1). */
export function see(rgb, kind) {
  const matrix = VISION[kind];
  if (!matrix) return rgb;
  const [r, g, b] = rgb.map(linearise);
  return matrix.map((row) => Math.min(1, Math.max(0,
    row[0] * r + row[1] * g + row[2] * b))).map(gammas);
}

/** Distance between two sRGB colours as one kind of eye sees them. */
export const seenDistance = (rgb1, rgb2, kind) => distance(see(rgb1, kind), see(rgb2, kind));

/** Worst distance between two colours over every vision model in `VISION`. */
export function worstDistance(rgb1, rgb2) {
  return Math.min(...Object.keys(VISION).map((kind) => seenDistance(rgb1, rgb2, kind)));
}

/**
 * The drape over a backdrop, blended where the canvas blends it - in gamma space, because
 * the overlay is a translucent mesh drawn over the terrain, not a shader mixing linear
 * light. `alpha` is the coverage alpha multiplied by the drape's own opacity.
 */
export function draped(rgb, backdrop, alpha) {
  return rgb.map((c, i) => c * alpha + backdrop[i] * (1 - alpha));
}
