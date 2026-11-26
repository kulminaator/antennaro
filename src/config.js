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

/** World / terrain grid. `gridSize` must be odd so the map centre is a vertex. */
export const WORLD = Object.freeze({
  gridSize: 349,
  // 5.2 km of ground, about 15 m per cell. The size is set by the radio, not by
  // taste: with a 2.4 km map and a client at -80 dBm, every design but the omni
  // dipole outranges the map, so the coverage you saw ended at the map edge or at
  // the study range and looked like an antenna limit. A link must die inside the
  // picture, or the app has to say which of its own limits cut it off first.
  worldSize: 5200, // metres, square domain centred on the map origin
  /** What the world-size slider may be asked for. The lower bound is where the terrain
      features stop making sense; the upper is where the coverage sweep stops being
      interactive even with the stride and the pre-filter. */
  minWorldSize: 400,
  maxWorldSize: 8000,
  minGridSize: 17,
  maxGridSize: 401,
});

/**
 * Terrain feature parameters. All amplitudes and widths are metres.
 *
 * Landforms (the peaks, the valley, the bump field) scale with the map, so the world
 * keeps its shape however wide it is: relief / half-extent stays about 0.25 and a
 * ridge still blocks a ray at the same relative distance. Texture deliberately does
 * **not** scale - `regionalFrequency`, `flat.roughness`, `fineNoise` and the noise
 * frequencies inside `generators.js` are per metre, so detail stays the physical size
 * the grid cells can actually resolve.
 */
