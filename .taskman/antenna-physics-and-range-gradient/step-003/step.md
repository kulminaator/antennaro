# step-003: `pattern.js`: `krausDirectivityDbi()` and its own unit test

## How to perform this step

1. In `src/antenna/pattern.js` add and export
   `export function krausDirectivityDbi(hBeamwidthDeg, vBeamwidthDeg)`, returning
   `10 * Math.log10(KRAUS_CONSTANT_DEG2 / (h * v))` with `h`/`v` clamped to at least
   `0.5` deg so a degenerate width cannot divide by zero.
2. Put `KRAUS_CONSTANT_DEG2 = 41253` next to the function as a named local constant with a
   comment: this is the standard Kraus approximation `D = 41253/(theta_H theta_V)` in
   square degrees, it is an upper bound for a tapered main lobe, and it is not valid for an
   omnidirectional plane. `tools/lib/arch.js` already allows a named constant beside the
   maths it belongs to (like `PATTERN_FLOOR_DB`), so this is not a config knob - it is the
   definition of the formula.
3. Add a short header comment saying what the function is *for* in this app: the
   catalogue derives a design's gain from the beam it draws, so pattern maths and gain
   cannot drift apart.
4. Test it in `tests/unit/antennaphysics.test.js`: a hand-worked case
   (`krausDirectivityDbi(60, 60)` = `10*log10(41253/3600)` = 10.55 dBi to 2 dp), symmetry
   in the two arguments, monotone decreasing in both, clamping a 0-width input to a finite
   number.
5. Verify: `node tools/timebox.js -t 120 -- node --test tests/unit/antennaphysics.test.js`
   - the new formula tests pass, the design-wide invariants stay red until step-005.

## Expected result

One shared, documented formula for "what these beamwidths are worth", ready for the
catalogue to call.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
