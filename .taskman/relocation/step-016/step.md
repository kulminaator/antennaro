# step-016: URL parameters `?siteX=&siteZ=` and the HUD read-out

## How to perform this step

Relocation must be shareable from a URL (README: "Everything on the panel can be
set from the URL") and visible in the read-out panel.

1. In `src/main.js`, inside `readInitialState(params)`, after the `height` line,
   add:

   ```js
   if (params.get('siteX') || params.get('siteZ')) {
     initialState.site = {
       x: Number(params.get('siteX') ?? 0),
       z: Number(params.get('siteZ') ?? 0),
     };
   }
   ```

   and extend the file header's URL-parameter example line with `&siteX=400`.
2. In `src/ui/hud.js`:
   - add a first row to `STAT_ROWS`:
     `Object.freeze({ key: 'site', label: 'Site position' }),`
   - in `update()`, before the antenna numbers, render it with the compass words
     so the frame convention (+X east, +Z south) is not a mystery:

     ```js
     const site = state.site ?? { x: 0, z: 0 };
     set('site', `${Math.abs(site.x).toFixed(0)} m ${site.x >= 0 ? 'E' : 'W'} / `
       + `${Math.abs(site.z).toFixed(0)} m ${site.z >= 0 ? 'S' : 'N'}`);
     ```

     (`state` is already part of `update(data)`; the `??` keeps the HUD alive if
     it is ever fed a state without a site.)
3. Verify:
   - `npm run lint` → `lint ok`; both files stay ≤ 350 lines.
   - Serve and check both halves at once:

     ```bash
     npm run serve -- --port 8129 --print-url
     node tools/browser.js eval "JSON.stringify({ site: window.__sim.state().site, pad: window.__sim.heightAt(400, -150), hud: document.getElementById('hud').textContent.includes('400 m E') })" --url "http://127.0.0.1:8129/?siteX=400&siteZ=-150" --wait
     npm run serve -- stop
     ```

     Expect `site` `{"x":400,"z":-150}`, `pad` = `WORLD.siteElevation` (8) and
     `hud: true`.
   - `node tools/test.js --browser --only tests/browser/app-boot.test.js` still
     passes (the `?preset=` boot test uses the same query plumbing).

## Expected result

`?siteX=…&siteZ=…` boots the app with the mast elsewhere, and the HUD names the
site position in metres east/north-south.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
