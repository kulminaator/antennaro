# step-002: config + call sites: the ground no longer depends on the site

## How to perform this step

1. `src/config.js`, `WORLD` block: delete `sitePadRadius` and `sitePadBlendFactor`
   and the comment above them about the pad being cut level with the ground. Do not
   leave a "no pad any more" tombstone comment in config; the prose belongs in the
   README and GUIDELINES (step-006).
2. `src/app/controller.js`:
   - both `generateTerrain({...})` calls (the initial `field` and the one inside
     `rebuildTerrain`) stop passing `siteX`/`siteZ`;
   - `terrainSignature()` loses the site: `` `${state.gridSize}:${state.worldSize}:${state.seed}` ``
     and its comment no longer mentions the pad - say that the ground does not depend
     on where the mast stands, which is why moving it is cheap;
   - `rebuildTerrain()` still re-resolves `site` (the ground under the mast can change
     when the *terrain* changes, e.g. a new seed) - leave that alone.
3. `src/app/fields.js`: the two placement entries (`site.x`, `site.z`) now impact the
   antenna and the coverage, not the terrain:
   `impact: [RECOMPUTE.ANTENNA, RECOMPUTE.COVERAGE]`. Re-read `impactedStages` in
   `src/app/state.js` to confirm the antenna stage marks coverage dirty anyway, and
   that nothing relies on the terrain stage to move the rig (`markDirty` in the
   controller cascades terrain -> antenna -> coverage, so losing the terrain edge is
   safe). Reword the two hints: they still say "move the mast east (+X)..." but must
   not mention a pad or the coverage "going with the pad".
4. Check for other site-shaped-ground assumptions: `grep -rn "siteX\|siteZ" src/` -
   `src/main.js` reads the `?siteX`/`?siteZ` URL parameters into `state.site`; that
   stays. Anything else that passes a site into a terrain call must go.
5. Verify:
   - `npm run lint`; `timeout 300 npm run test:unit` (pad tests may still fail - that
     is step-004; anything else failing now is a real break).
   - Live, timeboxed, with the server backgrounded:

     ```bash
     (setsid node tools/staticserver.js start --port 8133 --quiet > /dev/null 2>&1 &)
     node tools/timebox.js -t 200 -- node tools/browser.js eval "EXPR" --name pad --url http://127.0.0.1:8133/index.html
     ```

     In one expression: read `heightAt` at three fixed points, `patch({site:{x:365,z:-400}})`,
     `settle()`, read the same three points again and `site().groundY`; assert the
     three heights are unchanged and `groundY` equals the terrain height at the new
     site. Also confirm the frame loop stays `active` after a relocation (the coverage
     stage still runs).
   - `node tools/browser.js stop --all` afterwards.

## Expected result

Nothing in the running app asks the terrain about the site: relocating patches state,
moves the rig and recomputes coverage, and never regenerates the height field.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
