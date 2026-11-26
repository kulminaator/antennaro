/**
 * Radio fundamentals: wavelength, free-space loss, link budget.
 *
 * Layer: L1 (pure domain). Levels are dBm / dBi / dB, distances metres,
 * frequencies hertz. Formulas are the textbook free-space ones; no atmospheric
 * absorption, vegetation or building penetration is modelled (yet).
 */

import { RF } from '../config.js';
import { clamp } from '../math/scalar.js';

/** Re-exported for convenience; the number itself lives in src/config.js. */
export const SPEED_OF_LIGHT_MPS = RF.speedOfLightMps;

/** Resolve a frequency selection ("868" | 868 | 868e6) to hertz. */
export function resolveFrequencyHz(value) {
  if (typeof value === 'string' && RF.frequenciesHz[value]) return RF.frequenciesHz[value];
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return RF.frequenciesHz[RF.defaultFrequencyKey];
  // Accept MHz-ish numbers (e.g. 868) as well as hertz.
  return n < 1e6 ? n * 1e6 : n;
}

export function wavelengthM(freqHz) {
  const f = resolveFrequencyHz(freqHz);
  return SPEED_OF_LIGHT_MPS / f;
}

export function frequencyLabel(freqHz) {
  const mhz = resolveFrequencyHz(freqHz) / 1e6;
  return `${Number.isInteger(mhz) ? mhz.toFixed(0) : mhz.toFixed(1)} MHz`;
}

/**
 * Free-space path loss in dB: 20*log10(4*pi*d/lambda).
 * Returns 0 dB at zero distance so the caller's arithmetic never hits -Infinity.
 */
export function freeSpaceLossDb(distanceM, freqHz) {
  if (!(distanceM > 0)) return 0;
  const lambda = wavelengthM(freqHz);
  return 20 * Math.log10((4 * Math.PI * distanceM) / lambda);
}

/** Isotropic radiated power towards one direction, dBm. */
export function eirpDbm(txPowerDbm, gainDbi, feederLossDb = 0) {
  return txPowerDbm - feederLossDb + gainDbi;
}

/**
 * Received power in dBm for one transmitter/receiver pair.
 * @param {{txPowerDbm:number, gainDbi:number, feederLossDb?:number, distanceM:number,
 *   freqHz:number, obstructionLossDb?:number, clutterLossDb?:number}} opts
 */
export function receivedDbm(opts) {
  const {
    txPowerDbm, gainDbi, feederLossDb = 0, distanceM, freqHz,
    obstructionLossDb = 0, clutterLossDb = 0,
  } = opts;
  const path = freeSpaceLossDb(distanceM, freqHz);
  return txPowerDbm - feederLossDb + gainDbi - path - obstructionLossDb - clutterLossDb;
}

/** Headroom over the receiver sensitivity, dB. Negative means no link. */
export function linkMarginDb(rxDbm, sensitivityDbm) {
  return rxDbm - sensitivityDbm;
}

/** Radius of the first Fresnel zone at the point split into d1 + d2, metres. */
export function fresnelRadiusM(d1, d2, freqHz) {
  const lambda = wavelengthM(freqHz);
  if (d1 <= 0 || d2 <= 0) return 0;
  return Math.sqrt((lambda * d1 * d2) / (d1 + d2));
}

/**
 * How much the earth gets in the way, in metres.
 *
 * A straight ray between two points `d1 + d2` apart passes over ground that curves away
 * and back; measured against the straight line, the *ground* bulges towards the ray by
 *
 *     b = d1 * d2 / (2 * k * R)
 *
 * with R the earth's radius and `k` the effective-radius factor that folds standard
 * atmospheric refraction into geometry (k = 1 is no refraction, k = 4/3 is the classic
 * "4/3 earth", and `RF.kFactor` is the value this app uses). It is 0 at either end,
 * largest midway, and quadratic in the path length - which is the whole story of its
 * size: 0.014 m at 1 km, 0.06 m at 2 km, 0.13 m at 3 km, 1.4 m at 10 km, 22 m at 40 km.
 * This map is 5.2 km across, so a mast at the centre talking to a corner (3.68 km) curves
 * over 0.19 m of world, and the longest path the map contains - corner to corner, 7.35 km
 * - over 0.75 m. Neither is what ends a link over flat ground here; both are more than
 * enough to decide which side of a ridge brow a cell sits on, which is what curvature is
 * actually for at this scale. The ray is a chord, and 0.1 m at the brow is the difference
 * between a shadow and no shadow.
 *
 * `los.js` adds this to the ray height (equivalently: lowers the ground). Setting
 * `kFactor` to 0 or less switches it off; that is not "the earth is flat" so much as
 * "ignore the earth", and `radioHorizonM` reports `Infinity` for it.
 */
