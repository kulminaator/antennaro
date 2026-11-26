/**
 * Antenna catalogue: the five supported designs as declarative data.
 *
 * Layer: L1 (pure domain). This module is the single source of truth for what
 * an antenna design *is* - its parameters, its gain, its pattern shape and its
 * physical description. Adding a design means adding one entry here plus one
 * geometry builder in geometryspec.js; nothing in the UI or renderer hard-codes
 * an antenna id (enforced by tests/unit/catalogue.test.js).
 *
 * Gains are peak free-space gains in dBi; beamwidths are full width at -3 dB.
 *
 * A directional design declares the beam it draws and its gain is derived from it, so the
 * lobe on screen and the decibels in the link budget are the same decision. The omni
 * designs keep an array-factor gain, because Kraus does not apply to a 360 degree plane.
 * See `beamGainDbi` below and GUIDELINES.md §7.
 */

import { ANTENNA } from '../config.js';
import { clamp } from '../math/scalar.js';
import { createCollinearArray, krausDirectivityDbi } from './pattern.js';

/** @typedef {ReturnType<typeof buildCatalogue>[number]} AntennaEntry */

function range(key, label, min, max, step, def, unit, hint) {
  return Object.freeze({ key, label, kind: 'range', min, max, step, default: def, unit, hint });
}

/**
 * What a drawn beam is worth once a real build has had its say.
 *
 * Directional designs declare `beamwidths(params)` and get their peak gain from it:
 * directivity out of the two -3 dB widths (Kraus), times the design's aperture
 * efficiency from `ANTENNA.apertureEfficiency`. That direction of causality is the whole
 * point - a loop in front of a plate does not become a beam antenna because its gain
 * formula says so, and an omni-shaped antenna with a high gain number is the bug report
 * this replaced (a 69 x 69 degree biquad was charging the link budget with 12.4 dBi, a
 * level those beamwidths cannot hold: 9.4 dBi is the ceiling).
 */
function beamGainDbi(entryId, beamwidth) {
  const efficiency = ANTENNA.apertureEfficiency[entryId] ?? ANTENNA.apertureEfficiencyDefault;
  return krausDirectivityDbi(beamwidth.azimuthDeg, beamwidth.elevationDeg)
    + 10 * Math.log10(Math.min(1, Math.max(0.01, efficiency)));
}

