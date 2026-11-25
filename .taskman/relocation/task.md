# Task: relocation

## Description

Make the antenna relocatable. Today the mast is welded to the map centre: the
site pad, the mast, the rig and the coverage grid all assume the site sits at
`(0, 0)`, and `terrain/site.js` already accepts `x`/`z` but nobody passes them.

Finished means:

- The site position is ordinary, validated application state (`state.site.x` /
  `state.site.z`, metres, `+X` east and `+Z` south), reachable through the same
  patch channel as every other field: two panel sliders in *Placement and aim*,
  URL parameters, and `window.__sim.patch()`.
- The flattened site pad, the mast, the hardware, the lobe and the whole coverage
  grid move with the site. Moving the site dirties the terrain stage (the pad is
  baked into the height field) and therefore coverage.
- The antenna can be grabbed with the mouse and dragged across the map: hovering
  the mast changes the cursor, pressing and dragging moves the site along the
  ground plane under the pointer, and the orbit camera stays out of the way while
  a relocation drag is in progress.
- It can be put back: a *Reset placement* button (`reset-site` action) returns the
  site to the map centre, and `reset-all` keeps resetting everything as before.
- Docs (README.md user-facing, GUIDELINES.md structural) and the tests
  (`tests/unit/`, `tests/browser/`) say so, and `npm run verify` is green.

Constraints that shape every step: zero dependencies, the pure core must keep
running in bare Node, `three` stays behind the L4 adapters, new user fields go
into `STATE_FIELDS`, new tunables into `src/config.js`, new modules into
`LAYER_TABLE`, and `src/` files stay under the 350-line budget.

## Steps

1. step-001 — config: site placement constants and the camera FOV
2. step-002 — fields: `site.x` and `site.z` state fields
3. step-003 — state: `site` in the reducer with nested patch support
4. step-004 — panel schema: show the two site sliders
5. step-005 — unit tests: relocating the site through the reducer
6. step-006 — terrain: the flattened pad follows the site
7. step-007 — unit tests: the pad sits under a moved site
8. step-008 — controller + viewport: the site flows through the pipeline
9. step-009 — pure picking maths (`src/app/pick.js`)
10. step-010 — unit tests: screen-to-world picking invariants
11. step-011 — orbit controls: an `intercept` gate for pointer grabs
12. step-012 — the drag adapter (`src/app/relocate.js`) wired into the controller
13. step-013 — `reset-site` action and the *Reset placement* button
14. step-014 — test API: site and drag surface on `window.__sim`
15. step-015 — browser tests: relocate by patch, by drag, and back again
16. step-016 — URL parameters `?siteX=&siteZ=` and the HUD read-out
17. step-017 — documentation: README.md and GUIDELINES.md
18. step-018 — full `npm run verify` and the closing commit

*(Step statuses are tracked only in each `step-NNN/status` file, never here.)*

## Comments

<!-- Globally important findings discovered during execution are appended here
     as bullet points. This section starts empty and is append-only. -->

- `tests/unit/state.test.js` holds a completeness invariant — *every key in
  `STATE_FIELDS` must have a widget in `buildPanel()`*. So the field-table step,
  the reducer step and the panel step cannot each end with a green unit suite:
  the unit suite is expected to be red from step-002 until step-004 lands, and
  only then is `npm run test:unit` the gate again.
- `node tools/staticserver.js start` / `npm run serve` is **foreground**, and
  `node tools/browser.js eval` leaves a persistent browser behind: every manual
  verification in this task must background the server, stop both afterwards, and
  run under `node tools/timebox.js -t N -- …` (see step-008 comments).
- `node tools/browser.js eval --wait "EXPR"` evaluates **EXPR more than once**
  (`--wait` polls with the same expression). Only use it for read-only
  expressions; stateful verification scripts must omit `--wait`, otherwise the
  reported state comes from the last repeat.
- Once a gesture can be intercepted, anything that captured the pointer on
  `pointerdown` must not assume it owns it on `pointerup` — orbit's unconditional
  `releasePointerCapture()` threw on every relocation drag until step-012 guarded
  it (recorded in step-012 comments).
