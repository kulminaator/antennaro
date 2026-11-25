# step-001: config: a 5200 m world, a strided coverage grid, whole-map study range, limit colours

## How to perform this step

1. Read `src/config.js` in full first, then change the numbers that define the world.
   Every one of these is a knob the rest of the task reads, so put them in config and
   nowhere else:
   - `WORLD.worldSize: 5200`, `WORLD.gridSize: 349` (odd, so the map centre is still a
     vertex; cell stays about 15 m), `maxGridSize` raised to at least 401.
   - `WORLD.coverageStride: 2` - coverage is evaluated and draped on every second
     terrain vertex (about 30 m cells). Comment it with the measured reason: whole-map
     coverage on the 15 m grid measured 734 ms in Node, on a 30 m grid it has to come
     down near 150 ms.
   - `ANTENNA.siteLimitsM`: about +/-2500 m (leave room at the edge: the site must not
     be able to sit outside the height field), keep `siteStepM: 5`.
   - `RF.maxRangeLimitsM`: min 100, max = the map's half-diagonal rounded up
     (5200/2*sqrt(2) = 3677 -> 3800), and `RF.defaultMaxRangeM: 3800`, i.e. the default
     study range covers the whole map so the cap cannot bite unless the user asks.
   - `COLOURS.rangeLimit`: one clearly artificial colour for the study-range ring
     (something the coverage ramp never uses, e.g. a pale slate/white `#8f9bb0`).
   - `RF.noLinkHaloDb`: how far below sensitivity the drape still shows a hint of a
     failed link, about 12 dB. Cells weaker than that are not painted at all.
   - `VIEW`: scale the framing with the map - `fogNear`/`fogFar`, `cameraStart.distance`
     and `cameraLimits.maxDistance` by roughly the same factor as the world (2.2x), so
     the first frame shows the whole map the way it does today.
2. Do not touch any other file. Anything that breaks now (terrain looking flat, the
   camera inside the ground) belongs to step-002 and step-010.
3. Verify:
   - `npm run lint`.
   - `node -e` sanity: `generateTerrain()` reports `worldSize 5200`, `size 349`,
     `cellSize` about 14.9 m, `half` 2600.
   - `node tools/timebox.js -t 120 -- node tools/browser.js shot --url
     "http://127.0.0.1:<port>/index.html" --name cfg --width 1280 --height 720 --out
     .tmp/reach-config.png` with the server backgrounded, then look at the picture.
     Stop the browser and the server afterwards. The map should fill the frame the way
     it used to; if it looks like a small bump on a plain, note it here for step-002.

## Expected result

Config alone describes the bigger world; nothing else knows about it yet.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