function buildCatalogue() {
  // -3 dB beamwidths of the three lobe designs, in degrees. These are the only place a
  // beam is declared: `pattern()` draws from them and `gainDbi()` is derived from them,
  // so the picture and the decibels cannot disagree. Measured figures behind the shapes:
  //  - a single-row Yagi keeps a wide elevation lobe (one element high), so directors
  //    narrow the azimuth plane and leave the elevation plane roughly as it was;
  //  - a biquad is broad in both planes, and more turns tighten both slightly;
  //  - a patch scales with its aperture in both planes.
  const yagiBeamwidths = (p) => Object.freeze({
    azimuthDeg: clamp(78 * Math.exp(-0.09 * p.directors) * (1.15 - 0.5 * p.spacingLambda), 8, 120),
    elevationDeg: 66,
  });
  const biquadBeamwidths = (p) => Object.freeze({
    azimuthDeg: clamp(76 - 7 * (p.turns - 1), 45, 90),
    elevationDeg: clamp(76 - 7 * (p.turns - 1), 45, 90),
  });
  const patchBeamwidths = (p) => Object.freeze({
    azimuthDeg: clamp(72 / clamp(p.sizeLambda, 0.5, 2), 40, 105),
    elevationDeg: clamp(68 / clamp(p.sizeLambda, 0.5, 2), 38, 100),
  });

  return Object.freeze([
    Object.freeze({
      id: 'omni-dipole',
      label: 'Omni half-wave dipole',
      family: 'omni',
      polarization: 'vertical',
      geometryKind: 'dipole',
      aimsInAzimuth: false,
      summary: 'Reference omni. Radiates equally in every compass direction and loses signal steeply above and below the horizon.',
      typicalUse: 'Site coverage where users are all around the mast.',
      paramSpecs: Object.freeze([]),
      gainDbi: () => 2.15,
      pattern: () => Object.freeze({
        azimuth: Object.freeze({ kind: 'omni' }),
        elevation: Object.freeze({ kind: 'dipole' }),
      }),
    }),

    Object.freeze({
      id: 'omni-collinear',
      label: 'Omni collinear',
      family: 'omni',
      polarization: 'vertical',
      geometryKind: 'collinear',
      aimsInAzimuth: false,
      summary: 'Stacked in-phase half-wave sections. Still omnidirectional, but the vertical lobe flattens so more power reaches the horizon.',
      typicalUse: 'Long-range omni on a tower; suffers in hilly terrain directly under the mast.',
      paramSpecs: Object.freeze([
        range('elements', 'Sections', 2, 8, 1, 4, '1/2-wave', 'More sections flatten the vertical lobe and add gain.'),
        range('spacingLambda', 'Spacing', 0.3, 1.0, 0.05, 0.5, 'x lambda', 'Electrical spacing between sections; > 0.7 lambda starts to split lobes.'),
      ]),
      gainDbi: (p) => 2.15 + 10 * Math.log10(Math.max(1, p.elements)) - 1.0,
      pattern: (p) => Object.freeze({
        azimuth: Object.freeze({ kind: 'omni' }),
        elevation: Object.freeze({ kind: 'collinear', array: createCollinearArray(p.elements, p.spacingLambda) }),
      }),
    }),

    Object.freeze({
      id: 'yagi',
      label: 'Yagi-Uda (reflector + directors)',
      family: 'directional',
      polarization: 'horizontal',
      geometryKind: 'yagi',
      aimsInAzimuth: true,
      summary: 'Classic beam antenna: one reflector, one driven element, N directors. High gain in one direction, deep fade behind it.',
      typicalUse: 'Point-to-point links or reaching one distant valley over a ridge.',
      paramSpecs: Object.freeze([
        range('directors', 'Directors', 2, 14, 1, 7, 'pcs', 'More directors mean more gain and a narrower beam, on a longer boom.'),
        range('spacingLambda', 'Element spacing', 0.2, 0.45, 0.01, 0.3, 'x lambda', 'Boom spacing between adjacent elements.'),
        range('beamTiltDeg', 'Electrical downtilt', 0, 15, 1, 0, 'deg', 'Steers the beam down without tipping the mast.'),
      ]),
      beamwidths: yagiBeamwidths,
      gainDbi: (p) => beamGainDbi('yagi', yagiBeamwidths(p)),
      pattern: (p) => Object.freeze({
        azimuth: Object.freeze({
          kind: 'lobe',
          beamwidthDeg: yagiBeamwidths(p).azimuthDeg,
          sidelobeDb: clamp(-16 + 0.4 * p.directors, -22, -10),
          backToFrontDb: clamp(18 + 0.8 * p.directors, 12, 30),
        }),
        elevation: Object.freeze({ kind: 'lobe', beamwidthDeg: yagiBeamwidths(p).elevationDeg, sidelobeDb: -25 }),
      }),
    }),

    Object.freeze({
      id: 'biquad-reflector',
      label: 'Biquad with plate reflector',
      family: 'directional',
      polarization: 'vertical',
      geometryKind: 'biquad',
      aimsInAzimuth: true,
      summary: 'Two-turn square loop a quarter wavelength in front of a reflector. Wide, forgiving beam and easy to build.',
      typicalUse: 'Wi-Fi / LoRa point-to-multipoint where the target area is a broad sector.',
      paramSpecs: Object.freeze([
        range('turns', 'Loop turns', 1, 3, 1, 2, 'pcs', 'More turns tighten the beam slightly and raise gain.'),
        range('reflectorSpacingLambda', 'Reflector spacing', 0.1, 0.4, 0.01, 0.25, 'x lambda', 'Distance from loop to reflector plate; sets front-to-back ratio.'),
        range('beamTiltDeg', 'Electrical downtilt', 0, 15, 1, 0, 'deg', 'Steers the beam down without tipping the mast.'),
      ]),
      beamwidths: biquadBeamwidths,
      // The plate reflector earns its keep in the front-to-back ratio, which is a pattern
      // property, not a gain bonus: a wider plate cannot buy gain a 62-76 degree beam
      // cannot hold. That term used to be `+ 8 dB per lambda of spacing`, which is how
      // this design reached 16.2 dBi.
      gainDbi: (p) => beamGainDbi('biquad-reflector', biquadBeamwidths(p)),
      pattern: (p) => Object.freeze({
        azimuth: Object.freeze({
          kind: 'lobe',
          beamwidthDeg: biquadBeamwidths(p).azimuthDeg,
          sidelobeDb: -19,
          backToFrontDb: clamp(13 + 40 * p.reflectorSpacingLambda, 10, 26),
        }),
        elevation: Object.freeze({
          kind: 'lobe',
          beamwidthDeg: biquadBeamwidths(p).elevationDeg,
          sidelobeDb: -22,
        }),
      }),
    }),

    Object.freeze({
      id: 'patch',
      label: 'Microstrip patch',
      family: 'directional',
      polarization: 'vertical',
      geometryKind: 'patch',
      aimsInAzimuth: true,
      summary: 'Flat panel antenna. Moderate gain, clean beam, low profile and stable pattern across the band.',
      typicalUse: 'Sector panels, vehicle mounts, anything that must survive weather.',
      paramSpecs: Object.freeze([
        range('sizeLambda', 'Patch size', 0.7, 1.5, 0.05, 1.0, 'x lambda', 'Larger patch, more gain, narrower beam.'),
        range('beamTiltDeg', 'Electrical downtilt', 0, 20, 1, 6, 'deg', 'Typical sector downtilt; pushes coverage closer in.'),
      ]),
      beamwidths: patchBeamwidths,
      gainDbi: (p) => beamGainDbi('patch', patchBeamwidths(p)),
      pattern: (p) => Object.freeze({
        azimuth: Object.freeze({
          kind: 'lobe',
          beamwidthDeg: patchBeamwidths(p).azimuthDeg,
          sidelobeDb: -20,
          backToFrontDb: 15,
        }),
        elevation: Object.freeze({
          kind: 'lobe',
          beamwidthDeg: patchBeamwidths(p).elevationDeg,
          sidelobeDb: -23,
        }),
      }),
    }),
  ]);
}

