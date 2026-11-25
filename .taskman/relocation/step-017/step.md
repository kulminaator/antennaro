# step-017: documentation: README.md and GUIDELINES.md

## How to perform this step

GUIDELINES.md §11: a user-visible change goes in README.md, a structural change
here. Read both files first (they are the contract) and keep the existing voice:
plain, concrete, no marketing.

1. `README.md`:
   - Intro: the antenna "stands on a flattened pad in the middle of a map" — add
     that the pad and mast can be dragged anywhere on the map and that the zones
     stay put.
   - **Controls** table: the *Placement and aim* row must mention the two new
     sliders (site east / site south offsets, ±1200 m, step 5 m).
   - **Buttons** list: add **Reset placement** (site back to the map centre) next
     to *Reset view*.
   - The table under **Move the camera**: add a row for the new gesture, e.g.
     `Drag the mast | Move the site (the pad, mast and coverage follow)` and note
     the cursor changes to a grab hand over the hardware, and that the sliders and
     dragging write the same state.
   - **Shareable links**: add `siteX` / `siteZ` rows to the parameter table
     ("site position east / south, metres") and extend the example URL.
   - *What you see* / *Domain notes* wording where the "site pad" is described:
     the pad is flattened around the site, so it moves when the site moves.
2. `GUIDELINES.md`:
   - §2 directory layout: the `app/` line gains the new modules
     (`pick` pointer↔world maths, `relocate` drag adapter).
   - §3 layer table: L1 row mentions `app/pick.js` (pure pointer↔world maths) and
     the L4 row `app/relocate.js` next to `orbit`.
   - §4 config centrality: `ANTENNA.defaultSiteXm/defaultSiteZm/siteLimitsM/siteStepM`
     and `VIEW.cameraFovDeg` are the new shared constants (the FOV moved into
     config precisely so picking and rendering agree).
   - §5 coordinates: state that the site is a position (`state.site`), not the
     origin, and that `app/pick.js` reproduces the `lookAt` basis — grabbing the
     sign of `right` mirrors the drag, exactly like `axisX = -right` mirrors the
     pattern.
   - §7 domain notes: the site pad is flattened around the (movable) site;
     relocating dirties the terrain stage because the pad is baked into the height
     field.
   - §9 browser test conventions: add `site`, `pick`, `grabSite`, `dragSiteTo`,
     `releaseSite`, `dragState` to the `window.__sim` method list.
3. Verify: `npm run lint` → `lint ok`; re-read the two changed sections for
   statements that are not true of the code (e.g. don't claim the camera follows
   the site — it does not; *Reset view* re-centres on the site).

## Expected result

Both documents describe relocation: how to use it (README) and which rule/module
owns it (GUIDELINES).

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
