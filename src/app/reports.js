/**
 * Numbers out of the scene: the coverage recompute, and the summary objects the HUD,
 * legend, test API and screenshot tooling ask for.
 *
 * Layer: L5 (composition). These live here rather than in `controller.js` because the
 * controller's job is to turn state into pixels - stages, dirty flags, meshes - and
 * describing what the scene contains is a second job that had outgrown the file. It
 * owns one piece of data (the last coverage result) and nothing else: every input is
 * read through an accessor, so the controller stays the single owner of the scene.
 *
 * No DOM, no three.js: the accessors hand over plain data or already-built objects.
 */

import { boresightDirection } from '../antenna/aim.js';
import { FRESNEL } from '../config.js';
import { computeCoverage } from '../propagation/coverage.js';
import { resolveFrequencyHz, rfSummary } from '../propagation/rf.js';

/**
 * @param {{
 *   getState: () => object,
 *   getModel: () => object|null,
 *   getField: () => object,
 *   getSite: () => object,
 *   getRigInfo: () => object,
 *   getMapObjects: () => object,
 *   getViewportInfo: () => object,
 *   getCameraState: () => object,
 *   onCoverage?: (coverage: object) => void,
 * }} accessors
 */
export function createReports(accessors) {
  const {
    getState, getModel, getField, getSite, getRigInfo, getMapObjects, getViewportInfo, getCameraState,
  } = accessors;
  const onCoverage = accessors.onCoverage ?? (() => {});

  /** @type {ReturnType<typeof computeCoverage>|null} */
  let coverage = null;

  /**
   * Run the coverage grid for the current state. The expensive stage of the whole
   * application; the controller decides *when* to call it, this decides *what* it uses.
   * @param {object} site the resolved mast footprint to radiate from
   */
  function recomputeCoverage(site) {
    const model = getModel();
    if (!model) return null;
    const state = getState();
    coverage = computeCoverage({
      field: getField(),
      site,
      model,
      freqHz: resolveFrequencyHz(state.frequencyKey),
      txPowerDbm: state.txPowerDbm,
      feederLossDb: state.feederLossDb,
      rxSensitivityDbm: state.rxSensitivityDbm,
      maxRangeM: state.maxRangeM,
      clutterLossDb: state.clutterLossDb,
      useDiffraction: state.useDiffraction,
      rxHeightM: state.zoneRxHeightM,
    });
    onCoverage(coverage);
    return coverage;
  }

  /** The link budget read-out: EIRP, margin and the ranges they imply. */
  function rf() {
    const state = getState();
    const model = getModel();
    return rfSummary({
      txPowerDbm: state.txPowerDbm,
      peakGainDbi: model ? model.peakGainDbi : 0,
      feederLossDb: state.feederLossDb,
      rxSensitivityDbm: state.rxSensitivityDbm,
      freqHz: resolveFrequencyHz(state.frequencyKey),
    });
  }

  /**
   * The reference link the Fresnel volume is drawn around: the boresight, out to the
   * point where it reaches the ground (or to the edge of the study range if it never
   * does), with a terminal `zoneRxHeightM` above that point. This is the largest zone
   * the antenna has to keep clear anywhere it is looking, so it is the one worth
   * drawing - and it is the same link the per-cell criterion uses, so the volume and
   * the map cannot disagree about what "clear" means.
   */
  function fresnelLink() {
    const state = getState();
    const model = getModel();
    const site = getSite();
    const aim = model ? model.summary().aim : state.aim;
    const dir = boresightDirection(aim);
    const field = getField();
    const rxHeightM = state.zoneRxHeightM;
    const stepM = FRESNEL.groundSearchStepM;
    const rangeM = state.maxRangeM;
    let distanceM = rangeM;
    for (let d = stepM; d <= rangeM; d += stepM) {
      const y = site.y + dir.y * d;
      if (y - rxHeightM <= field.sample(site.x + dir.x * d, site.z + dir.z * d)) {
        distanceM = d - stepM;
        break;
      }
    }
    return {
      from: { x: site.x, y: site.y, z: site.z },
      to: {
        x: site.x + dir.x * distanceM,
        y: site.y + dir.y * distanceM + rxHeightM,
        z: site.z + dir.z * distanceM,
      },
      freqHz: resolveFrequencyHz(state.frequencyKey),
      distanceM,
    };
  }

  /** What the scene is made of: geometry counts, placement, visibility. */
  function sceneInfo() {
    const field = getField();
    const site = getSite();
    const mapObjects = getMapObjects();
    const rigInfo = getRigInfo();
    return {
      ...getViewportInfo(),
      terrainVertices: mapObjects.terrain.surface.geometry.attributes.position.count,
      terrainGrid: field.size,
      sitePosition: [site.x, site.z],
      terrainStats: field.stats(),
      antennaParts: rigInfo.parts,
      antennaVisualScale: rigInfo.visualScale,
      antennaY: rigInfo.bodyY,
      mastHeightM: rigInfo.mastHeightM,
      patternVisible: rigInfo.patternVisible,
      coverageVisible: mapObjects.overlay.mesh.visible,
      /** Our work-area boundary: `{ visible, radiusM, canBind }`. */
      rangeRing: mapObjects.ring.info(),
      labelsVisible: mapObjects.labels.group.visible,
      camera: getCameraState(),
    };
  }

  return {
    recomputeCoverage,
    coverage: () => coverage,
    coverageStats: () => (coverage ? coverage.stats : null),
    antennaSummary: () => {
      const model = getModel();
      return model ? model.summary() : null;
    },
    rf,
    fresnelLink,
    sceneInfo,
  };
}
