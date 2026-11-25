/**
 * Pointer <-> world picking maths.
 *
 * Layer: L1 (pure). No DOM, no three.js, no renderer: the pointer tools
 * (`app/relocate.js`) hand over numbers and get numbers back, so the geometry can
 * be pinned by unit tests in bare Node.
 *
 * The pose is derived from the *same* spherical camera state `app/viewport.js`
 * keeps, and reproduces the basis three.js' `Matrix4.lookAt` builds, so what the
 * maths picks and what the renderer draws cannot disagree:
 *   position = target + fromCompass(azimuthDeg, elevationDeg, distance)
 *   viewDir  = from the eye towards the target
 *   right    = normalize(cross(viewDir, worldUp))   (+X east, +Y up, -Z north)
 *   up       = normalize(cross(right, viewDir))
 *
 * Screen space here is normalised device coordinates: x to the right, y up, both
 * in [-1, 1] at the frustum edges. A pointer position becomes NDC with
 *   ndcX = (px / width) * 2 - 1,  ndcY = -((py / height) * 2 - 1)
 * because CSS pixels count downwards and NDC counts upwards.
 */

import { add, cross, dot, fromCompass, normalize, scale, sub } from '../math/vec3.js';
import { degToRad } from '../math/scalar.js';

/** World up, the reference axis three.js' `lookAt` uses as well. */
const WORLD_UP = Object.freeze({ x: 0, y: 1, z: 0 });

/** Below this, a ray counts as parallel to the ground plane and never hits it. */
const PLANE_PARALLEL_EPSILON = 1e-6;

/** Above this, the view direction is (anti)parallel to world up: `right` is undefined. */
const DEGENERATE_VIEW_DOT = 1 - 1e-9;

/**
 * @typedef {{azimuthDeg:number, elevationDeg:number, distance:number,
 *   targetX?:number, targetY?:number, targetZ?:number, fovDeg:number, aspect?:number}} CameraInput
 */

/**
 * Camera pose (position, view basis and the tangents that map NDC to angles).
 * @param {CameraInput} camera the spherical state `app/viewport.js` stores, plus
 *   the renderer's vertical field of view and aspect ratio
 */
export function cameraPose({
  azimuthDeg, elevationDeg, distance, targetX = 0, targetY = 0, targetZ = 0, fovDeg, aspect = 1,
}) {
  const target = { x: targetX, y: targetY, z: targetZ };
  const position = add(target, fromCompass(azimuthDeg, elevationDeg, distance));
  const viewDir = normalize(scale(sub(position, target), -1));
  // Looking straight up or down makes `cross(viewDir, worldUp)` vanish; pick a
  // stable reference axis instead, exactly like a lookAt implementation must.
  const right = Math.abs(dot(viewDir, WORLD_UP)) > DEGENERATE_VIEW_DOT
    ? normalize(cross(viewDir, { x: 1, y: 0, z: 0 }))
    : normalize(cross(viewDir, WORLD_UP));
  const up = normalize(cross(right, viewDir));
  const tanHalfFov = Math.tan(degToRad(fovDeg / 2));
  return { position, viewDir, right, up, tanHalfFov, tanHalfFovX: tanHalfFov * aspect };
}

/**
 * Project a world point into NDC. `depth` is the distance along the view
 * direction, so `depth <= 0` means the point is behind the eye.
 * @returns {{ndcX:number, ndcY:number, depth:number}}
 */
export function projectToNdc(pose, point) {
  const offset = sub(point, pose.position);
  const depth = dot(offset, pose.viewDir);
  return {
    ndcX: dot(offset, pose.right) / (depth * pose.tanHalfFovX),
    ndcY: dot(offset, pose.up) / (depth * pose.tanHalfFov),
    depth,
  };
}

/** Pointer NDC -> a world-space ray from the eye. */
export function rayForNdc(pose, ndcX, ndcY) {
  const dir = normalize(add(
    add(pose.viewDir, scale(pose.right, ndcX * pose.tanHalfFovX)),
    scale(pose.up, ndcY * pose.tanHalfFov),
  ));
  return { origin: pose.position, dir };
}

/**
 * Where a ray crosses the horizontal plane `y = planeY`.
 * @returns {{x:number, y:number, z:number}|null} null when the ray is parallel to
 *   the plane or meets it behind the eye.
 */
export function intersectPlaneY(ray, planeY) {
  if (Math.abs(ray.dir.y) < PLANE_PARALLEL_EPSILON) return null;
  const t = (planeY - ray.origin.y) / ray.dir.y;
  if (!(t > 0)) return null;
  return add(ray.origin, scale(ray.dir, t));
}

/**
 * Ground position under a pointer position, ignoring height: what a relocation
 * drag needs, since the mast slides on the plane it was grabbed at.
 * @returns {{x:number, z:number}|null}
 */
export function pickGround(pose, ndcX, ndcY, planeY) {
  const hit = intersectPlaneY(rayForNdc(pose, ndcX, ndcY), planeY);
  return hit ? { x: hit.x, z: hit.z } : null;
}
