# step-006: schema and controls: view labels and legend titles

## How to perform this step
1. Check `src/ui/schema.js` and `src/ui/controls.js` for anything that assumes three views or a
   continuous scale (section titles, help text, the display group) and update the wording to the
   two views. Confirm the coverage-view control renders the two labels from `fields.js`.
2. Verify by rendering the panel headlessly: start a server with
   `(setsid node tools/staticserver.js start --port 8137 --quiet > /dev/null 2>&1 &)`, then
   `node tools/browser.js eval` to read the `<select>` options for the coverage view and print them;
   stop the server with `node tools/staticserver.js stop`.

## Expected result
The panel offers exactly two coverage views with labels that say what the colours answer.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->

- No code change: none of the five presets touches a `display.*` key, so all five inherit
  `RF.defaultCoverageView`. Measured through the reducer - `site-sector`, `valley-reach`,
  `flat-field`, `mountain-shadow`, `bumps-hills` all resolve to `steps`, 0 rejected, 0 clamped,
  and `validatePresets(applyPatch, createInitialState())` returns `[]`.
- To keep it that way, step-009 adds a unit test: every preset must resolve to a view the field
  table offers. A preset that hard-codes `gradient` would otherwise be silently rejected at boot.
