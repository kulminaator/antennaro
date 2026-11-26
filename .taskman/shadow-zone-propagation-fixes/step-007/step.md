# step-007: charge diffraction from the signed obstruction, so the shadow starts at 0 dB

## How to perform this step

`profileObstructionDb()` returns 0 dB for any ray that misses the ground, so the loss
jumps 0 -> 6.03 dB the centimetre the ray touches. The closed form already handles the
approach: it is valid down to v = -0.78 and returns 0 below that.

1. In `src/propagation/los.js`, make `profileObstructionDb(profile, freqHz)` evaluate the
   knife-edge loss from the *signed* `profile.worstExcess` instead of bailing out at 0,
   and let `diffractionLossDb` clamp what it already clamps (`v < -0.78` -> 0 dB). Keep
   the reason for the old bail-out visible in the comment: 6 dB at exactly v = 0 is right
   for a grazing ray and was being charged to rays nowhere near the ground; the signed
   parameter fixes that by construction rather than by an early return.
2. Declare the -0.78 validity bound next to the maths, named and commented as the limit
   of the Lee/Maqsood fit - the manner GUIDELINES 4 allows for `PATTERN_FLOOR_DB`. Not in
   `src/config.js`.
3. Add unit tests (in `tests/unit/propagation.test.js`, or the file step-001 created):
   - continuity: loss at `worstExcess = -epsilon` and `+epsilon` differ by less than
     0.1 dB and each is within 0.1 dB of `diffractionLossDb(0, d1, d2, freqHz)`;
   - the deep-clear case is still exactly 0 dB (worstExcess far beyond the -0.78 bound);
   - monotonicity in `worstExcess`, sampled every metre from -60 m to +60 m.
4. Verify that file green, then `npm run test:unit` - coverage numbers move slightly,
   because near-grazing cells now pay a little.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

## What was built

`profileObstructionDb()` now charges `diffractionLossDb` with a **signed** excess, and the
point it charges is chosen by a new `worstScreen()` pass over the walked samples. The
resulting ladder, walking a ridge up through a ray that passes 20 m above the ground:

| ridge crest | 4 m | 8 | 12 | 16 | 20 | 24 | 28 | 32 | 36 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| charged dB | 0.00 | 1.37 | 3.00 | 4.80 | **6.69** | 8.59 | 10.42 | 12.11 | 13.64 |

The same ladder under the old rule was `0, 0, 0, 0, 6.03, ...` - nothing, then the grazing
6 dB, in one step. The crossing of 6 dB is now asserted from below in
`tests/unit/diffraction.test.js`, which is the assertion that cannot pass on the old model.

## The defect this exposed, which was there all along

Charging the signed worst sample made **every path on a flat map cost 4.5 - 6 dB**, because
this app's decibels belong to a terminal standing on the ground: the ray always ends in the
ground, so the worst "obstruction" is the last sample before the receiver, and it wins the
comparison everywhere because `d1 d2 / (d1 + d2)` - and with it the zone it would be judged
against - collapses towards zero at an antenna. That is why the old code floored the excess
at 0 and only charged when something was above the ray: the floor was hiding this. It was
not only hiding a cliff, it was also **inflating** deep-shadow paths by charging the burial
next to the receiver instead of the crest that blocks (the default map's best path improved
by 2 dB when this was fixed).

The rule that fixes both, in `worstScreen()`: the screen charged is either

- a **crest** (higher, relative to the ray, than both neighbours inside the diffraction
  window) - which is what makes the onset continuous, or
- anything **above the ray** beyond `RF.diffractionNearEndM` of the receiver - because a
  buried ray has an obstruction by definition, so a monotone hillside, a wall 50 m in front
  of the antenna and the edge of the tableland the receiver is standing on all still charge.

A first attempt excluded the outer 10% at *both* ends. That was wrong and the browser suite
caught it: the western wall is 16 m from the mast and the northern lip 17 m, and both are
real obstructions to everything down the path (`rayTo` reported 40.78 dB and 10.8 dB for
them). The ray leaves the mast in the air; only its endpoint is not an obstacle. So the
metre guard applies at the receiving end only.

## Config and API

- `RF.diffractionEndpointGuard: 0.1` (fraction, sub-ray crests, both ends) and
  `RF.diffractionNearEndM: 30` (metres, receiving end only), both documented next to
  `fresnelEndpointGuard`, whose reason they share.
- `KIRCHHOFF_FIT_FLOOR_V = -0.78` is now a named constant in `los.js` - the third borderline
  local constant (with `PATTERN_FLOOR_DB` and `NEAR_FIELD_SKIP_FACTOR`) that GUIDELINES
  section 4 has to list (step-015).
- The profile lost `d1`/`d2` (they were the geometry of a sample that no longer gets
  charged) and gained `diffractionExcess`, `diffractionDistance`, `diffractionD1`,
  `diffractionD2`. `__sim.rayTo` reports the screen as `screenExcess` / `screenDistanceM`.

## Tests that had to change, and why

- `tests/unit/propagation.test.js`: `profile.d1 + profile.d2` -> `diffractionD1 + D2`.
- `tests/unit/diffraction.test.js` (new, 6 tests): continuity, the fit floor at 0.55 r1 of
  clearance, the signed-profile identity, frequency entering only through the zone (this one
  corrected a physics error in my own first draft: at a fixed *height* an obstruction is
  worse at a *higher* band; "long wavelengths diffract better" is a statement about a fixed
  fraction of the zone, and the test now pins both), the receiver's own footing, and the
  ladder.
- `tests/browser/fresnel.test.js`: the band test compared `clearPct` across bands on
  whatever each band happened to link, which over the default budget is 2271 cells at
  433 MHz against 14 at 5800 MHz - two different maps. It now opens the budget so the same
  cells are linked in every band (and asserts that they are), and keeps the shuffle as its
  own closing paragraph. 5800 MHz also loses 361 links to diffraction that 2400 MHz keeps:
  the zone gets easier and the decibels get harder.
- `tests/browser/reach.test.js`: the "flat field" at `x = -1000` was never free space - it
  costs 3.2 dB now - so the two tests that asserted `reach / budget > 0.95` and a strict
  gain ordering moved to the corridor down the middle of the map aiming east (0.994 of its
  budget). On the bump field designs 0.9 dB apart genuinely change places (biquad 1639 m
  against collinear 1664 m), which is a fact about the ground, not about the antennas; the
  reach test now says so and asserts the ground cost in decibels instead.

## Measured, for the re-measurement steps

Default configuration: linked 842 (was 844), last link 936 m, walked 2828, median -90.3,
best **-50.1** (was -52.1), worst -117.1, `limitingFactor: budget`, zone-clear **87.2 %**
(was 86.1 %). 2106 of the 2828 walked cells carry diffraction, mean 24.4 dB, max 44.0 dB.

## Stated limits of the model now

- An obstruction within 30 m of the receiving point is not charged at all. That is what
  `clutterLossDb` is for, and it is the price of the terminal-standing-on-the-ground model.
- Within 10 % of the path length from an antenna, ground *below* the ray is not charged - a
  crest has to be inside the window to start the climb early.
- `tests/browser/reach.test.js` is now 332 lines, over the 320-line convention; trim it in
  step-013 or 016 rather than grow it further.
