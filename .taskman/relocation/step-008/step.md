# step-008: controller + viewport: the site flows through the pipeline

## How to perform this step

`src/app/controller.js` (L5) is where state becomes terrain, rig and coverage.
It currently calls `resolveSite(field, { heightM })` in four places (lines ~66,
78, 90, 97) and bakes only `gridSize/worldSize/seed` into the terrain signature.

1. In `src/app/viewport.js`: give `resetCamera` an optional centre so "Reset view"
   can re-centre on a relocated site:

   ```js
   function resetCamera(center = {}) {
     state = {
       ...DEFAULT_STATE,
       targetX: Number.isFinite(center.x) ? center.x : DEFAULT_STATE.targetX,
       targetY: Number.isFinite(center.y) ? center.y : DEFAULT_STATE.targetY,
       targetZ: Number.isFinite(center.z) ? center.z : DEFAULT_STATE.targetZ,
     };
     applyCamera();
   }
   ```

   Called with no argument it behaves exactly as before (the existing
   `browser: the camera can be driven and reset` test relies on that).
2. In `src/app/controller.js`:
   - Replace `let fieldSignature = ...` with a function so the signature is
     computed in one place, and include the site:

     ```js
     /** Everything the height field depends on, including the pad's position. */
     function terrainSignature() {
       return `${state.gridSize}:${state.worldSize}:${state.seed}:${state.site.x}:${state.site.z}`;
     }
     ```

   - Initial `generateTerrain({ size: state.gridSize, worldSize: state.worldSize,
     seed: state.seed, siteX: state.site.x, siteZ: state.site.z })`, and the same
     four extra-key form inside `rebuildTerrain()`; `fieldSignature` becomes a
     `let` updated as `fieldSignature = terrainSignature()`, compared against
     `terrainSignature()` in `rebuildTerrain()`.
   - Add one helper and use it for all four former `resolveSite(...)` call sites
     (initial `site` value, `rebuildTerrain`, `rebuildAntenna`,
     `recomputeCoverage`) — this also buys back lines for the 350-line budget:

     ```js
     /** The mast's footprint: the state's site position on the current ground. */
     function currentSite() {
       return resolveSite(field, { x: state.site.x, z: state.site.z, heightM: state.heightM });
     }
     ```

   - `case 'reset-view':` becomes
     `viewport.resetCamera({ x: site.x, y: site.groundY, z: site.z });`
   - `sceneInfo()` gains `sitePosition: [site.x, site.z],` (next to
     `terrainGrid`) so a browser test can see where the rig was placed.
   - `wc -l src/app/controller.js` must stay ≤ 350.
3. Verify:
   - `npm run lint` → `lint ok`.
   - End to end, with the shipped tooling:

     ```bash
     npm run serve -- --port 8123 --print-url
     node tools/browser.js eval "window.__sim.patch({ site: { x: 300, z: 200 } }); window.__sim.settle(); JSON.stringify({ site: window.__sim.state().site, padAtSite: window.__sim.heightAt(300, 200), centre: window.__sim.heightAt(0, 0), sitePosition: window.__sim.scene().sitePosition })" --url http://127.0.0.1:8123/ --wait
     npm run serve -- stop
     ```

     Expect `padAtSite` = 8 (`WORLD.siteElevation`: the pad moved with the site),
     `centre` ≠ 8, `sitePosition` `[300, 200]`.
   - `node tools/test.js --browser --only tests/browser/app-boot.test.js` still
     passes (camera reset, scene contents, no page errors).

## Expected result

Patching `site` regenerates the ground (pad under the new spot), moves the rig and
mast, recomputes coverage, and `scene().sitePosition` reports it.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- `node tools/staticserver.js start` (and therefore `npm run serve`) runs in the
  **foreground**, so the verification snippet in this step must background it and
  stop it afterwards:
  `(setsid node tools/staticserver.js start --port 8123 --quiet >/dev/null 2>&1 &)` …
  `node tools/staticserver.js stop`. Running it plainly just hangs the shell.
- Per GUIDELINES.md §10, wrap every manual `tools/browser.js` / server invocation
  in `node tools/timebox.js -t N -- …`; `tools/browser.js eval` otherwise keeps a
  persistent browser (`--name dev`) alive — finish with `node tools/browser.js stop`
  and confirm with `node tools/browser.js status --all`.
- Measured on this machine: `generateTerrain` 161×161 ≈ 33 ms, `computeCoverage` ≈
  69 ms — so a relocation commits in ~100 ms of work, which is the budget the drag
  throttle in step-012 has to respect.
