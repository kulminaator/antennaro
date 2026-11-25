# step-001: config: site placement constants and the camera FOV

## How to perform this step

Every tunable lives in `src/config.js` (GUIDELINES.md §4). This step adds the
numbers the relocation feature needs, plus the camera FOV that the picking maths
in step-009 must share with the renderer.

1. Read `README.md` and `GUIDELINES.md` §1/§4 (config centrality) so the naming
   matches the project's conventions.
2. In `src/config.js`, add four entries to the `ANTENNA` freeze (it is declared
   *after* `WORLD`, so it may read `WORLD.worldSize`):

   ```js
     /** Default footprint of the site: the map centre (+X east, +Z south). */
     defaultSiteXm: 0,
     defaultSiteZm: 0,
     /** How far the site may be relocated on each axis, metres from the centre. */
     siteLimitsM: Object.freeze({ min: -WORLD.worldSize / 2, max: WORLD.worldSize / 2 }),
     /** Step of the two placement sliders. */
     siteStepM: 5,
   ```

3. In the same file, add to `VIEW`: `cameraFovDeg: 52,` with a one-line comment
   ("vertical field of view of the perspective camera"). Then in
   `src/app/viewport.js` replace the literal in
   `new THREE.PerspectiveCamera(52, 1, 1, 20000)` with `VIEW.cameraFovDeg`
   (`VIEW` is already imported there), so picking maths can read the same number
   from config instead of duplicating a magic 52.
4. Verify:
   - `node -e "import('./src/config.js').then((m) => console.log(m.ANTENNA.siteLimitsM, m.ANTENNA.defaultSiteXm, m.VIEW.cameraFovDeg))"`
     prints `{ min: -1200, max: 1200 } 0 52`.
   - `grep -n "PerspectiveCamera" src/app/viewport.js` shows `VIEW.cameraFovDeg`.
   - `grep -rn "fovDeg\|PerspectiveCamera" src tools tests` finds no other copy
     of the literal 52.
   - `npm run lint` → `lint ok`.

## Expected result

`ANTENNA.defaultSiteXm/defaultSiteZm/siteLimitsM/siteStepM` and
`VIEW.cameraFovDeg` exist; the viewport builds its camera from the config FOV.
Nothing else changes behaviour yet.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
