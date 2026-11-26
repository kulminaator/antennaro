# step-014: browser test: the app's own horizon number and the measured edge of coverage agree

## How to perform this step

1. Add to `tests/browser/reach.test.js`:
   `browser: the horizon the app quotes is where the coverage actually stops`. Use a low
   mast (`ANTENNA.heightLimitsM.min` rounded up a little) on the flat field, sensitivity
   pushed so the budget is comfortably beyond the horizon (so the horizon, not the budget,
   is the binding limit for the *terrain-aware* walk), and shadowing on.
2. Assert: `coverage().radioHorizonM` is finite and inside the map for those heights, the
   furthest linked point east is not beyond it, and there are linked points well inside it -
   i.e. coverage ends near the horizon rather than at the map edge or the study range.
   Compare with `budgetRangeM` and state in the assertion message which of the two is
   smaller, so a future failure says what broke.
3. Also assert the HUD's `Curvature` row exists in `scene()`/HUD data (whatever
   `reports.js` exposes) with a bulge number that matches `earthBulgeM` for the reported
   last-link distance.
4. Verify: `node tools/timebox.js -t 600 -- node tools/test.js --browser --only
   tests/browser/reach.test.js` green, no page errors.

## Expected result

The number the app prints about the earth is the number the map obeys.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- **The premise of this step is false, and the step now tests the truth instead.** It asked
  for a low mast whose coverage stops at the radio horizon. The maths refuses: the horizon
  is `sqrt(2kR) * (sqrt h1 + sqrt h2)` = 4243 m per sqrt(metre) of height, so the shortest
  mast in the app plus the stated 4 m receiver gives `radioHorizonM(0.5, 4)` = 11.5 km,
  against a 5.2 km map. There is no legal configuration in which the horizon falls inside
  the world, so staging that demonstration would have meant inventing a horizon the model
  does not have. Recorded in `task.md`; the file's header says so too.
- New file `tests/browser/curvature.test.js` (79 lines, 2 tests) rather than another test in
  `tests/browser/reach.test.js`, which is at 287 of its 320 line budget. The step said to
  extend that file; a curvature claim about the whole map is its own subject anyway.
  - `browser: the horizon the app quotes is nowhere near where the coverage stops`: the
    three curvature facts the HUD row is made of are re-derived in the test from
    `earthBulgeM` / `radioHorizonM` themselves (to 1e-12 and exactly), the default picture
    is `budget`-limited, its last link is under half the horizon, and its bulge is under
    0.2 m. If the HUD ever quotes a number the pure maths disagrees with, this fails.
  - `browser: even the loudest link the panel allows ends before the curve matters`: 43 dBm
    into a -124 dBm receiver, the loudest pair the panel's own bounds allow, gives
    `limitingFactor: 'map-edge'`, a bulge of 0.19 m for a 3.68 km link (the most curvature
    this map can produce for a working link), a budget more than ten times the horizon, and
    a horizon still off the map. Then the mast goes to 40 m and the horizon is asserted to
    grow by more than 20 % - so the row tracks the mast even though it never gets close to
    binding. Measured: 21.9 km at 10 m, 35.3 km at 40 m.
  - There is deliberately no assertion about a separate "HUD curvature value": `reports.js`
    exposes no HUD data and the HUD must not be a source of truth - it formats
    `coverage.stats`, which is what these tests read and what step-012 verified renders.
- Verified: `node tools/timebox.js -t 600 -- node tools/test.js --browser --only
  tests/browser/curvature.test.js` green; whole browser suite `all 6 test file(s) passed in
  52972 ms`; `npm run test:unit` all 13 files pass; `npm run lint` ok
  (43 src, 15 tools, 20 tests).
