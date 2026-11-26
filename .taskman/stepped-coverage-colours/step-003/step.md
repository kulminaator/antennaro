# step-003: coveragemesh.js: one signal paint path

## How to perform this step
1. In `src/propagation/coveragemesh.js` remove the `rangeGradientRgb` import and the
   `view === 'gradient'` branch; the view is now `'steps'` or `'zone'`, so the normaliser at
   line ~137 becomes `options.view === 'zone' ? 'zone' : 'steps'` and every other value paints steps.
2. Update the module docstring and the `update()` JSDoc `@param` to the two views, keeping the
   existing argument for why one field (not a stack of marks) decides a pixel's meaning, and add
   that the signal scale is stepped because a continuous red-to-yellow ramp cannot be read for
   order (measured: 11.5 CIEDE2000 between the closest of four steps, 9.5 for five).
3. Verify: `node tools/lint.js` passes; `grep -n gradient src/propagation/coveragemesh.js` is empty.

## Expected result
The drape paints four steps or the zone ramp, from one field, with no continuous path left.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->
