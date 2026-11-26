# step-005 - a browser test that measures the rim in real pixels

**Status**: done

## What changed
- `tests/browser/rim.test.js` (new, 151 lines): reads the canvas back, compares the same pixel with
  the coverage drape on and off, and holds the rim to its floors in rendered pixels.
- `tests/harness/app.js`: after the viewport override the harness now dispatches `resize` and waits
  until the canvas drawing buffer matches the element's css box. See "the harness was measuring a
  stretched canvas" below.
- `src/config.js`: `RF.faintLightnessShift` 30 → **38**, with the frontier that fixes it in the
  comment. `tests/unit/faintwash.test.js` guards raised to match the new measurement (12.5 / 10.4).
- `FAINT_CHIP_COLOUR` moves with the rule: `#c1c1c1` → `#d7d7d7`. Step-006 re-shoots the pictures.

## The measurement is sound before the numbers mean anything
Two reads of the canvas with **nothing patched between them**: 22 010 samples, maximum difference
**0.000** CIEDE2000 (`.tmp/control.mjs`). So a difference that appears when the drape is toggled is
the drape's doing and not the measurement's.

## No coordinate decides which pixel is the rim
The obvious approach - pick the world point under a pixel with `__sim.pick`, ask `__sim.rssiAt` what
lives there - is wrong here, and the first version of this step did it: `pick` slides along *the
plane the mast stands on*, which is the visible surface only where the land happens to be flat. On
hills it returned cells several hundred metres from the pixel it was paired with, and about a tenth
of the samples came back as "the rim did nothing". The test API is documented correctly; the misuse
was mine.

The rim is instead recognised by what the rule does to a colour: **it takes chroma away**, where the
signal steps and the zone colours put chroma on. `interior` means a whole coverage cell of the same
kind surrounds the sample, which excludes the one-cell fade at the edge of the coverage.

## What the canvas says (900x620 viewport, default scene)

| quantity | measured |
| --- | --- |
| samples / drape-changed / rim / painted | 22 010 / 1 761 / 1 330 / 431 |
| interior rim pixels | 879 |
| interior rim vs its own lit ground | min 3.9, **p05 11.4**, median 15.5 |
| all rim pixels (fade included) | min 2.1, p05 8.0, median 15.5 |
| fade-band pixels | 451, median 15.3 - the fade is not weak as a whole, it holds the extreme low end |
| lit ground L\* under the rim | 35 to 51 |
| rim touching a painted pixel (≤ 4 px) | min 3.1, p10 8.4, median 18.1 |

Guards in the test: ≥ 300 interior pixels, p05 ≥ 10, median ≥ 13, chroma actually removed, lightness
actually moved, and the sampled ground spanning ≥ 15 L\* - so the test fails if it ever measures one
flat backdrop instead of the map.

Mutation: `RF.noLinkAlpha` 0.57 → 0.22, the shipped value before this task, fails by name with
`5th percentile 4.8 dE000, worst 3.0 over 800 interior pixels`.

## Why the shift went from 30 to 38
The palette's floors are stated in the palette's own space; the renderer composites the drape over
*lit* terrain and carries it through a pipeline that does not preserve those numbers (the section on
colour space below), which compresses a designed lightness step. Measured at equal alpha 0.57 (worst of four vision models; "canvas" is the 5th percentile over interior rim pixels):

| shift | vs own ground | vs any painted cell | canvas p05 | canvas median |
| --- | --- | --- | --- | --- |
| 30 | 10.0 | 11.2 | 10.0 | 13.7 |
| 34 | 11.5 | 11.0 | - | - |
| **38** | **13.1** | **10.9** | **11.4** | **15.5** |
| 40 | 13.9 | 10.3 | - | - |
| 45 | higher still | **8.3 ✗** | 12.6 | 17.0 |

45 is excluded by measurement, not taste: pushed that far the wash comes within 8.3 dE000 of the
Fresnel view's mint `#3effb7`, and "the rim cannot be mistaken for a painted cell" is the guarantee
that gives way first. 38 is the last shift that keeps both floors with margin.

Lit ground under the rim spans L\* 35-51, entirely **below** the rule's pivot (55), so on the default
map's rim the wash always lifts the ground; the "press bright ground down" branch is for rock and for
whatever the sun does on a different preset, and it is exercised in the unit tests' synthetic ramp
rather than here.

