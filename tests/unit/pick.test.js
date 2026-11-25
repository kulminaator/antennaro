/**
 * Unit tests: the pointer <-> world picking maths.
 *
 * These are the geometry the mouse relocation (app/relocate.js) stands on, so
 * they assert relationships and handedness rather than captured numbers: where the
 * camera target lands on screen, what the screen-right axis points at, that a
 * pick round-trips a projection, and that a ray which never meets the ground says
 * so instead of returning a number a thousand kilometres away.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cameraPose, intersectPlaneY, pickGround, projectToNdc, rayForNdc,
} from '../../src/app/pick.js';

const DEFAULT_CAMERA = Object.freeze({ azimuthDeg: 38, elevationDeg: 44, distance: 2100 });
const LENS = Object.freeze({ fovDeg: 52, aspect: 1.6 });

test('pick: the camera target is always at the centre of the screen', () => {
  for (const azimuthDeg of [0, 38, 127, 300]) {
    for (const elevationDeg of [2, 44, 88]) {
      for (const distance of [60, 2100]) {
        const target = { targetX: 40, targetY: 12, targetZ: -25 };
        const lookAt = { x: 40, y: 12, z: -25 };
        const pose = cameraPose({ ...target, azimuthDeg, elevationDeg, distance, ...LENS });
        const ndc = projectToNdc(pose, lookAt);
        assert.ok(Math.abs(ndc.ndcX) < 1e-9, `az ${azimuthDeg}: ndcX ${ndc.ndcX}`);
        assert.ok(Math.abs(ndc.ndcY) < 1e-9, `az ${azimuthDeg}: ndcY ${ndc.ndcY}`);
        assert.ok(ndc.depth > 0, 'the target is in front of the eye');
      }
    }
  }
});

test('pick: screen centre picks the target when the plane passes through it', () => {
  const pose = cameraPose({ azimuthDeg: 38, elevationDeg: 45, distance: 100, ...LENS });
  const hit = intersectPlaneY(rayForNdc(pose, 0, 0), 0);
  // The eye is 100 m from the origin at 45 deg, so the centre ray meets y = 0 at
  // the target itself - the textbook case, no fitted constant involved.
  assert.ok(hit, 'the centre ray must meet the ground');
  assert.ok(Math.abs(hit.x) < 1e-6 && Math.abs(hit.z) < 1e-6, `hit (${hit.x}, ${hit.z})`);
  assert.ok(Math.abs(hit.y) < 1e-6, 'the hit lies in the plane');
});

test('pick: picking where a point projects round-trips to that point', () => {
  const pose = cameraPose({ ...DEFAULT_CAMERA, ...LENS });
  const point = { x: 317, y: 0, z: -84 };
  const ndc = projectToNdc(pose, point);
  assert.ok(ndc.depth > 0, 'the point is in front of the camera');
  const hit = intersectPlaneY(rayForNdc(pose, ndc.ndcX, ndc.ndcY), point.y);
  assert.ok(hit, 'a projected point is pickable');
  assert.ok(Math.abs(hit.x - point.x) < 1e-6, `x round-trip: ${hit.x} vs ${point.x}`);
  assert.ok(Math.abs(hit.z - point.z) < 1e-6, `z round-trip: ${hit.z} vs ${point.z}`);
});

test("pick: the screen-right axis is the camera's right, not east", () => {
  // azimuth 0, elevation 0 puts the eye due north of the target looking south, so
  // east (+X) is on the operator's LEFT and screen-right is -X. This is the basis
  // three.js' Matrix4.lookAt produces; getting it backwards mirrors every drag.
  const pose = cameraPose({ azimuthDeg: 0, elevationDeg: 0, distance: 100, ...LENS });
  assert.ok(pose.right.x < 0, `right = (${pose.right.x}, ${pose.right.y}, ${pose.right.z})`);
  assert.equal(pose.right.y, 0, 'screen right is horizontal');
  assert.equal(pose.right.z, 0, 'looking along +Z, so right is purely east-west');

  assert.ok(projectToNdc(pose, { x: -50, y: 0, z: 0 }).ndcX > 0, 'west appears on the right');
  assert.ok(projectToNdc(pose, { x: 50, y: 0, z: 0 }).ndcX < 0, 'east appears on the left');
});

test('pick: a ray that never meets the plane returns null, not Infinity', () => {
  // The eye sits exactly in the plane and looks horizontally: the centre ray is
  // parallel to the ground, so there is nothing to grab.
  const pose = cameraPose({ azimuthDeg: 0, elevationDeg: 0, distance: 100, targetY: 0, ...LENS });
  assert.equal(intersectPlaneY(rayForNdc(pose, 0, 0), 0), null);
  assert.equal(pickGround(pose, 0, 0, 0), null);

  const below = intersectPlaneY(rayForNdc(pose, 0, -0.5), -50);
  assert.ok(below && below.y === -50, 'looking below the horizon meets a lower plane');
  assert.equal(intersectPlaneY(rayForNdc(pose, 0, 0.5), -50), null,
    'a ray climbing away from the plane never grabs it - no ground behind the viewer');
});

test('pick: a point behind the camera has negative depth', () => {
  const pose = cameraPose({ azimuthDeg: 0, elevationDeg: 0, distance: 100, ...LENS });
  // The eye is at z = -100 looking south; z = -300 is 200 m further north, behind it.
  const ndc = projectToNdc(pose, { x: 0, y: 0, z: -300 });
  assert.ok(ndc.depth < 0, `depth ${ndc.depth}`);
});

test('pick: the basis stays orthonormal, even looking straight down', () => {
  for (const elevationDeg of [2, 44, 89.999, 90]) {
    const pose = cameraPose({ azimuthDeg: 120, elevationDeg, distance: 500, ...LENS });
    const unit = (v) => Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < 1e-9;
    assert.ok(unit(pose.viewDir) && unit(pose.right) && unit(pose.up), `elev ${elevationDeg}: unit axes`);
    assert.ok(Math.abs(pose.right.y) < 1e-9 || elevationDeg >= 89.999, 'screen right stays flat while the view is not vertical');
    assert.ok(Math.abs(pose.viewDir.x * pose.right.x + pose.viewDir.y * pose.right.y + pose.viewDir.z * pose.right.z) < 1e-9,
      `elev ${elevationDeg}: right is perpendicular to the view`);
    assert.ok(Number.isFinite(pickGround(pose, 0.2, -0.3, 0).x), `elev ${elevationDeg}: still picks the ground`);
  }
});