/**
 * Two models of gain live here, and the split is deliberate:
 *
 *  - **Omni designs** (dipole, collinear) state an array-factor gain - a half-wave dipole
 *    is 2.15 dBi, N in-phase sections of it add `10*log10(N)` less a decibel of feed and
 *    mutual-coupling loss. Kraus's single-lobe arithmetic does not apply to a 360 degree
 *    azimuth plane, so these do not use it.
 *  - **Directional designs** declare `beamwidths(params)` and derive their gain from it
 *    (see `beamGainDbi`), because for a beam antenna the beam *is* the gain.
 *
 * Do not "unify" them: a single formula that fits both is a formula that describes
 * neither.
 */

/** Immutable catalogue list, in UI order. */
export const ANTENNA_CATALOGUE = buildCatalogue();

export const ANTENNA_IDS = Object.freeze(ANTENNA_CATALOGUE.map((entry) => entry.id));

/** @returns {AntennaEntry|undefined} */
export function getAntennaEntry(id) {
  return ANTENNA_CATALOGUE.find((entry) => entry.id === id);
}

export function isKnownAntennaId(id) {
  return ANTENNA_CATALOGUE.some((entry) => entry.id === id);
}

/** Default parameter record for a design. */
export function createDefaultParams(id) {
  const entry = getAntennaEntry(id);
  if (!entry) throw new RangeError(`unknown antenna design: ${id}`);
  const params = {};
  for (const spec of entry.paramSpecs) params[spec.key] = spec.default;
  return params;
}

/** Clamp/coerce one parameter map against the design's paramSpecs. */
export function normaliseParams(id, params = {}) {
  const entry = getAntennaEntry(id);
  if (!entry) throw new RangeError(`unknown antenna design: ${id}`);
  const out = {};
  for (const spec of entry.paramSpecs) {
    const raw = Number(params[spec.key] ?? spec.default);
    const value = Number.isFinite(raw) ? clamp(raw, spec.min, spec.max) : spec.default;
    out[spec.key] = spec.step >= 1 ? Math.round(value) : value;
  }
  return out;
}

/** Default aim for a design (panels and beams start with their typical downtilt). */
export function createDefaultAim(id) {
  const entry = getAntennaEntry(id);
  const tiltSpec = entry?.paramSpecs.find((spec) => spec.key === 'beamTiltDeg');
  return Object.freeze({ azimuthDeg: 0, tiltDeg: 0, beamTiltDeg: tiltSpec ? tiltSpec.default : 0 });
}

/** Peak free-space gain in dBi. */
export function nominalGainDbi(id, params) {
  const entry = getAntennaEntry(id);
  if (!entry) throw new RangeError(`unknown antenna design: ${id}`);
  return entry.gainDbi(normaliseParams(id, params));
}

/** Pattern specification (azimuth + elevation shape descriptors) for a design. */
export function patternSpec(id, params) {
  const entry = getAntennaEntry(id);
  if (!entry) throw new RangeError(`unknown antenna design: ${id}`);
  return entry.pattern(normaliseParams(id, params));
}

/**
 * The -3 dB beamwidths a directional design declares, in degrees. Omni designs have no
 * azimuth beamwidth (their azimuth plane is the whole compass), so this returns null for
 * them rather than inventing 360.
 */
export function beamwidthSpec(id, params) {
  const entry = getAntennaEntry(id);
  if (!entry) throw new RangeError(`unknown antenna design: ${id}`);
  if (!entry.beamwidths) return null;
  return entry.beamwidths(normaliseParams(id, params));
}

/** Short label of a parameter, used by the HUD. */
export function paramLabel(id, key) {
  return getAntennaEntry(id)?.paramSpecs.find((spec) => spec.key === key)?.label ?? key;
}
