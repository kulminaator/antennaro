# step-011: Deygout multi-edge loss, as a pure function with its own tests

## How to perform this step

One ridge behind another currently costs the same as one ridge. Implement the Deygout
multi-edge rule in `src/propagation/los.js` as an exported pure function, before wiring
it anywhere.

1. Signature that fits the profile `rayProfile` returns, e.g.
   `multiEdgeDiffractionDb(points, totalDistance, freqHz, options)`: from the interior
   samples, walk the path from the transmitter keeping the line to the highest preceding
   edge, and for each edge standing above that line compute its own `v` measured from
   that line and add `diffractionLossDb` for it. Cap the number of edges charged by
   `RF.diffractionEdgeLimit` and merge adjacent samples of one slope so a single ridge
   charges one edge rather than twenty.
2. Add `RF.diffractionEdgeLimit` to `src/config.js` with a comment saying why a cap is
   needed (samples closer than the profile step are the same ridge seen many times);
   trim comment wording elsewhere to stay inside the 350-line budget.
3. New file `tests/unit/diffraction.test.js` asserting, all computed rather than
   hard-coded, with profiles built through `rayProfile` over synthetic `HeightField`s so
   the tests exercise the app's own sampling:
   - one obstruction reduces to `diffractionLossDb` for it, within 0.1 dB;
   - two identical well-separated ridges cost strictly more than one, and strictly less
     than twice one (Deygout is not "add them up");
   - monotone in each ridge's height;
   - a clear profile costs 0 dB;
   - one long slope charges one edge.
4. Verify that file green. Do not switch the sweep over yet - that is step-012.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

## Step comments

- **The function lives in a new module, `src/propagation/diffraction.js`, not in `los.js`.**
  `los.js` was at 343 of 350 lines and the function with its documentation needs 137. Moving
  `diffractionLossDb` and `KIRCHHOFF_FIT_FLOOR_V` there with it - they are the loss model, the
  ray walk is a different piece of maths - and re-exporting from `los.js` took `los.js` down to
  306 lines and left every existing importer working. Registered in `tools/lib/arch.js` as layer
  1 and added to `PURE_PATTERNS`.
- **Tests are in `tests/unit/multiedge.test.js`**, a new file, because
  `tests/unit/diffraction.test.js` has existed since step-007 and the step's phrase "new file"
  could not mean the same path.
- **`monotone in each ridge's height` is false for Deygout, and the failure is measurable.**
  Raising the *near* ridge tilts the line it casts over everything behind it:
  8 m of near ridge costs 13.32 dB, 12 m of the same ridge costs 9.99 dB. The interaction a
  user actually touches is worse - sweeping the mast over the same two ridges:

  | mast | Deygout | single-screen |
  | --- | --- | --- |
  | 4 m | 10.91 dB | 10.07 dB |
  | 6 m | 11.59 dB | 9.45 dB |
  | 8 m | 12.41 dB | 9.02 dB |
  | 10 m | **13.32 dB** | 8.59 dB |
  | 12 m | 8.15 dB | 8.15 dB |

  Raising the antenna 6 m makes the model charge 2.4 dB more. Measured against the *direct*
  ray line every screen height falls as the mast rises, so this is the construction's artefact
  and not physics; physics only guarantees monotonicity in an obstacle's own height. Bullington
  was tried as the alternative and is also non-monotone (near 8 → 10 m at a fixed far ridge:
  11.51 → 8.53 dB) and non-reciprocal by up to 3 dB; charging the worse of the two directions
  fixes reciprocity-ish and still not monotonicity. So the monotonicity test is stated for the
  *last* screen, where it is true by construction, and the violation is pinned by its own test
  so that nothing gets wired onto this map without reading it first.
- **That is now step-012's decision, not a formality**: whether to charge the sum on the real
  map depends on how often real ground presents two or more screens on one path. If it is rare,
  the artefact is rare; if it is common, the single-screen model stays and this step stands as
  "the standard cure measured and rejected, with numbers".
- **Two guards the recipe needs on top of the textbook form**:
  - the answer is floored at what the most significant screen costs on its own, because the raw
    sum can fall below a screen that is plainly there;
  - contiguous obstructing samples collapse to their top (`screenEdges`), which is what makes a
    kilometre-long hillside charge one edge instead of one per sample - asserted as exact
    equality with the single-edge formula.
- **An intuition of mine was wrong and is now a comment**: I first asserted that more screens
  cannot cost less than the tallest one alone. They can - 12.98 dB for four ridges against
  15.38 dB for the tallest of them standing alone - because a preceding screen lowers the
  effective height of everything behind it. That is the shadow working. The two bounds that do
  hold, and are asserted: the total is at least what the *first* screen sees (it is measured on
  the true ray line), and at most the sum of every screen charged alone.
- `RF.diffractionEdgeLimit: 3` added; `src/config.js` trimmed by four comment lines elsewhere to
  stay at its 350-line budget.
- Verification: `node tools/lint.js` -> `lint ok - 45 src, 15 tools, 27 tests file(s)`;
  `node tools/timebox.js -t 120 -- node --test tests/unit/multiedge.test.js` -> 7 tests, 7 pass;
  `npm run test:unit` -> `all 20 test file(s) passed in 5900 ms`.
