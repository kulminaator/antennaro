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
