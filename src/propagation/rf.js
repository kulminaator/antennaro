/**
 * Radio fundamentals: wavelength, free-space loss, link budget.
 *
 * Layer: L1 (pure domain). Levels are dBm / dBi / dB, distances metres,
 * frequencies hertz. Formulas are the textbook free-space ones; no atmospheric
 * absorption, vegetation or building penetration is modelled (yet).
 */

import { RF } from '../config.js';

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

/** Map an RSSI to a ramp index: 0 = best ... levels = weaker-than-all-bands. */
export function levelIndexFor(rssiDbm, sensitivityDbm, margins = levelMarginsDb()) {
  for (let i = 0; i < margins.length; i += 1) {
    if (rssiDbm >= sensitivityDbm + margins[i]) return i;
  }
  return margins.length;
}
