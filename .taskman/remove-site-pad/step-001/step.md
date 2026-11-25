# step-001: generators.js: the height field is the terrain, the pad is gone

## How to perform this step

1. Read `src/terrain/generators.js` in full first, then cut the pad out of it:
   - `createTerrainContext()`: delete `padRadius`, `padBlendFactor`, `siteX`, `siteZ`
     and the `padElevation` computation - the context becomes
     `Object.freeze(base)` with the seed, `worldSize`, `half` and `blendHalfDeg`.
     Drop `siteX`/`siteZ` from the destructured options entirely.
   - Delete `gradePadLevel()`.
   - Rename the current `naturalHeightAt()` to `heightAt()` (it is now the only
     surface) and delete the old padded `heightAt()`. Keep the exports tidy: the
     module exports `heightAt`, `sectorWeights`, `createTerrainContext`,
     `generateTerrain` (and whatever it already exported); nothing exports a
     `naturalHeightAt` any more.
   - `generateTerrain(options)`: drop `siteX`/`siteZ` from the options and fill the
     field with `heightAt(x, z, ctx)`.
   - Rewrite the module header: the zones belong to the map and the map is
     independent of where the antenna stands. Say why the pad is gone - a level pad
     on a ridge flank is a landform (measured: 99.7 m of fill 57 m from the mast at
     site (365, -400)) and it moved with the mast.
2. Grep for stragglers: `grep -rn "naturalHeightAt\|padElevation\|padRadius\|padBlendFactor" src/`
   must come back empty. Callers in `src/app/controller.js` still pass
   `siteX`/`siteZ` into `generateTerrain` - harmless extra properties, step-002
   removes them; do not touch the controller in this step.
3. Verify:
   - `npm run lint` (expect failures only from tests that still name the pad, if the
     lint tool checks tests - otherwise clean).
   - Numbers, in bare Node:

     ```bash
     node -e "Promise.all([import('./src/terrain/generators.js'), import('./src/config.js')]).then(([g, c]) => {
       const a = g.generateTerrain({ siteX: 365, siteZ: -400 });
       const b = g.generateTerrain({ siteX: 0, siteZ: 0 });
       let diff = 0; a.forEachCell((x, z, h, i) => { diff = Math.max(diff, Math.abs(h - b.heights[i])); });
       console.log('identical fields:', diff === 0, '| height at (365,-400):', a.sample(365, -400).toFixed(1));
     });"
     ```

     `identical fields` must be `true` - that is the whole point of the task.

## Expected result

`heightAt()` is the zone surface; the terrain generators do not know a site exists;
two site positions produce byte-identical height fields.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- `generateTerrain`/`createTerrainContext` no longer accept `siteX`/`siteZ` at all, so
  the step's "two site positions, identical fields" check degenerates — the API cannot
  express a site-shaped ground any more. The unit test in step-004 should still assert
  it at the API level: `generateTerrain({ siteX: 365, siteZ: -400 })` must equal
  `generateTerrain({})`, so a future patch that reintroduces the option gets caught.
- Removing the pad also removed the only `lerp` use in this file; lint does **not**
  report unused imports, so the import list was cleaned by hand.
- Measured after the change, default seed: ground at the ridge shoulder (365, -400) is
  149.7 m and 60 m east of it is 72.5 m — the 77 m cliff the pad used to fill in is
  back.
- The file still imports `HeightField` as a value, so the `@returns {HeightField}`
  JSDoc survives the removal of the local `@typedef`.
