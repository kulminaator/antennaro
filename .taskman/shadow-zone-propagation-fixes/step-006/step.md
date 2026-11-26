# step-006: rewrite the curvature browser tests to the honest finding

## How to perform this step

`tests/browser/curvature.test.js` (83 lines) proves from inside the page that the
horizon is nowhere near where coverage stops: "the horizon the app quotes is nowhere
near where the coverage stops" and "even the loudest link the panel allows ends before
the curve matters".

1. Background the server - `(setsid node tools/staticserver.js start --port 8080 --quiet > /dev/null 2>&1 &)`
   - and run `node tools/timebox.js -t 300 -- node --test tests/browser/curvature.test.js`;
   stop the server afterwards (`node tools/staticserver.js stop`).
2. Re-measure both claims against the new model with the step-004 numbers. Keep what is
   still true: the horizon the row quotes is computed for the *terminal* height and is
   still far off this map (11.5 km for a 0.5 m mast with a 4 m terminal). Where a claim
   was really about the *ray*, rewrite it to what the model now reports.
3. If step-004 found a user-visible consequence on legal configurations, add one browser
   test for it (patch, `await session.settle()`, read through `window.__sim` - never DOM
   or coordinates). If it found none, say so here and do not invent one.
4. Assert `session.errors()` empty; then `node tools/browser.js stop --all` and stop the
   server.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Both existing tests survived unchanged and keep their meaning: they are about the
  horizon the `Curvature` **row** quotes, which is computed for the receiver height
  (`RF.fresnelRxHeightM`), and that is off-map for every legal mast. What was wrong was
  the file header's premise ("at 5.2 km the planet is not a factor"), now rewritten into
  the two claims that are both true.
- New hook, because it could not be done without one: `__sim.rayTo(x, z, { kFactor })` in
  `src/app/testapi.js` returns the app's own `rayProfile` between the current antenna and
  the ground at (x, z) - distance, max/worst excess and where, min clearance and where,
  obstruction dB - and accepts `kFactor` so the same ray can be asked of a flat earth.
  **Step-015 must add `rayTo` to the `__sim` method list in GUIDELINES section 9.**
- New test: `browser: the app lowers its ray by exactly the earth, wherever the path is
  worst`. Asking the page for the same ray twice gives an attribution that works on real
  terrain, where "the earth did this" is otherwise unprovable: the difference between the
  curved and flat answers is `earthBulgeM(d, D - d)` at the worst sample, exactly
  (checked to 1e-6 whenever both walks agree where the worst sample is, which they did at
  both probe points). Measured with the lowest mast in a legal corner: +0.586 m at 4.9 km
  of a 7.1 km path, +0.166 m at 2.1 km of a 3.5 km path, and +27.35 against +27.29 dB of
  obstruction.
- The same test pins the two horizons apart from each other: the quoted one is off the
  map, a 0.5 m mast loses the ground itself at 3.01 km which is well inside the 7.21 km a
  corner mast can look across, and a 40 m mast has the whole map inside 26.9 km.
- Regression sensitivity: the `delta > 0` assertion fails outright if the bulge sign ever
  flips back (the curved answer would be the higher one), and the peak bound
  `delta <= earthBulgeM(D/2, D/2)` fails if curvature is ever applied twice.
- Server was backgrounded and stopped, browsers swept, process table empty.
