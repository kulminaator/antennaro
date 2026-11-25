# step-002: fields: `site.x` and `site.z` state fields

## How to perform this step

`src/app/fields.js` is the single source of truth for user-controllable fields
(GUIDELINES.md §6): the slider, the validator and the invalidation map all come
from one table entry.

1. In `src/app/fields.js`, insert two entries into `STATE_FIELDS` immediately
   after the `heightM` entry (both are `Placement` group, and moving the site
   rebuilds the ground because the flattened pad is baked into the height field):

   ```js
     Object.freeze({
       key: 'site.x', path: ['site', 'x'], label: 'Site east offset', kind: 'range',
       min: ANTENNA.siteLimitsM.min, max: ANTENNA.siteLimitsM.max, step: ANTENNA.siteStepM, unit: 'm',
       group: 'Placement', impact: [RECOMPUTE.TERRAIN, RECOMPUTE.COVERAGE],
       hint: 'Move the pad and the mast east (+X); negative is west. The flat pad and the coverage move with it.',
     }),
     Object.freeze({
       key: 'site.z', path: ['site', 'z'], label: 'Site south offset', kind: 'range',
       min: ANTENNA.siteLimitsM.min, max: ANTENNA.siteLimitsM.max, step: ANTENNA.siteStepM, unit: 'm',
       group: 'Placement', impact: [RECOMPUTE.TERRAIN, RECOMPUTE.COVERAGE],
       hint: 'Move the pad and the mast south (+Z); negative is north, towards the mountain.',
     }),
   ```

   `ANTENNA` is already imported in this file.
2. Do **not** add anything to `src/app/state.js` here — that is step-003.
3. Verify:
   - `node -e "import('./src/app/fields.js').then((m) => console.log(m.STATE_FIELDS.map((f) => f.key).join(' ')))"`
     lists `site.x site.z` right after `heightM`.
   - `npm run lint` → `lint ok` (the two keys are data only, so no layer or
     reachability complaint).

## Expected result

`STATE_FIELDS` contains `site.x` and `site.z` with the config-driven limits, the
`Placement` group and a `[terrain, coverage]` impact list.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