export function earthBulgeM(d1M, d2M, kFactor = RF.kFactor, earthRadiusM = RF.earthRadiusM) {
  if (!(d1M > 0) || !(d2M > 0) || !(kFactor > 0) || !(earthRadiusM > 0)) return 0;
  return (d1M * d2M) / (2 * kFactor * earthRadiusM);
}

/**
 * The radio horizon between two antennas at heights `h1M` and `h2M` above flat ground,
 * in metres: how far apart they can be before the round earth puts ground between them
 * with nothing else in the way. Each end sees `sqrt(2 k R h)`; the link closes when the
 * two horizons meet.
 *
 * The textbook form is `d_km = 4.12 * (sqrt(h1_m) + sqrt(h2_m))` for k = 4/3. With this
 * app's `RF.kFactor` the constant is a few per cent larger, which is the only honest way
 * to put it: the number is a *model of refraction*, not a survey of the hill in front of
 * you. A mast 10 m up talking to a terminal 2 m up sees about 13 km - five times the map.
 * So curvature is never what kills a link over *flat* ground here; it is what makes a
 * distant ridge hide what is behind it, and that is worth a line in the read-out.
 */
export function radioHorizonM(h1M, h2M, kFactor = RF.kFactor, earthRadiusM = RF.earthRadiusM) {
  if (!(kFactor > 0) || !(earthRadiusM > 0)) return Infinity; // a flat earth has no horizon
  const reach = (h) => (h > 0 ? Math.sqrt(2 * kFactor * earthRadiusM * h) : 0);
  return reach(h1M) + reach(h2M);
}

/** Distance (m) at which a transmitter of EIRP reaches `floorDbm` in free space. */
export function freeSpaceRangeM(txPowerDbm, gainDbi, floorDbm, freqHz, feederLossDb = 0) {
  const lambda = wavelengthM(freqHz);
  const allowed = txPowerDbm - feederLossDb + gainDbi - floorDbm;
  return (lambda / (4 * Math.PI)) * Math.pow(10, allowed / 20);
}

/**
 * One-line summary for the HUD.
 * @returns {{wavelengthM:number, eirpDbm:number, freeSpaceRangeM:number, fsplAt100mDb:number}}
 */
export function rfSummary({ txPowerDbm, peakGainDbi, feederLossDb, rxSensitivityDbm, freqHz }) {
  return {
    wavelengthM: wavelengthM(freqHz),
    eirpDbm: eirpDbm(txPowerDbm, peakGainDbi, feederLossDb),
    freeSpaceRangeM: freeSpaceRangeM(txPowerDbm, peakGainDbi, rxSensitivityDbm, freqHz, feederLossDb),
    fsplAt100mDb: freeSpaceLossDb(100, freqHz),
  };
}

/**
 * Decibel band margins used for the coverage ramp, derived from the receiver
 * sensitivity so the legend always matches the stated link budget.
 * @returns {number[]} descending margins in dB, e.g. [45, 30, 15, 0]
 */
export function levelMarginsDb() {
  return RF.levelMarginsDb.map((v) => Number(v));
}

/** Map an RSSI to a signal-step index: 0 = most margin ... `levels` = below every step. */
export function levelIndexFor(rssiDbm, sensitivityDbm, margins = levelMarginsDb()) {
  for (let i = 0; i < margins.length; i += 1) {
    if (rssiDbm >= sensitivityDbm + margins[i]) return i;
  }
  return margins.length;
}

const SAMPLES_PER_CELL = 1;
const MIN_PATH_SAMPLES = 12;

/**
 * How many samples a ray walk takes over a path this far, measured along the ground.
 *
 * The count is derived rather than typed because the thing a ray walk has to resolve is the
 * terrain mesh. One sample per terrain cell is where that mesh saturates: measured against
 * crests one to three cells wide slid through the phase of the sample grid, one sample per
 * cell reads within 1.9 dB of the same path walked dense on the longest line the map can
 * hold, half a sample per cell reads the same 1.9 dB, and the old 96-sample cap - four to
 * five cells apart out there - read 6.5 dB short. `RF.profileMaxSamples` carries the cost of
 * that rule; it is a ceiling on nonsense path lengths, not a limit this map reaches.
 *
 * One function exists so that the coverage sweep, `tracePath`, `fresnelStatus` and
 * `window.__sim.rayTo` all walk the same ray. When `rayTo` used the plain cap instead, it
 * reported 8.77 dB for a cell the picture showed as 8.46 dB - three tenths of a decibel of
 * argument between the map and the tool used to check it.
 */
export function pathSamples(horizontalM, cellSizeM, maxSamples = RF.profileMaxSamples) {
  if (!(cellSizeM > 0) || !(horizontalM > 0)) return MIN_PATH_SAMPLES;
  return clamp(Math.round(horizontalM / cellSizeM) * SAMPLES_PER_CELL, MIN_PATH_SAMPLES, maxSamples);
}
