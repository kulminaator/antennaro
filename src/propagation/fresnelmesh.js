/**
 * First Fresnel zone -> semi-transparent volume around the active link.
 *
 * Layer: L4 (render adapter). The zone maths stays in `propagation/los.js`; this
 * only turns a link into a tube of revolution whose radius at each sample is the
 * first-zone radius there, so the volume closes on both antennas and swells in the
 * middle - the shape installers actually look at.
 *
 * The drawn radius is multiplied by `FRESNEL.radialExaggeration`. That is not
 * decoration: at 868 MHz a 1.4 km link is 11 m wide at mid-path next to a 2.4 km
 * map, which is a hairline at any zoom. The number is stated in the legend, the HUD
 * and the README, and setting it to 1 draws the truth.
 */

import * as THREE from 'three';
import { FRESNEL } from '../config.js';
import { fresnelVolumeHex } from '../palette.js';
import { fresnelRadiusM } from './rf.js';

const UP = new THREE.Vector3(0, 0, 1);

/**
 * @param {import('three').Scene} scene
 * @returns {{mesh: any, update: Function, setVisible: Function, dispose: Function}}
 */
export function createFresnelMesh(scene) {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshBasicMaterial({
    color: fresnelVolumeHex(), // three.js spells material properties with an o
    transparent: true,
    opacity: FRESNEL.opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'fresnel-zone';
  mesh.renderOrder = 3;
  mesh.visible = false;
  scene.add(mesh);

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const orient = new THREE.Quaternion();
  const centre = new THREE.Vector3();
  const offset = new THREE.Vector3();

  /**
   * Rebuild the volume around a straight link.
   * @param {{from:{x:number,y:number,z:number}, to:{x:number,y:number,z:number},
   *   freqHz:number, radiusScale?:number}} link
   */
  function update(link) {
    const scale = Number.isFinite(link.radiusScale) ? link.radiusScale : FRESNEL.radialExaggeration;
    from.set(link.from.x, link.from.y, link.from.z);
    to.set(link.to.x, link.to.y, link.to.z);
    axis.copy(to).sub(from);
    const length = axis.length();
    if (!(length > 0)) {
      geometry.setIndex(null);
      geometry.deleteAttribute('position');
      mesh.visible = false;
      return;
    }
    orient.setFromUnitVectors(UP, direction.copy(axis).normalize());

    const along = Math.max(2, Math.round(FRESNEL.steps));
    const around = Math.max(3, Math.round(FRESNEL.rings));
    const positions = new Float32Array((along + 1) * (around + 1) * 3);
    const index = [];
    let p = 0;

    for (let i = 0; i <= along; i += 1) {
      const t = i / along;
      const radius = fresnelRadiusM(length * t, length * (1 - t), link.freqHz) * scale;
      centre.copy(axis).multiplyScalar(t).add(from);
      for (let j = 0; j <= around; j += 1) {
        const angle = (j / around) * Math.PI * 2;
        offset.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0).applyQuaternion(orient);
        positions[p++] = centre.x + offset.x;
        positions[p++] = centre.y + offset.y;
        positions[p++] = centre.z + offset.z;
      }
    }

    for (let i = 0; i < along; i += 1) {
      for (let j = 0; j < around; j += 1) {
        const a = i * (around + 1) + j;
        const b = a + around + 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
    mesh.visible = true;
  }

  function setVisible(visible) {
    mesh.visible = visible === true;
  }

  function dispose() {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  }

  return { mesh, update, setVisible, dispose };
}
