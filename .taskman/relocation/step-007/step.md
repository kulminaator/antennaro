# step-007: unit tests: the pad sits under a moved site

## How to perform this step

Add the terrain-side invariant that the pad belongs to the site, not to the
origin.

1. Append to `tests/unit/terrain.test.js` (it already imports `WORLD`,
   `createTerrainContext`, `heightAt`, `generateTerrain`, and has an `approxEqual`
   helper — reuse them; add imports only if genuinely missing):

   ```js
   test('terrain: the flattened pad travels with the site', () => { ... });
   ```

   Assertions:
   - a context built with `siteX: 400, siteZ: -260` gives
     `heightAt(400, -260, ctx) === WORLD.siteElevation` and the same value at
     `heightAt(400 + pad, -260, ctx)` and `heightAt(400, -260 - pad, ctx)` where
     `pad = WORLD.sitePadRadius / 2` (the pad is level, so the mast cannot float
     wherever it is dragged);
   - with that moved context `Math.abs(heightAt(0, 0, ctx) - WORLD.siteElevation) > 0.5`
     — with the site gone, the map centre is natural ground again (comment:
     'the pad is a property of the site, not of the map');
   - the default context (no `siteX`/`siteZ` arguments) still has its level pad at
     the origin: `heightAt(0, 0, defaultCtx) === WORLD.siteElevation`;
   - the zones do not move with the site: `zoneAt(0, -probe, ctx)` is still
     `ZONES.MOUNTAIN` with `probe` taken from the existing zone test's style, i.e.
     relocating the antenna does not relocate the mountain.
2. Verify: `node --test --test-reporter=spec tests/unit/terrain.test.js` and then
   `npm run test:unit` (unit suite green).

## Expected result

The unit suite pins that the pad follows `siteX`/`siteZ` while the terrain zones
stay anchored to the map centre.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
