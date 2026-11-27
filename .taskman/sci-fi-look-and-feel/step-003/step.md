# step-003: widgets — sliders, selects, toggles, buttons, focus rings

## How to perform this step

1. In `assets/app.css`, restyle the controls (selectors unchanged):
   - `select`: `background: var(--bg-input)`, `border: 1px solid var(--line)`,
     `border-radius: 6px`, `color-scheme: dark` (native dropdown stays dark);
     `:focus` border `var(--line-strong)` + `box-shadow: var(--glow)`.
   - `input[type='range']`: sci-fi track/thumb. `appearance: none`; height
     `18px`; track `4px` bar `background: linear-gradient(90deg, var(--accent-dim), var(--line))`
     with rounded caps; thumb `appearance: none`, `12px` round or diamond,
     `background: var(--accent)`, `box-shadow: 0 0 8px rgba(79, 214, 255, 0.6)`.
     Write both `-webkit-slider-runnable-track/-thumb` and
     `-moz-range-track/-moz-range-thumb` variants. Keep
     `input[type='range']:disabled { opacity: 0.4 }`.
     **Do not remove `accent-color: var(--accent)` from `.field-toggle input`**
     (checkbox styling without prefix pain).
   - `.btn`: `background: linear-gradient(170deg, rgba(28, 44, 66, 0.9), rgba(12, 20, 33, 0.9))`,
     `border: 1px solid var(--line)`, angular corner `border-radius: 2px 10px 2px 10px`,
     `letter-spacing: 0.06em`; `:hover` gets `border-color: var(--line-strong)`,
     `box-shadow: var(--glow)`, `color: #fff`; `:active` slight `transform: translateY(1px)`.
   - `.field-value` and `.field-label`: `.field-value` gets
     `font-family: var(--font-mono)` (tabular numerics already on);
     `.field-head` layout untouched.
   - Add one global rule at the end: `:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }`.
2. Verify: shot as before to `.tmp/skin-003.png` and read it back (sliders show
   a thin cyan line with a glowing thumb, buttons look angular). Then run the
   DOM-heavy browser test to prove widgets still work:
   `node tools/timebox.js -t 180 -- node tools/test.js --browser --only tests/browser/interaction.test.js`
   and also `node --test tests/unit/panel.test.js`. Both green.
   Before the test run: `node tools/browser.js stop --all` (the shared
   `skinstep` profile may hold the port; the suite sweeps orphans anyway).

## Expected result

Every control reads as holo-console hardware — glowing slider thumbs, angular
buttons, mono numerics — and the interaction suite proves they still work.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Executed: webkit + moz custom range track/thumb (4 px cyan rail, 12 px glowing
  thumb, `margin-top: -4px` to centre it on the webkit track), select via
  `--bg-input` + `color-scheme: dark` + focus glow, `.btn` angular
  `2px 10px 2px 10px` corners with hover glow and `:active` press,
  `.field-value` in `--font-mono`, global `:focus-visible` at file end.
  `accent-color` kept on `.field-toggle input`; removed only from range where
  `appearance: none` replaces it.
- Verified: `interaction.test.js` 10/10 green (patch/clamp/wrap/design/seed
  paths all exercise the real DOM inputs), `panel.test.js` green, shot shows
  rail+thumb and mono values, disabled azimuth slider visibly dimmed.
