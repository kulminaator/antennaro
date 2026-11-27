# Task: sci-fi-look-and-feel

## Description

Give the application a modern, futuristic sci-fi look and feel, then regenerate
the README screenshots so the documentation shows the new skin.

The skin lives almost entirely in `assets/app.css`: a deep-void background,
translucent "console" panels, clipped-cut corners, glowing cyan accents,
uppercase letter-spaced headings, monospaced tabular numerals, custom sliders
and buttons, and a HUD styled as a mission read-out. In the 3D scene, only the
`VIEW.background` / `VIEW.fogColour` atmosphere in `src/config.js` changes to a
deep void that matches the chrome.

Hard constraints (from README/GUIDELINES and the test suite):

- **Data colours do not move.** The four signal steps, the violet→mint zone
  ramp, the ground-keyed faint wash, the terrain ramp (`src/palette.js`,
  `COLOURS.levels`, `COLOURS.fresnel*`) are measured invariants with CIEDE2000
  floors and README claims. The skin is chrome, never a re-colouring of a
  pixel that means something. The UI accent stays cyan, clearly outside the
  warm signal scale and the zone ramp.
- **DOM contracts hold.** `tests/browser/legend.test.js` reads
  `.hud-legend` rows, `.legend-label`, `.legend-count`, `.legend-swatch`
  (inline `style.background`/`opacity` set by `src/ui/hud.js`) and the legend
  title via `previousElementSibling`; `tests/browser/curvature.test.js` reads
  the curvature row's DOM text; the About dialog's provenance text is likewise
  DOM-read. No class names, ids, inline styles or node orders change — this
  task edits CSS only, plus two config colour literals.
- **README claims stay true**: the startup-failure banner stays **red**; the
  boot guard script in `index.html` is untouched; no external fonts, no CDN,
  no build step (zero dependencies).
- Definition of done: `npm run verify` green, all four `docs/*.png`
  regenerated at 1440x820 with the tool (`tools/browser.js shot`), captions
  re-checked against the pixels.

## Steps

1. step-001 — theme tokens and base surface in app.css
2. step-002 — panel chrome: glass groups, glowing titles, footer
3. step-003 — widgets: sliders, selects, toggles, buttons, focus rings
4. step-004 — HUD console, stage head, legend, boot-error (kept red)
5. step-005 — About dialog, scrollbars, responsive pass
6. step-006 — 3D scene atmosphere: void background + fog in config
7. step-007 — full `npm run verify`
8. step-008 — regenerate the four README screenshots, read them back
9. step-009 — README claim sweep against the new look
10. step-010 — final verify, close-out comment, commit

*(Step statuses are tracked only in each `step-NNN/status` file, never here.)*

## Comments

<!-- Globally important findings discovered during execution are appended here
     as bullet points. This section starts empty and is append-only. -->

- `tools/browser.js` page lifecycle: `shot --url` rotates the driving page, so
  chaining `eval`/`shot` without `--url` afterwards exits 4 ("no page is
  open"). For multi-command sequences use `open URL` first, then commands
  without `--url` reuse it (matters for steps 005 and 008).
- CSS `background:` shorthand followed by a later `background-image:` line
  silently discards the shorthand's own gradient - the HUD-card skin must set
  an opaque `background-color` plus one combined `background-image` list.
- The rim's canvas floors are insensitive to scene atmosphere: void fog
  (`0x04070e`) left interior p05 at 11.4, and cooling the sun improved it to
  11.7 (floors 10/13). Fog/light tint is safe; data-colour edits are not.
- `src/config.js` sits at its 350-line budget: comments added there must be
  inline, not extra lines, or lint's `file-size` rule fails the verify gate
  (hit and fixed in step-007).
- **Amends the atmosphere bullet above:** scene *light* tint is NOT free -
  the README/GUIDELINES quote canvas rim measurements (p05 11.4, median 15.6,
  fade 451 of 1330, worst interior `#677b60`) that are taken under the exact
  shipped lights. Cooling the sun moved them, so step-009 reverted the sun to
  `0xfff3e0`. Fog/background tint is safe (left every figure identical);
  light colours are documentation. Screenshots must always be re-shot from
  the shipped bytes for the same reason.
- **Close-out (step-010, task complete).** The skin: an ion-cyan console on a
  deep-space void - token set in `assets/app.css` `:root` (`--bg #04070e`,
  `--accent #4fd6ff`, mono `--font-mono` numerics, `--cut` corner clip),
  glassy angular group cards with scanlines and glowing ▸ titles, slider
  rails with emitter thumbs, angular buttons, a mission-console HUD (opaque
  card, corner brackets, stencil headline), re-skinned About dialog, console
  scrollbars, focus rings; the 3D scene shares the void via
  `VIEW.background`/`fogColour = 0x04070e`. Deliberately unmoved: every data
  colour (`COLOURS`, terrain ramp, faint wash), every DOM contract (legend
  rows, curvature sentence, About text), the still-red boot banner, the
  zero-dependency rule. Final gate: `npm run verify` exit 0 - vendor ok, lint
  ok, 36/36 test files (256 tests) in 95.7 s; rim floors measured unchanged
  (p05 11.4 / median 15.6). All four README screenshots re-shot at 1440x820
  from the shipped bytes and read back digit-true.
