# step-005: unit tests: relocating the site through the reducer

## How to perform this step

Pin the new state behaviour with invariant tests (GUIDELINES.md §9: no golden
values, assert limits and relationships).

1. Append to `tests/unit/state.test.js` (imports at the top already provide
   `ANTENNA`, `WORLD`, `applyPatch`, `createInitialState`, `impactedStages`,
   `RECOMPUTE`, `buildPanel`; add to the import list if one is missing):

   - `test('state: the site can be relocated, and the offset stays inside the map')`
     - `createInitialState().site` deep-equals
       `{ x: ANTENNA.defaultSiteXm, z: ANTENNA.defaultSiteZm }`.
     - `applyPatch(initial, { site: { x: 300, z: -200 } })`: `ok === true`,
       `changed` contains `site.x` and `site.z`, `state.site` deep-equals
       `{ x: 300, z: -200 }`.
     - far-out values clamp into the world, not past it: with
       `{ site: { x: 1e6, z: -1e6 } }` expect
       `state.site.x === ANTENNA.siteLimitsM.max`,
       `state.site.z === ANTENNA.siteLimitsM.min` and two `clamped` entries.
     - junk is rejected: `applyPatch(initial, { site: 'nowhere' })` → `ok false`
       with a `site` rejection; `{ site: { y: 5 } }` → rejection key `site.y`,
       `changed.length === 0`.
   - `test('state: moving the site dirties the ground and the coverage')`
     - `impactedStages(['site.x', 'site.z'])` contains `RECOMPUTE.TERRAIN` and
       `RECOMPUTE.COVERAGE` (the pad is baked into the height field, so the
       terrain really has to be regenerated).
   - `test('panel: the placement group exposes both site offsets')`
     - `buildPanel(createInitialState())`, find group `id === 'placement'`, assert
       its field keys start with `['site.x', 'site.z']` (use
       `assert.deepEqual(keys.slice(0, 2), ['site.x', 'site.z'])`) and that both
       descriptors carry `min === ANTENNA.siteLimitsM.min` and
       `max === ANTENNA.siteLimitsM.max` — the slider and the validator must read
       one table.
2. Follow the file's existing naming style (`state: ...`, `panel: ...`) and add a
   short comment where a number comes from config rather than from a calculation.
3. Verify: `node --test --test-reporter=spec tests/unit/state.test.js` then
   `npm run test:unit` (whole unit suite green, nothing else broken).

## Expected result

The unit suite proves the reducer + panel contract for the relocated site.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- `tests/unit/state.test.js` is now **315 of 320 allowed lines** (tests/ budget).
  The next test added to this file must trigger the split GUIDELINES.md §3 calls
  for (e.g. a separate `tests/unit/schema.test.js`), not a squeezed assertion.
