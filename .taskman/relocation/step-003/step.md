# step-003: state: `site` in the reducer with nested patch support

## How to perform this step

Teach the reducer (L2, pure) to carry the site position, exactly the way it
already carries `display`.

1. In `src/app/state.js`:
   - In `baseState()`, directly after `heightM: ANTENNA.defaultHeightM,` add:

     ```js
     site: { x: ANTENNA.defaultSiteXm, z: ANTENNA.defaultSiteZm },
     ```

   - Add `'site'` to `STRUCTURAL_KEYS` (so `patch({ site: {...} })` is accepted
     and an unknown sub-key still lands in the "unknown state key" rejection).
   - In `applyPatch()`, add a `site` branch right after the existing `display`
     branch, mirroring it:

     ```js
     if (key === 'site') {
       if (!rawValue || typeof rawValue !== 'object') {
         rejected.push({ key, reason: 'site must be an object' });
         continue;
       }
       const sitePatch = {};
       for (const [name, value] of Object.entries(rawValue)) sitePatch[`site.${name}`] = value;
       const nested = applyPatch(next, sitePatch);
       next = nested.state;
       changed.push(...nested.changed);
       rejected.push(...nested.rejected);
       clamped.push(...nested.clamped);
       continue;
     }
     ```

   `impactedStages()` needs no change: it reads `IMPACT_BY_KEY`, which step-002
   already fed with `site.x` / `site.z` → `[terrain, coverage]`.
2. Update the module header comment only if it lists state shape (it does not).
3. Verify with one Node one-liner (must work in bare Node — this module is in
   `PURE_PATTERNS`):

   ```bash
   node -e '
   import("./src/app/state.js").then((m) => {
     const s0 = m.createInitialState();
     console.log("default site", s0.site);
     const moved = m.applyPatch(s0, { site: { x: 300, z: -200 } });
     console.log("changed", moved.changed, "state", moved.state.site, "ok", moved.ok);
     const over = m.applyPatch(s0, { site: { x: 99999 } });
     console.log("clamped", over.clamped, over.state.site);
     const junk = m.applyPatch(s0, { site: { nope: 1 } });
     console.log("rejected", junk.rejected);
     console.log("stages", m.impactedStages(["site.x"]));
     console.log("override", m.createInitialState({ site: { x: 400 } }).site);
   });'
   ```

   Expect: `default site { x: 0, z: 0 }`; `changed ['site.x','site.z']` with
   `{x:300,z:-200}`; `clamped` reports `site.x → 1200`; `rejected` reports
   `site.nope`; `stages ['terrain','coverage']`; `override { x: 400, z: 0 }`.
4. `npm run lint` → `lint ok`.

## Expected result

`state.site` exists, validates, clamps into the map, rejects junk sub-keys, and a
change to it dirties the terrain (and therefore coverage) stages.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
