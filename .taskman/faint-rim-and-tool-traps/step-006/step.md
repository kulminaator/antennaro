# step-006 - README, GUIDELINES and pictures for the rim as it now renders

**Status**: done

## What changed
- `README.md`: hero caption, the three-opacity bullet, the legend paragraph, the valley caption, the
  colour-measurement list (two new bullets), and a closing paragraph in *What the edge of the colour
  is* about the one-cell fade.
- `GUIDELINES.md`: §4 names `RF.noLinkAlpha` / `RF.faintLightnessShift` / `RF.faintChromaKeep` as the
  rim's three tunables; §7 gains a bullet - *The asked-and-lost rim is keyed to the ground, not to a
  colour* - with the pivot's fixed-point argument, the straddle measurements, the palette-vs-canvas
  gap and the `coverageOffsetM` dead end; §9's browser conventions gain **canvas read-back** as a
  category of its own, with the two rules that make it honest.
- All four documentation pictures re-taken at 1440x820 (the wash changed twice since step-002:
  `FAINT_CHIP_COLOUR` is `#d7d7d7`, and the band on the map is lighter and greyer than the old 22 %
  alpha one), then read back before any caption was touched.

## Corrections to my own record, made here rather than quietly
- step-005's note claimed the app has no observer on the canvas container. **False**:
  `src/app/controller.js:274-275` installs a `ResizeObserver` calling `viewport.resize()`, and
  `controller.js` also calls `viewport.resize()` inside `settle()` - which is why the conventions
  already said to settle before touching pixels. What measurement does establish is that after the
  harness's viewport override the buffer stayed `1110x900` inside a `570x620` box until a `resize`
  event was dispatched, and the harness now refuses to run on a mismatch. The step-005 note carries
  the correction in place so the record shows both versions.
- step-005 first blamed ACES tone mapping for the palette-vs-canvas gap and quoted the top step
  rendering as rgb(209, 182, 34). Both wrong: `viewport.js` leaves `toneMapping` at its default
  (there is no tone mapping in `src/`), and that "yellow" sample had caught sunlit ochre terrain.
  The crimson read-back at `overlayOpacity: 1` replaced it.

## Claims the README now makes, and where each came from
| claim | source |
| --- | --- |
| the rim is >= 13.1 from its own ground, >= 10.9 from any painted cell | `tests/unit/faintwash.test.js`, worst of four eyes over the ramp including shade |
| the old fixed grey came to 1.4 from dark ground | same file's "the ruler still measures the bug this replaced" |
| canvas p05 11.4, median 15.5 | `tests/browser/rim.test.js`, printed by the test itself |
| 451 of 1330 rim pixels sit in the one-cell fade; median 15.3, worst 2.1 | same run, reported by the test |
| the legend's faint swatch is the rule applied to a mid-ramp ground | `FAINT_CHIP_COLOUR` derivation, asserted in unit and browser tests |

Every number in the four captions was re-read off the re-taken pictures' HUD before writing: default
836 of 30624, 29.6 %, 73.7 %, k 1.41 / 0.012 m, budget and last link 0.94 km, -50.1 / -90.2 /
-116.7 dBm; valley 2019 of 30624, 84.2 %, 2481 m @ 181 deg, 2.50 km budget, -48.1 / -77.4 / -119.4
dBm, 99.8 % zone clear with 5 cut.

The valley caption changed in substance, not just wording: it used to say "the pale patch inside the
tongue", singular. The picture now shows several grey patches inside the lobe - which is the point of
the fix - so it reads "the grey patches inside the tongue", with the 16-cell block on bearing
150-152 deg at 1.5 km kept as the measured example rather than the whole story.

## Verification
- README link/image validation with GitHub slug rules in Node: 7 anchors and 5 images all resolve,
  and `docs/` has no orphan PNGs.
- `node tools/lint.js` ok; `npm run test:unit` 21 files in 6.9 s.
- Both pictures that carry numbers in their captions were opened and read before captioning, and the
  fresnel picture was checked against its caption's specific claims (mint tongue, lilac where the
  ground eats into the zone, the pale volume band along the boresight).

## Still open after this step
The palette-vs-canvas gap is documented but unfixed, and it is the largest defect this task found.
Until it is closed, every colour number in README and GUIDELINES is a statement about the palette,
and `tests/browser/rim.test.js` is the only place that measures the screen.
