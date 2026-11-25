# step-009: HUD: name the binding limit, mark clipped directions

## How to perform this step

1. Read `src/ui/hud.js` (rows + the per-direction table) and the stats it reads from
   `src/app/reports.js`.
2. Add a **Range limit** row whose text says which limit the map is showing, taken from
   `stats.limitingFactor`:
   - `budget` -> `link budget 2.2 km` (the free-space figure from `stats.budgetRangeM`),
     i.e. what the user wants to see;
   - `study-range` -> `study range 1.4 km (link reaches 2.2 km)`;
   - `map-edge` -> `map edge 2.6 km (link reaches 3.1 km)`.
   The sentence has to make the artificial limit obvious and give the number that would
   apply without it, because that is precisely what the user could not infer.
3. In the per-direction table, mark a range that touches a boundary with a leading `>=`
   and put the reason in the row's title attribute or a footnote line under the table
   (`>= means the link was still alive where we stopped looking`). Use
   `stats.studyRangeM`, `field.half` and `stats.budgetRangeM` to decide, not a guess.
4. Wording that the new denominators force: the "Cells with link" row must say what the
   share is *of* (whole map now - prefer an absolute count plus the share of the map),
   and the Fresnel row must read "of linked cells". Keep the legend honest with
   `RF.noLinkHaloDb` (the halo band is "no link, close").
5. Verify: `npm run lint`; `timeout 300 npm run test:unit` (state/panel tests that count
   HUD rows may need their expectations updated - update them deliberately); then live,
   timeboxed: read the HUD rows through `window.__sim`-backed state (or `scene()`/
   `coverage()`) at the default range and at 1400 m and confirm the row changes from
   `link budget ...` to `study range ...`; screenshot `.tmp/reach-hud.png`, look at it,
   stop browser and server.

## Expected result

One HUD line answers "is this the antenna's reach or the app's work area?" without the
user having to guess, and the direction table stops reporting clipped ranges as if they
were maxima.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- New `Range limit` row between "Free-space range" and "Cells with link", one sentence per
  `stats.limitingFactor`, always quoting the number that would apply without the limit:
  `link budget 1.67 km - the drape ends where the link does`,
  `our study range 1.40 km - the link would reach 1.67 km`,
  `edge of the map 0.30 km - the link would reach 11.82 km`.
- The two-share wording the new denominators forced is in, each row labelled with what it
  is a share of: `Cells with link: 1951 of 30624 points (6.4 % of the map)` and a new row
  `Served within reach: 21.3 % of ground a link could reach`. The Fresnel row now reads
  `% of linked points clear`. Sector cells carry a `title` naming their denominator too.
- `>=` marking plus a footnote under the direction table. The decision is **domain**, not
  presentation, so it is not in `hud.js`:
  - `rayBoxExitDistance(origin, direction, half)` in `src/math/vec3.js` - how far a
    horizontal ray travels before it leaves the square map;
  - `markClippedSectors(sectors, { siteX, siteZ, half, studyRangeM, cellSpan })` in
    `src/propagation/coveragestats.js` - each sector gains `limitM`, `limitKind` and
    `clippedBy`, computed from the mast's actual position, so a mast 300 m from the west
    wall reports 300 m west and 4900 m east rather than a symmetric guess;
  - `computeCoverage` applies it, so `coverage.stats.sectors` is the same everywhere:
    HUD, `window.__sim.coverage()`, and the unit tests.
  `hud.js` only formats. Live reading at (-2300, 0): `W 100 % >= 323 m`,
  `N 85 % >= 1400 m`, footnote `>= the link was still alive where we stopped looking:
  map-edge at 0.30 km (a W link would go further).`
- Two unit tests came with it: `vec3: a horizontal ray knows where the map ends`
  (cardinals, the 45 deg diagonal at half * sqrt 2, an off-centre point seeing a 400 m
  near wall and a 1600 m far wall, a zero direction giving Infinity) and
  `coverage: a direction that ran out of map says so`, which also checks that widening the
  work area flips a sector from `study-range` to `map-edge` and that a sector is only ever
  marked when its range really touches the limit it names.
- `RF.noLinkHaloDb` in the step text no longer exists - step-005 deleted it and the legend
  row already carries `alpha` from `RF.noLinkAlpha`, so the halo is honest by construction.
- The screenshot's `Range limit` row wraps to two lines at the panel width; left as is,
  because shortening it would mean dropping either the limit or the number it hides.
- `npm run lint` ok, `npm run test:unit` all 12 files pass, live check on port 8148 with
  no console errors; browser and server stopped afterwards.
