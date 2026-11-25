# step-006: terrain: the flattened pad follows the site

## How to perform this step

`terrain/generators.js` (L1, pure) flattens the ground within
`WORLD.sitePadRadius` of the **origin**; the pad must be flattened around the
**site** instead, while the four compass zones stay keyed to the map centre (they
are the world, not the antenna).

1. In `src/terrain/generators.js`:
   - `createTerrainContext({ seed, worldSize })` →
     `createTerrainContext({ seed, worldSize, siteX = 0, siteZ = 0 })`, and add to
     the frozen context:

     ```js
       siteX,
       siteZ,
     ```

     with a comment: "the flattened pad is centred on the site; the zones are
     centred on the map".
   - In `heightAt()`, change the pad blend to measure distance from the site:

     ```js
       const radialBlend = smoothstep(ctx.padRadius, ctx.padRadius * 2.4,
         Math.hypot(x - ctx.siteX, z - ctx.siteZ));
     ```

   - In `generateTerrain(options = {})`, destructure `siteX = 0, siteZ = 0` and
     pass them to `createTerrainContext({ seed, worldSize, siteX, siteZ })`.
   - Touch the header comment: the pad is flattened around the site, which the
     user can move (defaults to the map centre).
2. Do not touch `sectorWeights()`, `zoneAt()` or the ridge/valley/bump maths:
   zones stay where they are.
3. Verify in bare Node (this module is in `PURE_PATTERNS`, so it must run there):

   ```bash
   node -e '
   import("./src/terrain/generators.js").then(async (g) => {
     const { WORLD } = await import("./src/config.js");
     const here = g.createTerrainContext({ seed: 20251105, worldSize: 2400 });
     const moved = g.createTerrainContext({ seed: 20251105, worldSize: 2400, siteX: 300, siteZ: -200 });
     console.log("default pad centre", g.heightAt(0, 0, here), "edge", g.heightAt(300, -200, here));
     console.log("moved pad centre", g.heightAt(300, -200, moved), "half pad", g.heightAt(300 + WORLD.sitePadRadius / 2, -200, moved));
     console.log("old centre is natural ground again", g.heightAt(0, 0, moved));
     const f = g.generateTerrain({ size: 161, worldSize: 2400, seed: 20251105, siteX: 300, siteZ: -200 });
     const ix = Math.round(f.cellX(300)), iz = Math.round(f.cellZ(-200));
     console.log("grid pad cell", f.heightAtCell(ix, iz), "stats", f.stats().mean.toFixed(3));
   });'
   ```

   Expect: `default pad centre 8` (= `WORLD.siteElevation`); `moved pad centre 8`
   and `half pad 8`; the old centre no longer exactly 8 once the site has moved
   away; the generated grid carries the pad at the moved cell.
   - Regression: `npm run test:unit` — the existing
     `terrain: the site pad is flat so the mast does not float` test must still
     pass (defaults keep the pad at the origin).

## Expected result

`generateTerrain`/`heightAt` accept `siteX`/`siteZ` and flatten the pad around
that point; with the defaults nothing moves.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
