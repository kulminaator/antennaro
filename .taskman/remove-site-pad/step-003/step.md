# step-003: site.js: the mast foot sits on natural ground everywhere

## How to perform this step

1. Read `src/terrain/site.js` (it is short). `resolveSite()` already sets
   `groundY = field.sample(x, z)`, so no maths change is needed - but the header
   comment still describes the pre-pad world. Update it: the site is the mast foot on
   the **natural ground**; `groundY` is the same bilinear sample the terrain mesh and
   the coverage grid use, so the mast cannot float above or sink into the drawn
   surface, and there is no grading to explain.
2. Note the consequence in the comment where it matters: because the ground is
   untouched, `heightM` is measured from real ground - on a ridge flank that means the
   phase centre can be level with, or below, the ridge top a few metres away. That is
   the honest picture, not a bug to grade away.
3. Verify numerically over nasty geometry, in bare Node - the mast foot must equal the
   drawn surface at every spot, and the phase centre must be `heightM` above it:

   ```bash
   node -e "Promise.all([
     import('./src/terrain/generators.js'), import('./src/terrain/site.js'), import('./src/config.js'),
   ]).then(([g, s, c]) => {
     const field = g.generateTerrain();
     for (const [x, z] of [[0,0],[365,-400],[0,-900],[0,900],[-800,-800],[1100,200]]) {
       const site = s.resolveSite(field, { x, z, heightM: 10 });
       const drawn = field.sample(site.x, site.z);
       console.log(x, z, 'groundY', drawn.toFixed(2), '| on surface:', site.groundY === drawn,
         '| y', site.y.toFixed(2), '| offset', (site.y - site.groundY).toFixed(2));
     }
   });"
   ```

   Every line must report `on surface: true` and `offset 10.00`.
4. Also check the extremes the clamp handles: `resolveSite(field, { x: 99999, z: NaN })`
   must clamp to the map edge and fall back to 0 without throwing (existing behaviour,
   just confirm it still holds).

## Expected result

`resolveSite()` is documented and verified as "the mast foot on natural ground", with
no reference to a pad anywhere in `src/terrain/`.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
