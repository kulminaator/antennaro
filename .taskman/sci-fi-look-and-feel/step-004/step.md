# step-004: HUD console, stage head, legend, boot-error (kept red)

## How to perform this step

1. In `assets/app.css`, restyle the stage and read-out (selectors unchanged):
   - `.stage-head h1`: `font-size: 1.02rem; letter-spacing: 0.22em;
     text-transform: uppercase; text-shadow: 0 0 12px rgba(79, 214, 255, 0.45)`;
     the `p` keeps `var(--text-dim)` with `letter-spacing: 0.06em`.
   - `.hud-card`: the mission console card — `background: linear-gradient(180deg, rgba(10, 18, 30, 0.82), var(--bg-card))`,
     `backdrop-filter: blur(6px)`, `border: 1px solid var(--line-strong)`,
     `clip-path` corner cut like `.group` (reuse the same `--cut` polygon),
     scanline texture same as `.group`. Corner brackets via
     `.hud-card::before` and `::after` (2px L-shaped cyan borders at opposite
     corners — position absolute inside a `position: relative` card; the card
     is the HUD's own child element, pseudo-elements add no DOM nodes tests
     could confuse). Check first that `src/ui/hud.js` builds no content into
     `.hud-card` via `::before` expectations — it does not, DOM text is real
     nodes; the legend title is `legendList.previousElementSibling`, a real
     node, so pseudo-elements are safe.
   - `.hud-headline`: `letter-spacing: 0.12em; text-transform: uppercase;
     color: var(--accent); text-shadow: 0 0 10px rgba(79, 214, 255, 0.35)` —
     careful: the headline text is real content, only style it.
   - `.hud-stats dd`, `.hud-sectors td/th`, `.legend-count`, `.field-value`:
     `font-family: var(--font-mono)`. `.hud-stats dt` stays `var(--text-dim)`.
   - Legend: keep `.legend-swatch` `width/height/border-radius` and add only
     `box-shadow: 0 0 0 1px rgba(255,255,255,0.12)`; **never set `background`
     or `opacity` on it** — `src/ui/hud.js` writes those inline and
     `tests/browser/legend.test.js` reads them back.
   - `.boot-error`: keep it **red** (README promises a red banner), restyled:
     `background: rgba(64, 12, 18, 0.92)`, `border: 1px solid #ff4d5e`,
     `box-shadow: 0 0 18px rgba(255, 77, 94, 0.25)`, mono font.
2. Verify: `node tools/browser.js stop --all` then
   `node tools/timebox.js -t 240 -- node tools/test.js --browser --only tests/browser/legend.test.js`
   and the curvature one the same way — these are the two DOM-reading legend/
   sentence tests; both green proves the console skin left the contracts alone.
   Shot the valley preset for a look: `node tools/timebox.js -t 120 -- node
   tools/browser.js shot --url "http://127.0.0.1:8147/?preset=valley-reach"
   --name skinstep --width 1440 --height 820 --out .tmp/skin-004.png`, read
   it back: HUD reads as a glowing console card, all rows legible.

## Expected result

The right-hand read-out is a sci-fi mission console (glass card, corner
brackets, mono digits, glowing headline), the title bar reads as a HUD stencil,
the failure banner is still red, and the DOM-contract tests pass untouched.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Executed: stencil-uppercase glowing `.stage-head h1`; `.hud-card` as opaque
  console card (`#0a111d` base + scanlines + top cyan sheen) with clip-path
  corners and empty-content `::before/::after` L-brackets at the two corners
  the clip leaves (top-right, bottom-left); uppercase cyan `.hud-headline`;
  `--font-mono` on `.hud-stats dd`, `.hud-sectors`, `.legend-count`;
  `.legend-swatch` got only a ring box-shadow (inline bg/opacity untouched);
  `.boot-error` restyled as a glowing red holo-banner - still red.
- **Readability lesson (first pass failed the read-back):** card alpha
  0.78-0.82 over sunlit valley ground ghosted the Curvature/EIRP rows in
  `.tmp/skin-004.png`. Fixed by an opaque card base (`#0a111d`, scanline +
  sheen as background-*images*, not a translucent gradient).
- Trap avoided as recorded in step-001: no `text-transform` or text-bearing
  pseudo-elements on `.hud-stats dt/dd`, so `curvature.test.js` still finds
  the exact `Curvature` line. Both DOM-contract suites green
  (`legend` 1/1, `curvature` file passed), valley shot re-read: every read-out
  digit legible and equal to the README (2019/30624, 84.2 %, 2481 m @ 181 deg).
