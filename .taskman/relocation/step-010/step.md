# step-010: unit tests: screen-to-world picking invariants

## How to perform this step

New file `tests/unit/pick.test.js` asserting geometry, not golden numbers
(GUIDELINES.md §9). Every expected value below is a hand-written constant with a
comment saying where it comes from.

1. Create `tests/unit/pick.test.js` with the standard header comment, `import { test } from 'node:test'`,
   `import assert from 'node:assert/strict'` and
   `import { cameraPose, intersectPlaneY, projectToNdc, rayForNdc, pickGround } from '../../src/app/pick.js';`
   (note `../../`, the test runner does not put the file's directory on the path).
2. Tests to write:
   - `test('pick: the camera target is always at the centre of the screen')` — for
     several camera states (azimuth 0/38/127/300, elevation 2/44/88, distance
     60/2100, fovDeg 52, aspect 1.6): `projectToNdc(pose, target)` gives
     `|ndcX| < 1e-9` and `|ndcY| < 1e-9` and `depth > 0`.
   - `test('pick: screen centre picks the target when the plane passes through it')`
     — with elevation 45, distance 100, target at the origin and `planeY = 0`,
     `intersectPlaneY(rayForNdc(pose, 0, 0), 0)` lands on `{0,0,0}` within 1e-6
     (the camera, the target and the plane are the textbook case).
   - `test('pick: picking where a point projects round-trips to that point')` —
     with `{ azimuthDeg: 38, elevationDeg: 44, distance: 2100, fovDeg: 52, aspect: 1.6 }`
     (the default camera shape) and `point = {x: 317, y: 0, z: -84}` near the
     target: project it (assert `depth > 0`), feed the NDC back through
     `rayForNdc` + `intersectPlaneY(ray, point.y)`, and assert the result equals
     `point` on x and z to 1e-6.
   - `test('pick: the screen-right axis is the camera\'s right, not east')` — with
     `azimuthDeg: 0, elevationDeg: 0` the camera sits **north** of the target and
     looks south, so east is on the operator's left: assert
     `pose.right.x < 0` and `pose.right.z === 0` (comment: matches
     `Matrix4.lookAt` in three.js), and that a point at `{-50, 0, 0}` (west) has
     `ndcX > 0` while `{50, 0, 0}` (east) has `ndcX < 0`.
   - `test('pick: a ray that never meets the plane returns null, not Infinity')` —
     camera `{ azimuthDeg: 0, elevationDeg: 0, distance: 100, targetY: 0, fovDeg: 52 }`
     puts the eye exactly in the plane `y = 0` looking horizontally, so the centre
     ray is parallel to it: `intersectPlaneY(rayForNdc(pose, 0, 0), 0)` is `null`
     and so is `pickGround(pose, 0, 0, 0)`. Picking *below* the horizon
     (`ndcY: -0.5`) against a plane 50 m lower (`planeY: -50`) does hit, and
     picking above it (`ndcY: 0.5`, `planeY: -50`) returns `null` because the ray
     diverges (comment: the pointer can never grab ground behind the viewer).
   - `test('pick: a point behind the camera has negative depth')` — with the
     camera north of the target at distance 100 (`azimuthDeg: 0, elevationDeg: 0`),
     project `{x: 0, y: 0, z: -300}` (200 m beyond the eye, further north) and
     assert `depth < 0`.
3. Verify: `node --test --test-reporter=spec tests/unit/pick.test.js`, then
   `npm run test:unit` and `npm run lint` (the test-layout rules require
   `*.test.js` + a `node:test` import, and no browser symbols in `tests/unit/`).

## Expected result

The picking maths is pinned by five invariant tests, including the handedness of
the screen-right axis that the drag in step-012 depends on.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- API asymmetry that bit once while writing the tests: `cameraPose()` takes the
  target as `targetX/targetY/targetZ` (the shape `app/viewport.js` stores), while
  `projectToNdc()`/`pickGround()` take plain `{x, y, z}` points. Spreading a point
  into `cameraPose` silently aims the camera at the origin and every projection is
  off — convert explicitly.
- Added a **seventh** test beyond the five this step listed
  (`pick: the basis stays orthonormal, even looking straight down`): step-009 chose
  its own degenerate `right` fallback, and that path is exactly what the
  "camera looking straight down" case takes, so it needed a guard (unit axes,
  perpendicular, ground still pickable at 90° elevation).
