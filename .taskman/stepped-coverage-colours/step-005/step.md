# step-005: presets, index.html, testapi, main: the last view references

## How to perform this step
1. `grep -rn "'gradient'\|'bands'\|view=" src/ index.html` and update what is left: `src/main.js`
   URL parsing (run the value through `coverageViewOf` so `?view=bands` and `?view=gradient` still
   load), `src/app/presets.js` patches that set a view, `src/app/testapi.js` if it exposes the view,
   and any copy in `index.html`.
2. A preset must not silently change the colour scale (README says a preset is ground, antenna and
   aim) - if a preset patch sets `coverageView`, keep it only where the preset is about the zone
   view; otherwise drop it and note which preset it was in the step comments.
3. Verify: `grep -rn "'gradient'" src/ index.html` is empty apart from the alias table in `state.js`;
   `node tools/lint.js` passes.

## Expected result
Nothing outside the alias table mentions the deleted view, and old links still resolve.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->
