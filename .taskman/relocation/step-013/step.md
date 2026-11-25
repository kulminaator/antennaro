# step-013: `reset-site` action and the *Reset placement* button

## How to perform this step

Give the user a one-click way back to the map centre, on the same action channel
as `new-seed` / `reset-view` / `reset-all`.

1. In `src/app/controller.js`:
   - extend the config import to `import { ANTENNA, VIEW } from '../config.js';`
   - add a case to `action()` next to `'reset-view'`:

     ```js
     case 'reset-site':
       patch({ site: { x: ANTENNA.defaultSiteXm, z: ANTENNA.defaultSiteZm } });
       settle();
       return { ok: true, site: state.site };
     ```

     (`reset-all` already rebuilds from `createInitialState()`, so it resets the
     site too — no change needed there.)
2. In `src/ui/controls.js`, add the button between *Reset view* and *Save PNG*:

   ```js
   Object.freeze({ action: 'reset-site', label: 'Reset placement' }),
   ```

   `buildButtons()` renders `BUTTONS` in order, so no DOM work is needed.
3. Verify:
   - `npm run lint` → `lint ok`; line budgets hold (`controller.js` ≤ 350).
   - Live: `npm run serve -- --port 8127 --print-url` then

     ```bash
     node tools/browser.js eval "window.__sim.patch({ site: { x: 500, z: -300 } }); const before = JSON.stringify(window.__sim.state().site); const r = window.__sim.action({ type: 'reset-site' }); JSON.stringify({ before, result: { ok: r.ok, site: r.site }, after: window.__sim.state().site })" --url http://127.0.0.1:8127/ --wait
     npm run serve -- stop
     ```

     Expect `before` `{"x":500,"z":-300}` and `after` `{"x":0,"z":0}` with
     `ok: true`.
   - Panel wiring: `node tools/browser.js eval "JSON.stringify(window.__sim.controls())"`
     still lists the state keys (buttons are not widgets, so the list is
     unchanged) and `node tools/test.js --browser --only tests/browser/app-boot.test.js`
     passes.

## Expected result

*Reset placement* exists in the panel and as the `reset-site` action, and puts the
pad, mast and coverage back at the map centre.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
