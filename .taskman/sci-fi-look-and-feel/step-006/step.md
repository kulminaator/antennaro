# step-006: 3D scene atmosphere — void background + fog in config

## How to perform this step

1. In `src/config.js`, change **only** these two `VIEW` values to the void the
   CSS `:root --bg` now uses, so scene and chrome are one colour of space:
   `background: 0x04070e, fogColour: 0x04070e` (match whatever step-001's
   `--bg` ended up being; the two must be equal). Do not touch `fogNear`/
   `fogFar`, `COLOURS` (data colours are measured invariants), or the lights
   in `src/app/viewport.js`.
2. The canvas pixel contract is `tests/browser/rim.test.js`: it asserts the
   faint-rim-vs-its-ground gap on the drawing buffer (interior p05 >= 10,
   median >= 13 dE000, plus chroma/lightness floors). Fog scales the rendered
   gap between drape and ground by (1 - fog), so re-measure it:
   `node tools/browser.js stop --all && node tools/timebox.js -t 240 -- node tools/test.js --browser --only tests/browser/rim.test.js`
   - Green → done.
   - Red → the void fog ate the rim's contrast: keep `background` at the void
     but set `fogColour` back to a lift of it that passes (try `0x0d1117`
     first, then bisect), and record the measured floors in the step comments.
3. Optional, only if step 2 was green with time left: cool the moonlight —
   `viewport.js` sun `0xfff3e0` → `0xd8e8ff`. Same rule: rim green or revert.
   (Line budget: `viewport.js` must stay under 350 lines — edit in place.)
4. Verify visually: `node tools/timebox.js -t 120 -- node tools/browser.js
   shot --url "http://127.0.0.1:8147/" --name skinstep --width 1440 --height
   820 --out .tmp/skin-006.png` and read it back: scene floats in the same
   void the panel sits in; coverage colours unchanged (yellow→crimson core,
   ash rim); `node --test tests/unit/palette.test.js` green (data palette
   untouched).

## Expected result

The map floats in the same deep void as the chrome; rim's canvas floors pass;
every data colour is byte-identical in `config.js`.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Executed: `VIEW.background` and `VIEW.fogColour` `0x0d1117` → `0x04070e`
  (equal to CSS `--bg`); `fogNear/fogFar` and `COLOURS` untouched.
- Measured rim floors on the void: interior p05 11.4 / median 15.6 - identical
  to the old fog, so no fallback was needed (floors 10/13).
- Optional cool moonlight taken: `viewport.js` sun `0xfff3e0` → `0xd8e8ff`.
  Rim re-run: p05 11.7 / median 16.0 - *better* than before, so it stays.
  Hemisphere lights untouched (sky `0xbcd7ff` / ground `0x2a2f28` still fine).
- **Correction (step-009): the moonlight change was reverted.** It was green
  by the letter of this step's rule, but it moves the canvas measurements the
  README and GUIDELINES quote (rim p05 11.4 → 11.7, fade band 451 → 446,
  worst-interior `#677b60` → `#516c61`) - and re-measuring those documented
  claims across two policy documents is out of this task's scope. Reverting
  one line restored every documented figure exactly (rim re-run: p05 11.4,
  median 15.6, fade n=451, worst interior `#677b60`). The mandatory void
  background/fog alone never moved them.
- Visual check `.tmp/skin-006.png`: map dissolves into the same void the panel
  sits on, terrain reads cooler; signal steps yellow→crimson and ash rim
  unchanged; `palette.test.js` 6/6 green (data palette byte-identical).
