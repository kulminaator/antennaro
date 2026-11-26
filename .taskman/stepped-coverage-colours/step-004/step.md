# step-004: app: the view vocabulary becomes steps | zone, with legacy aliases

## How to perform this step
1. In `src/app/state.js`, update the `coverageView` comment to `'steps' | 'zone'` and add a small
   exported normaliser `coverageViewOf(value)` that maps `'zone'` to `'zone'`, `'steps'`, `'bands'`
   and `'gradient'` to `'steps'` (the last two so old URLs and bookmarks still paint a picture),
   and anything else to `RF.defaultCoverageView`.
2. Use it in the reducer wherever a patch touches `display.coverageView` (find the display patch
   branch), so state can never hold a view the mesh does not know, and in `src/app/reports.js`
   `coverageViewOf()` - delete its local version and import the shared one.
3. In `src/app/fields.js`, replace the three coverage-view options with two: `steps` labelled
   `signal steps (red to yellow)` and `zone` labelled `Fresnel zone clearance`.
4. Verify: `node tools/lint.js`; `node -e` import state.js, apply a patch `{ coverageView: 'gradient' }`
   and print the resulting `state.display.coverageView` - it must be `steps`, and a nonsense value
   must land on the default.

## Expected result
`display.coverageView` is a validated two-value field, and legacy `bands`/`gradient` URLs still work.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->