export const TERRAIN = Object.freeze({
  seed: 20251105,
  /**
   * Bounds of the seed control, and of the "New terrain" dice roll. The default seed
   * **must** lie inside them: a `<input type=range>` sanitises an out-of-range value to
   * the nearest bound, and Blink then reports that as an `input` event - so a default
   * outside its own slider gets written back into the model by the panel at boot, and the
   * map you see is not the map the configuration asked for. `tests/unit/state.test.js`
   * keeps every control's default inside its declared bounds for exactly this reason.
   */
  seedMin: 1,
  seedMax: 99_999_999,
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
    depth: 78,
    halfWidth: 358,
    rimHeight: 20,
    rimWidth: 933,
    meander: 260,
    northLimit: -0.06,
    southLimit: 0.2,
  }),
  bumps: Object.freeze({ amplitude: 74, radius: 239, density: 0.75, spacingFactor: 1.4, fineNoise: 3.2 }),
  mountain: Object.freeze({
    peak: 412,
    centreZ: -0.36, // fraction of half-extent; negative = north of the site
    width: 434,
    curvature: 0.0028, // 1/m: how fast the crest wiggles along its own length
    meanderM: 239,
    rockM: 48,
    distantPeak: 510,
    distantCentreZ: -0.88,
    distantWidth: 651,
    distantMeanderM: 152,
    distantRockM: 65,
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
  /**
   * The study range: how much of the map the coverage is evaluated over. The
   * default is at least the map's half-diagonal (5200/sqrt(2) = 3677 m), so by
   * default the whole map is evaluated and the edge of the painted coverage is the
   * link's own maximum. Lower it and it becomes a declared limit: step-008 draws
   * the ring, step-009 names it in the read-out.
   */
  defaultMaxRangeM: 3800,
  maxRangeLimitsM: Object.freeze({ min: 100, max: 3800 }),
  clutterLossDb: 0,
  earthRadiusM: 6_371_000,
  kFactor: 1.413, // standard atmosphere refraction model for the terrain LOS bulge
  profileSamples: 96,
  /**
   * A path is only reliable when at least this fraction of the *first Fresnel zone*
   * is clear of the ground. 0.6 (60 % of r1) is the conventional engineering
   * criterion; it is a flag on the link, not an extra loss term - the dB already
   * come from the Fresnel/Kirchhoff diffraction parameter.
   */
  fresnelClearFraction: 0.6,
  /**
   * Height above the ground of the *receiving* terminal the zone is judged against.
   * Not a fudge - a stated assumption, because the answer depends on it: judged
   * against a receiver lying on the ground, the zone radius collapses to nothing at
   * the receiver and flat earth is always inside the zone (a 10 m mast is only
   * Fresnel-clear within 2.2*(h1+h2)/lambda = 89 m at 868 MHz, 596 m at 5.8 GHz).
   * A rooftop terminal of a few metres is what "the link holds" is really claiming.
   */
  fresnelRxHeightM: 4,
  /**
   * Fraction of the path at each end whose samples are not judged. Near an antenna
   * the zone is narrower than the terrain sampling and the geometry, not the
   * ground, decides the answer, so only obstacles well inside the path count.
   */
  fresnelEndpointGuard: 0.1,
  /**
   * Coverage is evaluated and draped on every `coverageStride`-th terrain vertex.
   * The ground needs ~15 m cells to look like land; a ray walk over every one of
   * 121 801 of them measured 734 ms in Node, which is far too slow to re-run while
   * a slider is dragged. Stride 2 (about 30 m cells) keeps the coverage shape - a
   * link boundary is kilometres wide - at a fraction of the cost.
   */
  coverageStride: 2,
  /**
   * Alpha of the drape where the ground was consulted and the link failed. Faint,
   * never blank: that rim is the reach this terrain actually allows, and blank is
   * reserved for places nothing was asked about.
   *
   * No "how far below sensitivity do we still paint" threshold is needed to make it
   * appear. The pre-filter's test is the free-space bound, so the points that get
   * walked and still fail are precisely those the *terrain* defeated - the halo is a
   * consequence of the method, not a distance someone typed in.
   */
  noLinkAlpha: 0.22,
  /** Coverage ramp bands, as link-margin (dB) above the receiver sensitivity. */
  levelMarginsDb: Object.freeze([45, 30, 15, 0]),
  /**
   * How the drape is painted: `'bands'` (the four RSSI steps), `'gradient'` (continuous
   * yellow-through-pink against link margin) or `'zone'` (first Fresnel zone clearance).
   * One field with three values, so no two switches can disagree about the picture.
   */
  defaultCoverageView: 'gradient',
  /**
   * Top of the gradient scale in dB of margin. Deliberately the same figure as the largest
   * `levelMarginsDb`, so the two views can disagree about where the edges are - the whole
   * reason for having both - but never about what "strong" means.
   */
  gradientMaxMarginDb: 45,
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
  /**
   * How far the site may be relocated on each axis, metres from the centre. The
   * margin keeps the mast on the map with ground all round it even at the limit.
   */
  siteLimitsM: Object.freeze({ min: -WORLD.worldSize / 2 + 100, max: WORLD.worldSize / 2 - 100 }),
  /** Step of the two placement sliders. */
  siteStepM: 5,
  azimuthLimitsDeg: Object.freeze({ min: 0, max: 360 }),
  tiltLimitsDeg: Object.freeze({ min: -60, max: 60 }), // boresight elevation; negative = downtilt
  defaultAim: Object.freeze({ azimuthDeg: 0, tiltDeg: 0 }),
  /**
   * How much of the directivity a design's own beam implies it actually keeps.
   *
   * A directional design's peak gain here is **derived from the beam it draws**:
   * `gain = krausDirectivityDbi(H, V) + 10*log10(efficiency)` (see
   * `antenna/pattern.js`). The efficiency is what a real build loses to amplitude taper,
   * feed loss, mismatch and the finite reflector - never above 1, because a gain above
   * the beam-implied directivity is not a strong antenna, it is a contradiction, and
   * that contradiction is exactly what once made a 69-degree biquad outrange a Yagi.
   *
   * Chosen against published/field figures for these builds
   * (`.taskman/antenna-physics-and-range-gradient/step-001/step.md` has the audit):
   *  - yagi 0.60 -> 7.6 dBi at 2 directors, 9.5 at 7, 12.3 at 14, against ~7-8 dBi for
   *    a 3-element and ~12-13 dBi for a 15-element single-row boom.
   *  - biquad 0.75 -> 7.3 / 8.1 / 9.1 dBi at 1 / 2 / 3 turns, against the 8-10 dBi a
   *    measured 2-turn biquad in front of a plate gives. It was previously 12.4 dBi at
   *    a beam that can hold 9.4.
   *  - patch 0.55 -> 3.6 / 6.7 / 10.2 dBi across its size range, against the 4-10 dBi a
   *    microstrip panel of that aperture gives.
   *
   * The omni designs are exempt and keep an array-factor gain
   * (`2.15 + 10*log10(sections) - 1.0`): a 360-degree azimuth plane is not a main lobe,
   * so Kraus's single-lobe arithmetic does not apply to them.
   */
  apertureEfficiency: Object.freeze({
    yagi: 0.6,
    'biquad-reflector': 0.75,
    patch: 0.55,
  }),
  /** A design that has not said what it is worth is not allowed to be lossless. */
  apertureEfficiencyDefault: 0.55,
  lobeRings: 48,
  lobeColumns: 72,
  lobeDynamicRangeDb: 30, // pattern surface is clipped to peak-30 dB
  lobeScale: 110, // metres: drawn radius of the peak-gain lobe (a visual aid, not a range)
});

