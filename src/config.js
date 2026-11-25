/**
 * Global configuration: every magic number in the application lives here.
 *
 * Layer: L0 (pure). No DOM, no three.js, no I/O, no side effects.
 * Units: metres, hertz, dBm, dBi, degrees (UI-facing values), seconds.
 * Coordinate system: right-handed, +Y up, +X east, -Z north (see GUIDELINES.md).
 */

export const APP = Object.freeze({
  id: 'antenna-terrain-sim',
  version: '0.1.0',
});

/** World / terrain grid. `gridSize` must be odd so the site sits exactly on a cell. */
export const WORLD = Object.freeze({
  gridSize: 161,
  worldSize: 2400, // metres, square domain centred on the antenna site
  minGridSize: 17,
  maxGridSize: 321,
  sitePadRadius: 45, // metres of flattened ground directly under the antenna
  // How far beyond that radius the flattened ground cross-fades back into the
  // natural surface. The pad is cut level with the ground the mast stands on, so
  // it follows the terrain instead of sitting at a fixed datum.
  sitePadBlendFactor: 2.4,
});

/** Terrain feature parameters. All amplitudes are metres. */
export const TERRAIN = Object.freeze({
  seed: 20251105,
  regionalAmplitude: 7,
  regionalFrequency: 0.0009,
  flat: Object.freeze({ roughness: 1.4, label: 'Flat field' }),
  /**
   * The channel is a southern feature. `northLimit` / `southLimit` are fractions
   * of the map half-extent: the floor and its rims are fully closed at northLimit
   * (north of the site) and reach full depth at southLimit. Without that fade the
   * valley cuts a gash through the whole map, mountain sector and site included.
   */
  valley: Object.freeze({
    depth: 36,
    halfWidth: 165,
    rimHeight: 9,
    rimWidth: 430,
    meander: 120,
    northLimit: -0.06,
    southLimit: 0.2,
  }),
  bumps: Object.freeze({ amplitude: 34, radius: 110, density: 0.75, spacingFactor: 1.4, fineNoise: 3.2 }),
  mountain: Object.freeze({
    peak: 190,
    centreZ: -0.36, // fraction of half-extent; negative = north of the site
    width: 200,
    curvature: 0.006,
    distantPeak: 235,
    distantCentreZ: -0.88,
    distantWidth: 300,
  }),
  blendBand: 0.16, // fraction of half-extent over which adjacent zones cross-fade
});

/** Radio + coverage defaults. */
export const RF = Object.freeze({
  /** Physical constants used by the RF maths (metres/second). */
  speedOfLightMps: 299_792_458,
  frequenciesHz: Object.freeze({
    '433': 433_000_000,
    '868': 868_000_000,
    '915': 915_000_000,
    '2400': 2_400_000_000,
    '5800': 5_800_000_000,
  }),
  defaultFrequencyKey: '868',
  defaultTxPowerDbm: 10,
  /** Typical WiFi-ish client; the coverage ramp is drawn relative to this. */
  defaultRxSensitivityDbm: -80,
  defaultMaxRangeM: 1400,
  maxRangeLimitsM: Object.freeze({ min: 100, max: 2400 }),
  clutterLossDb: 0,
  earthRadiusM: 6_371_000,
  kFactor: 1.413, // standard atmosphere refraction model for the terrain LOS bulge
  profileSamples: 96,
  coverageResolutionDivisor: 1, // 1 = evaluate coverage on the full terrain grid
  /** Coverage ramp bands, as link-margin (dB) above the receiver sensitivity. */
  levelMarginsDb: Object.freeze([45, 30, 15, 0]),
});

/** Antenna placement + aiming limits. */
export const ANTENNA = Object.freeze({
  defaultDesignId: 'omni-dipole',
  heightLimitsM: Object.freeze({ min: 0.5, max: 40 }),
  defaultHeightM: 10,
  /** Default footprint of the site: the map centre (+X east, +Z south). */
  defaultSiteXm: 0,
  defaultSiteZm: 0,
  /** How far the site may be relocated on each axis, metres from the centre. */
  siteLimitsM: Object.freeze({ min: -WORLD.worldSize / 2, max: WORLD.worldSize / 2 }),
  /** Step of the two placement sliders. */
  siteStepM: 5,
  azimuthLimitsDeg: Object.freeze({ min: 0, max: 360 }),
  tiltLimitsDeg: Object.freeze({ min: -60, max: 60 }), // boresight elevation; negative = downtilt
  defaultAim: Object.freeze({ azimuthDeg: 0, tiltDeg: 0 }),
  lobeRings: 48,
  lobeColumns: 72,
  lobeDynamicRangeDb: 30, // pattern surface is clipped to peak-30 dB
  lobeScale: 110, // metres: drawn radius of the peak-gain lobe (a visual aid, not a range)
});

/** Rendering defaults (three.js side only). */
export const VIEW = Object.freeze({
  background: 0x0d1117,
  fogColour: 0x0d1117,
  fogNear: 1500,
  fogFar: 4600,
  /** Vertical field of view of the perspective camera. */
  cameraFovDeg: 52,
  cameraStart: Object.freeze({ azimuthDeg: 38, elevationDeg: 44, distance: 2100 }),
  cameraLimits: Object.freeze({ minDistance: 60, maxDistance: 4200, minElevationDeg: 2, maxElevationDeg: 88 }),
  terrainHeightExaggeration: 1,
  coverageOffsetM: 0.8, // drape the coverage overlay this far above the terrain
  /**
   * Hardware is decimetres across while the map is kilometres wide, so the
   * structure is drawn scaled up to roughly this span (metres). The mast is
   * never scaled. See GUIDELINES.md §7 "not to scale".
   */
  antennaVisualSpanM: 60,
  antennaVisualScaleMax: 120,
  sunAzimuthDeg: 48,
  sunElevationDeg: 52,
});

/**
 * Time budgets in milliseconds. Every await in tools and tests must reference
 * one of these instead of inventing its own number (GUIDELINES.md §10).
 */
export const TIMEOUTS = Object.freeze({
  /** node:test per-assertion budgets. */
  unitTestPerTest: 20_000,
  browserTestPerTest: 30_000,
  /** Wall-clock budget for one test file (the runner kills the child at this point). */
  unitTestPerFile: 60_000,
  browserTestPerFile: 120_000,
  /** Budget for a whole suite invocation. */
  unitSuite: 180_000,
  browserSuite: 600_000,
  /** Infrastructure. */
  browserLaunch: 25_000,
  browserKill: 8_000,
  cdpCall: 10_000,
  pageNavigation: 25_000,
  /** A loaded machine boots a page slower than an idle one; this is patience, not a hang budget. */
  pageSettle: 25_000,
  screenshot: 20_000,
  serveHealth: 10_000,
  cliDefault: 60_000,
  /** Maintainer build: npm registry download + npx esbuild (network-bound). */
  vendorBundle: 300_000,
});

/** Where generated files live. Never hand-edit anything under .tmp/. */
export const PATHS = Object.freeze({
  tmp: '.tmp',
  vendor: 'vendor/three',
  browserProfiles: '.tmp/browser',
  artifacts: '.tmp/artifacts',
});

/**
 * Coverage colour ramp: one colour per link-margin band (strongest first),
 * plus the colour used when the link budget is not met.
 * Kept in L0 so the WebGL overlay and the HUD legend read the same truth.
 */
export const COLOURS = Object.freeze({
  levels: Object.freeze(['#1b7f4d', '#5fb85f', '#e8c33c', '#e08b2f']),
  noLink: Object.freeze('#2a2f38'),
});
