# step-009: pure picking maths (`src/app/pick.js`)

## How to perform this step

Create the maths that turns a pointer position into a point on the ground, and a
world point into a pointer position. It must be pure (runnable in bare Node) so
step-010 can pin it with textbook invariants, and it must mirror what
`app/viewport.js` does with the spherical camera state.

1. Create `src/app/pick.js` with a header comment stating `Layer: L1 (pure)` and
   that it mirrors the camera placement of `app/viewport.js` (+X east, +Y up,
   −Z north; `azimuthDeg` clockwise from north; NDC x right, y up).
2. Import `cross, dot, normalize, sub, add, scale, fromCompass` (as needed) from
   `../math/vec3.js` and `degToRad, clamp` from `../math/scalar.js`. Keep one
   named local constant with a comment: `const PLANE_PARALLEL_EPSILON = 1e-6;`
   (guard against a ray parallel to the ground plane).
3. Implement and export exactly these four functions plus one convenience:

   ```js
   /** Camera pose from the spherical state that app/viewport.js stores. */
   export function cameraPose({ azimuthDeg, elevationDeg, distance, targetX = 0, targetY = 0, targetZ = 0, fovDeg, aspect = 1 })
   // -> { position, viewDir, right, up, tanHalfFov, tanHalfFovX }
   ```
   - `position = target + fromCompass(azimuthDeg, elevationDeg, distance)` (same
     formula `viewport.applyCamera()` uses).
   - `viewDir = normalize(sub(position, target)) * -1` — i.e. from the eye
     towards the target.
   - `right = normalize(cross(viewDir, AXIS_Y))` where `AXIS_Y = {x:0,y:1,z:0}`;
     when `Math.abs(dot(viewDir, AXIS_Y)) > 1 - 1e-9` (looking straight down) fall
     back to a stable reference: use `right = {x: 1, y: 0, z: 0}` before
     normalising. Comment that this reproduces three.js' `lookAt` basis.
   - `up = normalize(cross(right, viewDir))`.
   - `tanHalfFov = Math.tan(degToRad(fovDeg / 2))`, `tanHalfFovX = tanHalfFov * aspect`.

   ```js
   /** World point -> normalised device coordinates ({-1..1}, y up) + depth. */
   export function projectToNdc(pose, point)   // -> { ndcX, ndcY, depth }
   ```
   `offset = sub(point, pose.position)`; `depth = dot(offset, pose.viewDir)`;
   `ndcX = dot(offset, pose.right) / (depth * pose.tanHalfFovX)`;
   `ndcY = dot(offset, pose.up) / (depth * pose.tanHalfFov)`.

   ```js
   /** Pointer NDC -> a ray in world space. */
   export function rayForNdc(pose, ndcX, ndcY) // -> { origin, dir }
   ```
   `dir = normalize(add(add(pose.viewDir, scale(pose.right, ndcX * pose.tanHalfFovX)), scale(pose.up, ndcY * pose.tanHalfFov)))`,
   `origin = pose.position`.

   ```js
   /** Ray ∩ horizontal plane y = planeY; null when parallel or behind the eye. */
   export function intersectPlaneY(ray, planeY) // -> {x, y, z} | null
   ```
   `if (Math.abs(ray.dir.y) < PLANE_PARALLEL_EPSILON) return null;`
   `const t = (planeY - ray.origin.y) / ray.dir.y; if (!(t > 0)) return null;`
   return `add(ray.origin, scale(ray.dir, t))`.

   ```js
   /** Convenience: pointer NDC -> ground position directly, or null. */
   export function pickGround(pose, ndcX, ndcY, planeY) // -> {x, z} | null
   ```
4. Register the module in `tools/lib/arch.js`:
   - in `LAYER_TABLE`, next to the `src/app/fields.js` row (it must come before
     the catch-all `^src/app/` L5 row — the first match wins):

     ```js
     Object.freeze({ match: /^src\/app\/pick\.js$/, layer: 1, name: 'picking maths' }),
     ```
   - in `PURE_PATTERNS` extend `/^src\/app\/(fields|state|presets)\.js$/` to
     `/^src\/app\/(fields|state|presets|pick)\.js$/`.
5. Make it reachable *in this same step*: lint fails any `src/` module that is
   not reachable from `src/main.js` (`not reachable from src/main.js: dead code or
   missing wiring`), so wire it straight into the browser test surface.
   In `src/app/testapi.js` add the import
   `import { cameraPose, pickGround } from './pick.js';` and one API method next
   to `heightAt`:

   ```js
   /** Ground point under a pointer position in NDC (-1..1, y up), or null. */
   pick: (ndcX, ndcY) => {
     const camera = controller.viewport.camera;
     const pose = cameraPose({
       ...controller.cameraState(), fovDeg: camera.fov, aspect: camera.aspect,
     });
     return pickGround(pose, ndcX, ndcY, controller.site().groundY);
   },
   ```

   (`camera.fov` / `camera.aspect` are the renderer's live values; the plane is
   the ground the mast stands on, which is what a drag needs.)
6. Verify:
   - `node -e "import('./src/app/pick.js').then((p) => { const pose = p.cameraPose({ azimuthDeg: 0, elevationDeg: 45, distance: 100, fovDeg: 52, aspect: 1.6 }); console.log(pose.position, p.projectToNdc(pose, { x: 0, y: 0, z: 0 }), p.intersectPlaneY(p.rayForNdc(pose, 0, 0), 0)); })"`
     → the target `{0,0,0}` projects to `ndcX ≈ 0, ndcY ≈ 0` and the centre ray
     hits the plane `y = 0` at the target.
   - `npm run lint` → `lint ok` (no reachability complaint about `pick.js`).
   - Live check with the shipped tooling:

     ```bash
     npm run serve -- --port 8124 --print-url
     node tools/browser.js eval "JSON.stringify(window.__sim.pick(0, 0))" --url http://127.0.0.1:8124/ --wait
     npm run serve -- stop
     ```

     Expect a finite `{ x, z }` close to the origin (the default camera looks at
     the site, so the centre of the screen is the mast's footprint).

## Expected result

A pure, tested-able picking module exists, is classified L1 and is on the purity
list.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