/**
 * First-Fresnel-zone visuals. The volume is the ellipsoid of revolution of a
 * reference link (phase centre to the far edge of the study range), which is the
 * largest zone the antenna has to keep clear.
 */
export const FRESNEL = Object.freeze({
  rings: 28, // segments around the zone
  steps: 48, // samples along the link
  opacity: 0.2,
  // The true zone is thin next to a kilometre-wide map (r1 is a few metres at
  // 868 MHz); exaggerate radially so it is actually visible, and say so in the docs.
  radialExaggeration: 6,
  /**
   * Clearance ratio that tops the zone colour ramp, in first-zone radii: below the
   * criterion the ramp runs cut -> partly cut, above it partly cut -> comfortably
   * clear. Ramped because a binary flag would paint ~90 % of the map one colour.
   */
  rampMaxRatio: 2,
  /** Step used to walk the boresight until it meets the ground, in metres. */
  groundSearchStepM: 20,
});

/** Rendering defaults (three.js side only). */
export const VIEW = Object.freeze({
  background: 0x0d1117,
  fogColour: 0x0d1117,
  fogNear: 3300,
  fogFar: 10100,
  /** Vertical field of view of the perspective camera. */
  cameraFovDeg: 52,
  cameraStart: Object.freeze({ azimuthDeg: 38, elevationDeg: 44, distance: 4600 }),
  cameraLimits: Object.freeze({ minDistance: 60, maxDistance: 9200, minElevationDeg: 2, maxElevationDeg: 88 }),
  terrainHeightExaggeration: 1,
  coverageOffsetM: 0.8, // drape the coverage overlay this far above the terrain
  /** The study-range ring: points around the circle, metres it rides above the
      coverage drape, and how solid the line looks. Thin on purpose - it describes a
      decision, not a result. */
  rangeRingSamples: 160,
  rangeRingLiftM: 0.5,
  rangeRingOpacity: 0.9,
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
  /**
   * The range gradient: yellow where the link has room, pale yellow as the room closes,
   * pink for a link that only just makes the receiver - "yellow for strong range, light
   * yellow for weaker, pink for very weak", because flat bands hide how much margin a spot
   * has. These hues belong to this view alone (the zone ramp below is purple / amber /
   * green, the bands are `levels` above) and a unit test refuses a collision: a colour
   * that means two things in two switchable views is a bug nobody can see.
   */
  gradientStops: Object.freeze({ strong: '#e8b32a', mid: '#f4e08e', weak: '#f0a8bf' }),
  noLink: Object.freeze('#2a2f38'),
  /** A cell with the link budget but a cut first Fresnel zone (a marker, not a level). */
  fresnelObstructed: Object.freeze('#a24bd0'),
  /** The semi-transparent first-Fresnel-zone volume of the antenna. */
  fresnelVolume: Object.freeze('#79d6ff'),
  /**
   * The other two stops of the zone ramp, between `fresnelObstructed` (cut) and a
   * criterion met with room. Named rather than borrowed from `levels`: a zone state
   * is not a signal level, and the two must never be confused for one another.
   */
  fresnelPartial: Object.freeze('#e8c33c'),
  fresnelClear: Object.freeze('#3fd07a'),
  /**
   * The study-range ring: the app's own work-area boundary. Deliberately outside
   * the coverage ramp, so a circle we chose can never be read as signal.
   */
  rangeLimit: Object.freeze('#8f9bb0'),
});
