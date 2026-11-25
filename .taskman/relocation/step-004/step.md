# step-004: panel schema: show the two site sliders

## How to perform this step

`src/ui/schema.js` (L2, pure) turns state into widget descriptors; `ui/controls.js`
paints whatever it returns, so adding the two fields here is all the DOM work the
sliders need.

1. In `src/ui/schema.js`, in `buildPanel()`'s `placement` group, extend `fields`
   so the two new offsets come first (where → how high → which way it looks):

   ```js
       fields: [
         fieldByKey(state, 'site.x'),
         fieldByKey(state, 'site.z'),
         fieldByKey(state, 'heightM'),
         { ...fieldByKey(state, 'aim.azimuthDeg'), disabled: !aimEnabled },
         fieldByKey(state, 'aim.tiltDeg'),
       ],
   ```

2. Extend that group's note so the panel explains the new interaction as well as
   the sliders. Replace the ternary note with the ternary **plus** a fixed
   sentence, e.g. build it as:

   ```js
       note: `${aimEnabled
         ? 'The beam is a template: the model combines an H-plane and an E-plane cut.'
         : 'This design radiates equally in all compass directions, so azimuth only turns the hardware.'} `
         + 'Drag the mast on the map, or use the two offset sliders to move the whole site.',
   ```

3. Verify:
   - `node -e "import('./src/ui/schema.js').then(async (s) => { const { createInitialState } = await import('./src/app/state.js'); const p = s.buildPanel(createInitialState()); const g = p.find((x) => x.id === 'placement'); console.log(g.fields.map((f) => f.key).join(' ')); console.log(g.note); })"`
     prints `site.x site.z heightM aim.azimuthDeg aim.tiltDeg` and the new note.
   - `npm run lint` → `lint ok`.

## Expected result

The *Placement and aim* group offers `site.x` and `site.z` sliders (values read
from state, limits from `STATE_FIELDS`), and its note mentions dragging.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
