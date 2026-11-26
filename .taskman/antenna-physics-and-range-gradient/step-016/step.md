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

- `RF.defaultCoverageView: 'gradient'` in config; `display.coverageView` as a `select`
  (`bands | gradient | zone`, labelled `signal bands` / `range gradient (yellow to pink)` /
  `Fresnel zone clearance`) in `STATE_FIELDS`, added to the panel's Display section right
  after the overlay switch (`src/ui/schema.js`); `display.showFresnel` relabelled
  **`Fresnel zone volume`** with a hint that describes the tube and points at the view
  control instead of promising to recolour the drape.
- URL: `?view=bands|gradient|zone`, and `?fresnel=1` still means "show me the zone" - it
  turns the volume on *and* sets the view to `zone`. Header comment updated.
- **A real bug found in the parameter code and fixed:** `?fresnel=1` used to run
  `initialState.display = { showFresnel: ... }`, replacing the whole display block - so any
  URL with `fresnel` in it booted with the coverage overlay, the radiation pattern and the
  zone labels switched off (`undefined` is falsy). Display parameters now merge into the
  defaults. The probe below is the proof: every boot keeps `overlay=true pattern=true
  labels=true`, including `?fresnel=1`.
- New file `tests/unit/display.test.js` (45 lines) rather than growing
  `tests/unit/state.test.js`, which the lint does not budget-check (`checkModules` only runs
  over `src/`) but which was already at 358 lines against the 320-line test convention. The
  file's header says why it exists. Its test asserts: the field is a select with exactly
  `['bands', 'gradient', 'zone']`; **the default is inside its own options** (the rule that
  caught the seed bug); all three values round-trip through `applyPatch`;
  `display: { coverageView: 'rainbow' }` leaves the state alone and reports
  `[{ key: 'display.coverageView', reason: 'invalid value' }]`; and the volume hint no
  longer promises a colouring mode while still pointing at the coverage view.
- Live boot probe `.tmp/view-probe.js` (5 query strings, fresh `withApp` each):
  - no params: `view=gradient volume=false overlay=true pattern=true labels=true`,
    `overrides {"clamped":[],"rejected":[]}`
  - `?view=bands` -> `view=bands`; `?fresnel=1` -> `view=zone volume=true`;
    `?view=zone&fresnel=0` -> `view=zone volume=false` (the two switches are independent)
  - `?view=rainbow` -> `view=gradient` with
    `rejected: [{key:'display.coverageView', reason:'invalid value'}]`
  - no page errors in any case.
- `node tools/timebox.js -t 300 -- node --test tests/unit/display.test.js
  tests/unit/state.test.js tests/unit/palette.test.js` 27 pass / 0 fail; `npm run lint` ok.
  `config.js` had to be trimmed to exactly 350 lines to make room for two new keys - the
  budget is real and the comments were shortened, not the substance.
- The drape still paints bands for everyone: nothing reads `coverageView` yet, which is
  step-017. Between the two steps the panel can claim "gradient" while the map shows bands;
  no commit in between pretends otherwise.
