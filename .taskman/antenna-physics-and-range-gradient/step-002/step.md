# step-002: failing tests first: `tests/unit/antennaphysics.test.js` (Kraus bound, Yagi-vs-biquad ordering, monotonicity)

## How to perform this step

1. Create `tests/unit/antennaphysics.test.js` (a new file: `tests/unit/antenna.test.js` is
   at 310 of 320 lines). Header comment says what is being pinned and why; import
   `node:test` + `node:assert/strict`, `ANTENNA_CATALOGUE`, `nominalGainDbi`,
   `patternSpec`, `createDefaultParams` from `../src/antenna/catalogue.js`,
   `createAntennaModel` from `../src/antenna/model.js`, `wavelengthM` from
   `../src/propagation/rf.js`.
2. Add a local helper `beamImpliedDirectivityDbi(hDeg, vDeg)` =
   `10*log10(41253 / (hDeg * vDeg))` with a comment naming it as Kraus's approximation and
   saying it is an upper bound for a main-lobe-dominated pattern, so a *gain above it* is
   the thing that is physically impossible.
3. Test `antenna physics: no design claims more gain than its own beam can hold`: for
   every catalogue entry, at default params, at every per-parameter min and max, and at the
   modelled `hBeamwidthDeg`/`vBeamwidthDeg` from `createAntennaModel(...).summary()`,
   assert `peakGainDbi <= implied + 0.25` (0.25 dB of slack for the -3 dB search being
   sampled, not a fudge to make a wrong number pass). Skip the omni family for this
   invariant but say why in a comment: Kraus with a 360 deg plane is not the right
   arithmetic for an omni, whose gain comes from the array factor instead (tested in the
   collinear test of `tests/unit/antenna.test.js`).
4. Test `antenna physics: a Yagi beats a biquad, and is narrower doing it`: at default
   parameters assert the Yagi's peak gain is above the biquad's, and that its H **and** V
   beamwidths are both smaller. This is the user's complaint, verbatim.
5. Test `antenna physics: gain and beamwidth move in opposite directions`: for the Yagi
   sweep `directors` 2..14 and for the biquad `turns` 1..3, assert gain strictly increases
   while H beamwidth strictly decreases, and that each stays inside the
   `implied - 6 .. implied + 0.25` window (a design a full 6 dB under its own beam is
   describing a different antenna than it draws).
6. Test `antenna physics: published-plausible gains for hand-built antennas`: biquad
   between 6 and 11 dBi at every corner, Yagi between 4 and 15, patch between 3 and 10,
   with a comment citing what these designs are measured at in the field.
7. Verify: `node tools/timebox.js -t 120 -- node --test --test-reporter=spec tests/unit/antennaphysics.test.js`
   is RED on tests 3, 4 and 6 (biquad 12.40 dBi over a 9.38 dBi beam) and GREEN on test 5's
   monotonicity half. Record which assertions failed in the step comments - that list is
   the defect report step-005 must clear. Do not touch `src/` in this step.

## Expected result

A red test file that states the physics: nothing may claim more gain than its beamwidths
allow, a Yagi must beat a biquad, and gain and beamwidth must move in opposite
directions.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- File created: `tests/unit/antennaphysics.test.js`, 152 lines (a new file on purpose -
  `tests/unit/antenna.test.js` sits at 310 of its 320 line budget).
- First run is red in exactly three places, and green where the app was already right:
  - `no design claims more gain than its own beam can hold` -
    `biquad-reflector at default (69.0 x 69.0 deg implies 9.38 dBi): 12.40 dBi is more gain
    than that beam can hold`.
  - `a Yagi beats a biquad, and is narrower doing it` -
    `a Yagi must have more gain than a biquad, not 9.58 against 12.40 dBi`.
  - `gains stay in the range these designs are measured at` -
    `biquad-reflector at default: 12.40 dBi is outside the 6-11 dBi this design is measured
    at in the field`.
  - `gain and beamwidth move in opposite directions` **passes** already: the catalogue's
    parameter *directions* were never the problem, only the scale of the biquad's gain.
- The Kraus arithmetic is defined *locally* in the test file, with a comment saying so, and
  step-003 adds an assertion that the shipped `krausDirectivityDbi` agrees with it - so the
  test cannot quietly start believing a different formula than the model uses.
- Omnis are excluded from the bound by filtering on `entry.family === 'directional'`, and
  the file header says why in one sentence (a 360 degree plane is not a main lobe), so the
  exclusion reads as a decision rather than an oversight.
- The `UNDER_BOUND_DB = 6` half of the first invariant also has teeth: the Yagi at 2
  directors currently sits 4.4 dB under its own beam and would fail at 6.