## The harness was measuring a stretched canvas
`createAppSession` navigates and *then* applies `Emulation.setDeviceMetricsOverride`. Measured
repeatedly: after that override the canvas drawing buffer no longer matched its css box - a
**1110x900 buffer shown in a 570x620 box** - and it stayed that way until a `resize` event was
dispatched. Any browser test that paired a canvas pixel with a world position was therefore pairing
two different places, and any colour measurement was reading a stretched image. The harness now
nudges `resize` after the override and waits until buffer and box agree, so this fails loudly
instead of quietly measuring the wrong picture.

> **Corrected in step-006.** The paragraph above, written at the time, also claimed the app had no
> observer on the canvas container. It was wrong: `src/app/controller.js:274-275` installs a
> `ResizeObserver` that calls `viewport.resize()`, and `controller.settle()` calls `viewport.resize()`
> too - which is why the conventions already say to `settle()` before touching pixels. What is
> established by measurement is narrower and less flattering to me: after the viewport override the
> buffer did not match the box, and it stayed mismatched until a `resize` event was dispatched -
> `1110x900` buffer in a `570x620` box, reproducible, with both observers in place. Why neither the
> observer nor `settle()` had corrected it before the first sample is not established here; that the
> harness now waits for buffer and box to agree is, and that is the part a test can rely on. The
> lesson that survives is the one the harness enforces: **`settle()` (or the new wait) before any
> canvas read-back**, or you are measuring a stretched image.

## Also found, not fixed: the palette's colour space does not reach the screen
`src/app/viewport.js` sets `renderer.outputColorSpace = THREE.SRGBColorSpace` and leaves
`toneMapping` at its default - `NoToneMapping`; there is no tone mapping anywhere in `src/`. Palette
sRGB triples are written straight into geometry colour attributes (`terrainmesh.js`,
`coveragemesh.js`, `lobemesh.js`) and three.js treats attribute colours as **linear working-space**
values, so a palette colour arrives brighter and less saturated than its hex.

Decisive measurement, because it removes the blending: with `RF.overlayOpacity` set to `1` a painted
cell is the palette colour alone.

| crimson `#980011` | R | G | B |
| --- | --- | --- | --- |
| the palette | 152 | 0 | 17 |
| predicted if the numbers are treated as linear | **203** | 0 | **73** |
| predicted if converted to linear on the way in | 152 | 0 | 17 |
| rendered, mean over 836 painted-cell pixels | 171 | 6 | **66** |

The blue channel is the discriminator and it lands on "treated as linear" - 66 against 73, not 17.
Fog reaches the unlit drape material too, which is where the red channel falls short of the
untreated prediction.

So **every colour guarantee this repository's README and `GUIDELINES.md` state is stated in a space
the renderer does not deliver**, and the rim's rendered floor (11.4) sits below its palette floor
(13.1) mainly for that reason. Fixing it means one colour-management pass through the render
adapters - convert on the way in, decide tone mapping deliberately - and then re-measuring every
colour claim in the repository: a task of its own, larger than this one, and not one of the four
bugs the user named. Recorded in `task.md` as the largest defect this task found, not half-done here.

A first version of this note blamed ACES tone mapping and quoted the top step rendering as
rgb(209, 182, 34). Both were wrong - there is no tone mapping here, and that "yellow" sample had
caught sunlit ochre terrain instead of the drape. Retracted on the record, so the difference between
what was measured and what was assumed stays visible.

The harness gap that let this matter is the one above: while the drawing buffer did not match the
element, any read-back of the canvas was measuring a stretched image, and a stretched image can be
made to support almost any theory about colour.

## Smaller measurements, recorded rather than acted on
- `VIEW.coverageOffsetM` (the drape floats this far above the ground) was tested at 0.35 / 0.8 /
  2.5 / 8. Raising it lifts the *all-pixels* p10 from 10.1 to ~12.5 - the drape only touches the
  terrain at every second vertex, so on convex ground between them it can sink - but changes the
  interior floor by less than a point (3.5 → 3.4). Left at 0.8, because the interior floor is what
  the rim is judged by and hovering the whole drape is a real cost.
- The one-cell alpha fade at the coverage boundary (deliberate, documented in `coveragemesh.js`)
  holds the rim's worst pixels: 451 of 1 330 rim samples sit in it, min 2.1. It is reported by the
  test rather than asserted, and step-006 should say so in the README's "edge of the colour" section.

## Verification
`node tools/lint.js` ok (45 src, 15 tools, 30 tests) · `npm run test:unit` 21 files, 7.0 s ·
`node tools/test.js --browser --only rim` 1/1 · `--only interaction` 11/11 in 20.5 s (its legend
assertions track `FAINT_CHIP_COLOUR`, so the new chip is checked, not hardcoded).
