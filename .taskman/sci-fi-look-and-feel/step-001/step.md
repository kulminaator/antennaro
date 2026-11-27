# step-001: theme tokens and base surface in app.css

## How to perform this step

1. Inventory first (do not skip): `grep -rno "querySelector[^;]*" tests/browser/ | head -40`
   and skim `src/ui/controls.js`, `src/ui/hud.js`, `src/ui/about.js`. Record in
   the step comments the exact class/id set the tests and JS rely on
   (`.panel .group .group-title .group-note .field .field-head .field-label
   .field-value .field-toggle .button-row .btn .btn-ghost .panel-foot
   .stage .stage-head .hud .hud-card .hud-headline .hud-subtitle .hud-stats
   .hud-sectors .hud-legend .legend-item .legend-swatch .legend-label
   .legend-count .legend-note .hud-notes .hud-perf .boot-error dialog.about
   .about-* #app #panel #hud #scene #boot-error body.ui-hidden`). CSS may style
   these; nothing may rename or remove them.
2. In `assets/app.css`, rewrite the `:root` block to a sci-fi token set and
   keep every existing selector name working. Tokens (starting values, tune by
   eye in step-002+):
   ```css
   --bg: #04070e;            /* deep space void (match VIEW.background, step-006) */
   --bg-panel: rgba(10, 17, 28, 0.86);
   --bg-card: rgba(8, 14, 24, 0.78);
   --bg-input: rgba(6, 11, 20, 0.9);
   --line: rgba(86, 204, 242, 0.16);
   --line-strong: rgba(86, 204, 242, 0.38);
   --text: #d9e8f4;
   --text-dim: #7e93a8;
   --accent: #4fd6ff;        /* ion cyan - never warm (signal steps) nor mint (zone) */
   --accent-dim: rgba(79, 214, 255, 0.14);
   --glow: 0 0 14px rgba(79, 214, 255, 0.22);
   --font-ui: "Bahnschrift", "DIN Alternate", "Roboto Condensed", ui-sans-serif, system-ui, sans-serif;
   --font-mono: ui-monospace, "Cascadia Mono", "JetBrains Mono", Menlo, Consolas, monospace;
   --radius: 10px;  --panel-width: 330px;
   ```
   Update the file's header comment (it still points at the stale
   `src/ui/colours.js`; point it at `src/palette.js` + `src/config.js`).
3. `html, body`: `background: radial-gradient(120% 100% at 30% 0%, #0a1424 0%, var(--bg) 55%)`,
   `color: var(--text)`, `font-family: var(--font-ui)`.
   `#app` layout stays exactly as it is (grid columns, min-height).
4. Verify: `node tools/lint.js` green; serve
   `(setsid node tools/staticserver.js start --port 8147 --quiet >/dev/null 2>&1 &)`
   and `node tools/timebox.js -t 120 -- node tools/browser.js shot --url "http://127.0.0.1:8147/" --name skinstep --width 1440 --height 820 --out .tmp/skin-001.png`,
   read the PNG back: page renders, dark void, nothing broken. Leave the server
   up on 8147 for the next steps (it is loopback-only and denied to nothing).

## Expected result

`assets/app.css` carries a coherent sci-fi token set; base page renders as a
deep-void console shell; all existing selectors/classes untouched; lint green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- DOM contract inventoried from tests + `src/ui/*.js`: ids `#scene #panel #hud
  #boot-error #app`; classes `.panel .group .group-title .group-note .field
  .field-head .field-label .field-value .field-toggle .button-row .btn
  .btn-ghost .panel-foot .stage .stage-head .hud .hud-card .hud-headline
  .hud-subtitle .hud-stats .hud-sectors .hud-legend .legend-item
  .legend-swatch .legend-label .legend-count .legend-note .hud-notes .hud-perf
  .boot-error dialog.about .about-*  stat-<key> .sector-linked-X .sector-range-X`;
  attributes `[data-action] [data-group] [data-dir] [data-app]`;
  `body.ui-hidden` toggled by `h`; `controls.js` uses `closest('section')` so
  `.group` must stay a `<section>`; `hud-card` is a `<section>` inside `#hud`.
- **Trap found (not yet hit):** `tests/browser/curvature.test.js` does
  `.hud`→`innerText.split('\n')`→`line.indexOf('Curvature')` and reads the
  *next* line. `innerText` applies CSS `text-transform` and follows layout —
  so **no `text-transform`, no text-bearing `::before/::after` on
  `.hud-stats` `dt`/`dd`** (the labels), and `.hud-stats` must keep block
  layout so each cell is its own innerText line. Legend/About tests use
  `textContent` (CSS-proof) plus swatch *inline* styles — never restyle
  `.legend-swatch`'s background/opacity.
- `#101620` (select) and `#1b2531` (button) raw hex stay until their steps
  (step-003 restyles them via `--bg-input`; step-005 sweeps stray hex).
- Executed: tokens + radial-gradient void in `:root`/`html,body` only; lint ok
  (45 src / 15 tools / 38 tests). Shot `.tmp/skin-001.png` (1440x820): cyan
  glowing titles, dark void, HUD still prints `836 of 30624 (2.7 %)`, `29.6 %`,
  `936 m @ 153 deg`, `-50.1/-90.2/-116.7 dBm`, `73.7 %`, `87.9 %` - exactly
  what the README captions quote, so no physics moved. The scene background is
  still the old `0x0d1117` until step-006 moves `VIEW` to `--bg`.
