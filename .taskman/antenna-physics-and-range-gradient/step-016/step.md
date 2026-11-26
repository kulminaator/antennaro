# step-016: `display.coverageView` select: fields, state default, URL parameters

## How to perform this step

1. In `src/app/fields.js` add a field
   `display.coverageView`, kind `select`, group `Display`, impact `DISPLAY`, options
   `bands | gradient | zone` labelled `signal bands`, `range gradient (yellow to pink)`,
   `Fresnel zone clearance`, default from config (add `RF.defaultCoverageView: 'gradient'`
   so the default is a knob, not a string in two places).
2. Change `display.showFresnel`'s label to `Fresnel zone volume` and rewrite its hint: the
   volume is the tube; which colours the drape wears is the coverage view.
3. In `src/app/state.js` add `coverageView: RF.defaultCoverageView` to the `display` block
   of the initial state. `coerce()` already rejects an unknown select value; add a test in
   `tests/unit/state.test.js` that patching `display: { coverageView: 'rainbow' }` is
   rejected with `invalid value` while each of the three real values is accepted, and that
   the default is inside its own options (the rule that caught the seed bug).
4. In `src/main.js`: `?view=bands|gradient|zone` sets the view; `?fresnel=1` keeps its old
   meaning *and* stays useful, so it sets the volume on and the view to `zone`; update the
   header comment that documents the URL.
5. Verify: `node tools/timebox.js -t 200 -- node --test tests/unit/state.test.js` green,
   `npm run lint` green, and a one-line `withApp` probe showing
   `state().display.coverageView === 'gradient'` at boot with no page errors.

## Expected result

One field says how the drape is painted, three values, no impossible combinations, and a
URL that can still reproduce any picture.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
