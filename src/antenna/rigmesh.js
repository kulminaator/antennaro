/**
 * The antenna rig: hardware mesh + pattern lobe + mast, assembled as one scene
 * subtree.
 *
 * Layer: L4 (render adapter).
 *
 * Hierarchy matters here and is the reason this module exists:
 *   rig (translated to the site, never rotated)
 *     body   (rotated by the aim frame; holds hardware + lobe)
 *     mast   (true scale, always vertical, height = antenna height)
 *
 * Putting the mast inside the rotated body would tilt it whenever the user adds
 * downtilt, which is physically wrong and visually alarming.
 */

import * as THREE from 'three';
import { createAntennaMesh, createMast, frameMatrix } from './antennamesh.js';
import { createLobeMesh } from './lobemesh.js';

/**
 * @param {{lobeOptions?:{scale?:number, dynamicRangeDb?:number, opacity?:number}, mastRadiusM?:number}} [options]
 */
export function createAntennaRig(options = {}) {
  const group = new THREE.Group();
  group.name = 'antenna-rig';
  const body = new THREE.Group();
  body.name = 'antenna-body';

  const mast = createMast(1, { radiusM: options.mastRadiusM ?? 0.4 });
  group.add(body);
  group.add(mast.mesh);

  /** @type {{group:THREE.Group, scale:number, dispose:()=>void}|null} */
  let hardware = null;
  /** @type {{mesh:THREE.Mesh, update:(m:object)=>void, dispose:()=>void}|null} */
  let lobe = null;
  let model = null;

  /** Rebuild hardware + lobe for a new model and move the rig to `site`. */
  function setModel(nextModel, site) {
    model = nextModel;
    if (hardware) {
      body.remove(hardware.group);
      hardware.dispose();
    }
    hardware = createAntennaMesh(nextModel.geometry);
    body.add(hardware.group);
    if (!lobe) {
      lobe = createLobeMesh(nextModel, options.lobeOptions);
      body.add(lobe.mesh);
    } else {
      lobe.update(nextModel);
    }
    place(nextModel, site);
  }

  /** Position the rig and orient the body. Cheap; safe to call every frame. */
  function place(nextModel, site) {
    const active = nextModel ?? model;
    group.position.set(site.x, 0, site.z);
    body.position.y = site.y;
    mast.mesh.position.set(site.x, site.groundY, site.z);
    if (Math.abs(mast.mesh.geometry.parameters?.height - site.heightM) > 1e-6) mast.setHeight(site.heightM);
    if (active) body.quaternion.setFromRotationMatrix(frameMatrix(active.frame));
  }

  function setPatternVisible(visible) {
    if (lobe) lobe.mesh.visible = Boolean(visible);
  }

  function info() {
    return {
      parts: hardware ? hardware.group.children.length : 0,
      visualScale: hardware ? hardware.scale : 0,
      patternVisible: Boolean(lobe && lobe.mesh.visible),
      mastHeightM: mast.mesh.geometry.parameters?.height ?? 0,
      position: group.position.toArray(),
      bodyY: body.position.y,
    };
  }

  function dispose() {
    if (hardware) hardware.dispose();
    if (lobe) lobe.dispose();
    mast.dispose();
    group.clear();
  }

  return { group, body, mast: mast.mesh, setModel, place, setPatternVisible, info, dispose };
}
