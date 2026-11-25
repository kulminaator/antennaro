# step-006: `src/app/fresnelmesh.js`: the semi-transparent zone volume

## How to perform this step

1. New module `src/app/fresnelmesh.js`, header `Layer: L4 (render adapter)`. The name
   already matches `/mesh\.js$/` in `tools/lib/arch.js`, so it is L4 and allowed to
   import `three` with no arch change - but it must be *reachable* from `src/main.js`,
   which happens in step-008; until then the reachability lint will complain, so wire a
   construction call in this step (create it in the controller, hide it by default) or
   land the wiring in step-008 and accept a red lint only between the two.
   Prefer: create + hide here, toggle the visible flag in step-008.
2. Build the volume from `firstFresnelEnvelope` (pure, from step-002): a tube of
   `RENDER.fresnelSteps` rings, each ring `RENDER.fresnelRings` segments, radius
   `radiusM * RENDER.fresnelRadialExaggeration`, centred on the straight line from the
   antenna phase centre to the reference target. Cap both ends (the radius is 0 there,
   so a fan of triangles is enough - or simply let the rings collapse).
   Material: `MeshBasicMaterial({ transparent: true, opacity: RENDER.fresnelOpacity,
   depthWrite: false, side: DoubleSide, color: fresnelVolumeHex })`, `renderOrder`
   above the coverage overlay (2) so it reads through the terrain drape.
3. API: `createFresnelVolume()` -> `{ group, update({ origin, target, freqHz, steps,
   rings }), setVisible(bool), dispose() }`. Orientation must not bake in an
   assumption that the link is horizontal: build the tube along +Z in a local frame and
   orient the group with `lookAt` (or a quaternion) so tilting the antenna tilts the
   volume.
4. Verify: `npm run lint` (layer + reachability + hygiene), `npm run test:unit`, and a
   screenshot with the volume forced visible (temporarily via `window.__sim` or the
   constructor default) - the cigar must follow the aim, taper to the target, and not
   be a sphere. `.tmp/artifacts/` only; no docs changes in this step.

## Expected result

A pure-derived first-Fresnel-zone ellipsoid renders as a semi-transparent volume from
the antenna to the reference range, updated from the current aim, frequency and site.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- `src/propagation/fresnelmesh.js` (105 lines): a tube of revolution around a straight
  link, `FRESNEL.steps` slices along it and `FRESNEL.rings` around it, each circle's
  radius taken from `fresnelRadiusM()` in `propagation/rf.js` so the drawn volume and
  the per-cell criterion cannot drift apart. `MeshBasicMaterial` (unlit, `depthWrite:
  false`, `DoubleSide`, `FRESNEL.opacity`), `renderOrder 3`, starts hidden, disposed
  with the controller.
- No `tools/lib/arch.js` change was needed: `/mesh\.js$/` already classifies it as L4
  and already allows `import 'three'`.
- **It could not be committed on its own.** Lint's reachability rule fails any `src/`
  module that `main.js` cannot reach, so the step's real end state is "mesh exists and
  something imports it", which needed the controller to have room for the wiring - see
  the order swap recorded in task Comments. Step-007 happened first; this step closed
  with the wiring in step-008.
- `new THREE.MeshBasicMaterial({ colour })` is silently wrong: three.js material
  properties are spelled `color`. It logs one warning and paints anyway; the boot
  browser test fails the run on any console warning, which is the only reason it was
  noticed.
- Verified from the page: `(steps+1) * (rings+1)` = 49 * 29 = 1421 vertices, geometry
  rebuilt only with the link, `visible` driven by the display flag.
