# GUIDELINES

How this project is put together, and the rules that keep it that way. The
user-facing story lives in [README.md](README.md); this file is for anyone
changing the code.

Everything below is enforced by tooling, not by good intentions:

- `npm run vendor` - the shipped third-party bytes match their manifest.
- `npm run lint` - syntax, layers, renderer boundary, purity, hygiene, reachability, line budgets, test layout, vendor integrity, import map, static hostability.
- `npm run test` - the same architecture rules as physics-like tests, plus the maths and the browser.

If a rule annoys you, change the rule in `tools/lib/arch.js` (and its test) -
never work around it silently.

## 1. Ground rules

- **Pure HTML + JS + three.js, and zero dependencies.** `npm install` is not
  part of running, building or serving this app - there is no build step and
  `package.json` declares nothing. The one third-party library is a committed,
  minified, hashed copy in `vendor/three/` (§2).
- **Node built-ins for tooling.** `tools/` uses `node:fs`, `node:http`,
  `node:child_process` and CDP over the global `WebSocket` - no puppeteer, no
  playwright, no test framework beyond `node:test`. If a tool needs a library,
  write 40 lines instead of adding a dependency.
- **Everything is timeboxed.** No `await` without a deadline, no spawned process
  without a budget. See §10.
- **The domain must run in plain Node.** If `node -e "import('./src/propagation/coverage.js')"`
  stops working because you touched a DOM API, that is a bug.
- **The repository root is the web root.** `index.html`, `assets/`, `src/` and
  `vendor/` are served exactly as they sit, so a clone works under
  `python3 -m http.server` and under a GitHub Pages sub-path. Every URL in the
  page is therefore relative, and the import map value must be *explicitly*
  relative (`./vendor/...`) - Chrome refuses a bare `vendor/...` value.

## 2. Directory layout

```
index.html       browser entry: boot guard, import map, panel + stage markup
assets/app.css   the stylesheet
LICENSE          MIT, our work
vendor/three/    the third-party bytes the browser loads (see §2a)
src/             application source, layered (see §3)
  config.js      every tunable number in the project
  math/          scalar, vec3, seeded noise
  core/          eventbus, frame loop
  terrain/       height field, generators, terrain mesh
  antenna/       catalogue, pattern maths, aim frames, model, meshes
  propagation/   rf algebra, line-of-sight/diffraction/Fresnel clearance, the multi-edge
                 screen sum (`diffraction`), one path's two questions (`pathtrace`),
                 coverage sweep, coverage bookkeeping
                 (`coveragestats`), coverage mesh, Fresnel zone mesh
  app/           state reducer, presets, controller, reports (coverage + summaries),
                 actions, viewport, camera, pointer
                 picking, site dragging, test API
  ui/            control panel, HUD, schema (schema is pure, the rest is DOM)
  palette.js     shared colours (renderer + DOM legend read the same table)
  main.js        composition root: build it, wire it, mount it
tools/           CLI tools, run with node (vendor, staticserver, browser, lint, test, timebox)
tools/lib/       tool internals (paths, args, timeout, proc, npm, scan, cdp, browser, arch)
tests/unit/      pure Node tests, no DOM, no browser
tests/browser/   headless-Chromium tests through CDP
tests/harness/   browser test harness (server + browser + app session)
docs/            screenshots for README.md (regenerate with tools/browser.js)
.tmp/            scratch: server state, browser profiles, artifacts (git-ignored)
node_modules/    may exist from tooling experiments; nothing at runtime needs it
```

**Everything below the repository root is public, by design.** The dev server
serves any file under the root except the `SERVE_DENY` prefixes (`.git`, `.tmp`,
`.github`, `node_modules`, `.env`), and GitHub Pages would publish `tools/`,
`tests/` and `docs/` as well. That is acceptable only because they contain no
secrets and nothing the runtime needs - which is the rule it implies: nothing
sensitive is ever committed at the root, and all scratch state (server pid files,
browser profiles, screenshots under review) lives in `.tmp/`, which is ignored
locally and denied by the server. `tools/` and `tests/` are development-only in
the sense that no shipped file imports them; `index.html` must keep working if
they are deleted.

## 2a. Vendored third-party code

`vendor/three/` holds exactly four files, and that list *is* the third-party
surface of the application:

| file | why it is there |
| --- | --- |
| `three.module.min.js` | the only bytes the browser imports as `three` |
| `LICENSE.txt` | three's MIT text, distributed with the code as the licence requires |
| `NOTICE.md` | what was built, from which upstream files (with sha256), using which minifier |
| `manifest.json` | the same facts in machine-readable form for `check` |

three publishes no minified ESM build, so we bundle `build/three.module.js` plus
the `build/three.core.js` it imports and minify the result. `node tools/vendor.js
bundle` does that: it downloads the exact published tarball from
registry.npmjs.org (no `npm install`), runs esbuild through `npx --yes`, prepends
a licence banner to the artifact and rewrites the manifest and notice. The
minifier version is recorded; esbuild is never a dependency of this project.

`node tools/vendor.js` (also run by `npm run lint` and by the architecture test)
fails if the shipped bytes no longer match the recorded sha256, if the licence
banner or `LICENSE.txt` is missing, or if the artifact stops being
self-contained. `tests/browser/app-boot.test.js` goes further and hashes the file
*inside the page*, so "the audited artifact" and "what actually ran" cannot drift.

The page also says all of that out loud: `ui/about.js` builds an About dialog whose
third-party notice names `vendor/three/`, and it fills in the release number and the
licence text by reading `manifest.json` and `LICENSE.txt` when the dialog is opened -
not by restating them in a source file, which would be a second truth free to go stale.
If the fetch fails (opened from elsewhere, offline) the dialog still names the licence
and links to where it lives.

To bump three: `node tools/vendor.js bundle --version 0.189.0`, then
`npm run verify` - the browser suite is what tells you a renderer API changed on
you.

## 3. Layers

Every module declares its layer in the header comment (`Layer: L2`) and the
declaration is checked against `LAYER_TABLE` in `tools/lib/arch.js`.

| Layer | Contents | May import |
| --- | --- | --- |
| L0 | `config.js`, `math/scalar.js`, `math/vec3.js` | nothing |
| L1 | noise, event bus, palette, terrain/antenna/propagation domain, `app/fields.js`, `app/pick.js` (pointer↔world maths) | L0 |
| L2 | domain services (`antenna/model`, `propagation/coverage`), `app/state`, `app/presets`, `ui/schema` | L0–L1 |
| L3 | `core/loop.js` (frame loop) | L0–L2 |
| L4 | render adapters (`*mesh.js`, `app/viewport`, `app/labels`, `app/orbit`, `app/relocate`) | L0–L3 |
| L5 | `ui/`, `app/` composition (`controller`, `reports`, `actions`, `testapi`), `main.js` | anything below |

Rules, enforced by lint:

- A module may only import from a **lower** layer.
- Every `src/*.js` must be classified in the layer table (no `layer: 99`).
- The header annotation must agree with the table.
- **No import cycles.**
- **Reachability:** every module in `src/` must be reachable from `src/main.js`.
  Dead code gets deleted, not commented out.

### Renderer boundary

`three` may be imported only by L4 render adapters (`*mesh.js`, `viewport`,
`labels`) plus `app/controller.js`, which builds the scene graph. The list is
`THREE_ALLOW` in `tools/lib/arch.js`. Nothing below L4 may know what a
`Vector3`, a `BufferGeometry` or a `ShaderMaterial` is: domain code returns
plain arrays and numbers, adapters turn them into geometry.

This is what makes the physics testable in Node and what keeps a three.js
version bump to a handful of files.

### Purity

`PURE_PATTERNS` in `tools/lib/arch.js` lists the modules that must run in bare
Node. They may not contain: `document`, `window`, `navigator`,
`performance.now()`, `Date.now()`, `Math.random()`, `setTimeout` /
`setInterval` / `requestAnimationFrame`, `fetch` / `XMLHttpRequest`, or any
`console.*` call. Lint reports each with the offending line.

One exception, deliberately kept in one place: the **`new-seed` user action** in
`src/app/actions.js` is allowed to call `Math.random()` to roll a terrain
seed. It immediately hands the number to the seeded generator, so the resulting
terrain is reproducible. No other randomness anywhere - all terrain features
come from `math/noise.js` seeded by `terrain.seed`. The architecture test pins
exactly one `Math.random()` in `src/` and that it sits next to `case 'new-seed'`.

### Hygiene

No `console.log`/`console.debug`, no `debugger`, no bare `TODO` (must be
`TODO(name): ...`), no `FIXME`. Line budgets: 350 lines in `src/`, 430 in
`tools/`, 320 in `tests/` - if a module hits its budget it is time to split it
(that is how `rigmesh.js` and `mapmesh.js` came to exist). `app/controller.js`
reached the budget during the Fresnel work and was split: the coverage recompute
and the summary objects went to `app/reports.js`, the `action()` switch to
`app/actions.js`. What is left is the stage machine and the meshes - which is its
job. Split on a seam, not at a line count: `reports.js` is the code that answers
"what does the scene contain", which was never the controller's.

The budget is measured, not hoped at: `node tools/lint.js` weighs every file in all three
trees against `LINE_BUDGET` (`tools/lib/arch.js`), and `architecturetools.test.js` asserts
the same for `tools/` and `tests/`. Both used to be narrower than this paragraph - lint only
weighed `src/`, the test only weighed `tools/` - which is how five test files reached 358,
344, 337, 335 and 331 lines while the sentence above said they could not. A rule that is
written down and not measured is a wish, so now it is measured twice.

## 4. Configuration centrality

Every tunable that describes the **world or the radio** lives in `src/config.js`:
world size and its limits (`WORLD.minWorldSize` / `maxWorldSize`, `minGridSize` /
`maxGridSize` - the reducer clamps requests with them, so a test can quote them instead
of a literal), terrain amplitudes and blend band, RF constants (including
`RF.speedOfLightMps`, `RF.kFactor` and the band table), antenna limits, where the
mast may stand (`ANTENNA.defaultSiteXm` / `defaultSiteZm` / `siteLimitsM` /
`siteStepM`, shared by the sliders and the drag), the shape of the sweep
(`RF.coverageStride` - the coverage grid is a decimation of the terrain grid - and
`RF.defaultMaxRangeM` / `RF.maxRangeLimitsM`, which are a *work area*, not a prediction),
how a failed link is painted (`RF.noLinkAlpha`, `RF.faintLightnessShift` and `RF.faintChromaKeep`
- together the ash wash that stands for *asked and lost*, each value fixed by the CIEDE2000 floors
recorded in section 7; `COLOURS.rangeLimit` is the ring that names the work area),
the Fresnel criterion
(`RF.fresnelClearFraction`, `RF.fresnelRxHeightM` - the receiver height the verdict
is stated for - and `RF.fresnelEndpointGuard`), how far a ray walk samples
(`RF.profileMaxSamples`, which is a ceiling on absurd path lengths and not a limit this
map reaches - the real rule is `pathSamples()` in `rf.js`: **one sample per terrain
cell**, because a crest 15 m wide does not exist for a walk that samples every 100 m, and
the difference measured on this map is 6.5 dB of worst-case error against 1.9 dB), the
diffraction model (`RF.diffractionEndpointGuard` and `RF.diffractionNearEndM`, which keep
the two ray ends out of the screen list, and `RF.diffractionEdgeLimit` - how many of the
screens found along a path are actually superposed), the `FRESNEL` block (mesh density,
opacity, `radialExaggeration`, `rampMaxRatio`, `groundSearchStepM`), the
`COLOURS.fresnel*` stops of the zone ramp, the four signal steps
(`RF.levelMarginsDb` with `RF.levelNames`, placed on the measured margin distribution rather
than on round numbers - the median linked cell of the six shipped configurations has 2.9-5.1 dB
of room, so the old 45/30/15/0 put 93-98 % of every map in one colour - and `COLOURS.levels`,
whose closest neighbours are 11.5 CIEDE2000 apart under the worst simulated eye), the drape's
own `RF.overlayOpacity` (it used to be a literal inside `coveragemesh.js`, which is why no test
could say what it cost: every step has to stay >= 24 CIEDE2000 from the bare ground under it,
and at 0.35 it no longer does, which the palette test now reports),
`RF.defaultCoverageView`, and
`ANTENNA.apertureEfficiency` / `apertureEfficiencyDefault`, which are not decoration:
they *are* the gain of every directional design
(`gain = krausDirectivityDbi(H, V) + 10*log10(efficiency)`), so pattern and link budget
cannot disagree, and an efficiency above 1 would be a design with more gain than its own
beam can hold, the study-range ring
(`VIEW.rangeRingSamples` / `rangeRingLiftM` / `rangeRingOpacity`), camera
defaults, colours, path names and every timeout. The UI schema and the state
reducer read the same ranges, so a slider can never disagree with the physics.
`VIEW.cameraFovDeg` is here for the same reason: `app/pick.js` needs the vertical
FOV to unproject a pointer, and a FOV that only the renderer knows would let the
mouse and the picture disagree.

**A default must lie inside the control that displays it, and both bounds come from
config.** `TERRAIN.seedMin` / `TERRAIN.seedMax` exist because they did not: the default
seed was 20251105 and the seed slider stopped at 999999, a range input sanitises an
out-of-range value to its nearest bound, and Blink reports that sanitisation as an
`input` event - so the panel wrote 999999 into the model at boot and the app simulated a
different map from the one `config.js` asked for, silently, for months. Nothing in the UI
pushes a value into the state by hand, and it does not need to: the reducer clamps, so a
value that is in bounds is never rewritten by the DOM. `tests/unit/state.test.js` asserts
that every numeric control of every design has its own default inside its own `[min, max]`.

A module may keep a local numeric constant only when it is not a knob:
a mathematical identity (`DEG_PER_RAD`), a structural count (`SECTOR_COUNT`), a
numerical guard (`DEGENERATE_DOT` in `aim.js`), or something purely presentational
that nobody would ever tune from the panel (`ORBIT_SPEED`, `HUD_REFRESH_MS`). The
two borderline cases are deliberately declared next to the maths they belong to -
`PATTERN_FLOOR_DB` in `antenna/pattern.js` and `NEAR_FIELD_SKIP_FACTOR` in
`propagation/coverage.js` - because moving them to config would separate a model
from the constant that defines where the model stops being meaningful. A third joins
them in `propagation/diffraction.js`: `KIRCHHOFF_FIT_FLOOR_V`, the value of the signed
screen parameter below which the fitted Kirchhoff curve is no longer used at all. It is
not a knob - it is where the fit stops being a fit - and putting it in `config.js` would
invite a tuning that the physics does not support. All three are
named, exported or commented, and pinned by tests; none is a magic number
inline in an expression.

## 5. Coordinates and frames

Right-handed world frame: **+X east, +Y up, −Z north**. Compass azimuth is
measured from north, clockwise.

Antenna orientation is built by `antenna/aim.js`:

- `forward` - boresight (where the main lobe points)
- `right`   - the user's right, used for labels
- `up`      - world-ish up
- `axisX`   - local +X used as the pattern/mesh basis, defined as **`-right`**

`(axisX, up, forward)` is a proper rotation (determinant `+1`). Getting this
wrong silently mirrors the pattern - the mesh and the coverage maths would then
disagree about which way the Yagi points. `antennamesh.js` builds its matrix
from those three basis columns; tests pin the handedness.

The **site is a position, not the origin**: `state.site.x` / `state.site.z` say
where the mast stands, and `terrain/site.js` is a pure function of
`(x, z, siteX, siteZ)`. The height field, the mast transform, the coverage source,
the picking plane and *Reset view* all read that resolved position; the four
terrain zones belong to the map and never move with the site.

`app/pick.js` turns a pointer position into a world point by reproducing three.js'
`lookAt` basis (`right = up × forward`, `trueUp = forward × right`) - the same
handedness trap as `axisX = -right` above: grab the sign of `right` and every
east-west drag mirrors, silently, exactly like a mirrored pattern would.

## 6. Data flow

```
UI widget ──patch──▶ applyPatch()  ──▶ state (immutable)
                        │  reports {ok, changed, clamped, rejected}
                        ▼
                 impactedStages()  ──▶ terrain | antenna | coverage | display
                        │
                        ▼
                  controller ──▶ pure models ──▶ meshes via L4 adapters ──▶ frame
```

- The UI **never mutates state**; it emits patch objects. This is more than style: a
  DOM control that can write back is a second source of truth (see the seed story in §4 -
  a range input sanitises an out-of-range value and Chrome reports that as user input).
  `createInitialStateWithReport()` exists so even the values a *URL* asked for that the
  model refused are reported instead of quietly applied.
- `applyPatch` validates against `STATE_FIELDS`, clamps out-of-range numbers,
  rejects non-numeric junk (`null`, `''`, booleans) and returns
  `{ok, changed, clamped, rejected}` (`ok` is just `rejected.length === 0`).
  Actions answer `{ok: false, reason}` instead of throwing.
- `STATE_FIELDS` in `src/app/fields.js` is the single source of truth for
  user-controllable fields: key, path, label, kind, range, unit, group and
  **impact** (which pipeline stages a change invalidates).
- `ui/schema.js` derives the panel from `STATE_FIELDS` + the catalogue. Adding a
  field to the table adds the control, the validation and the invalidation map
  in one go.
- Controllers and meshes are rebuilt only for dirty stages.

## 7. Domain notes

- **Terrain** is a height field on an odd-sized grid (so the map centre is exactly a
  cell centre), built from four angular zones - mountain (N) with a taller
  distant range, flat field (E), valley (S), bumps (W) - blended across
  `TERRAIN.blendBand`. The **valley is a southern feature**: its floor and rims
  fade out north of the map centre (`TERRAIN.valley.northLimit` / `southLimit`, fractions
  of the half-extent), because the floor is measured across `x` and would otherwise
  cut a trench the whole length of the map - through the mountain sector and
  straight through the middle of it.
  **The height field does not know where the antenna is, and must not learn.** The
  generators take a seed and a world size and nothing else; `heightAt()` is those four
  zones; `state.site` is deliberately absent from the terrain cache key, so relocating
  the mast re-runs the coverage and the scene but never the ground. There *was* a
  flattened site pad under the mast, graded to the ground the mast stood on. On gentle
  ground it read as a workmen's platform; on steep ground it was a landform - with the
  mast on the shoulder of the northern ridge it filled the slope by 99.7 m only 57 m
  away, the plateau travelled with the mast, and the coverage shadowed everything
  behind its new cliff. Users read that, correctly, as the hills moving when the
  antenna moves. If a future feature wants the ground to depend on the antenna, that
  is where it was already tried and removed.
- **Antenna pattern** is separable azimuth × elevation, evaluated per direction.
  Catalogue entries carry `pattern(params)` and, for directional designs,
  `beamwidths(params)`; the model adds aim, tilt and electrical downtilt, and clamps to
  `PATTERN_FLOOR_DB`.
- **A directional design's gain is derived from its beam, never typed next to it**:
  `gain = krausDirectivityDbi(H, V) + 10*log10(ANTENNA.apertureEfficiency[id])`, using the
  same `beamwidths(params)` the pattern is drawn from. Kraus's `41253 / (H * V)` is an
  *upper* bound - efficiency may never exceed 1 - and it does not apply to a 360 degree
  plane, so the two omni designs keep an array-factor gain
  (`2.15 + 10*log10(sections) - 1.0`). Two gain models in one file is deliberate; do not
  "unify" them into one formula that fits neither. The bug this rule exists to prevent: a
  69 x 69 degree biquad charging the link budget with 12.4 dBi when its ceiling is 9.4,
  which made a small wide antenna outrange a long Yagi and looked to users like every
  design predicted the same map. Enforced by `tests/unit/antennaphysics.test.js`.
- **Coverage** evaluates the link budget per cell: EIRP toward the cell, minus
  free-space loss, minus the diffracted loss over the sampled ground profile - screens
  found on a `kFactor` Earth, superposed, see the shadow note below - minus clutter.
  Levels are **margin over the
  receiver sensitivity**, so the legend moves when the user changes sensitivity.
  The sweep runs over the **whole map** on a grid that is a deliberate decimation of the
  ground (`RF.coverageStride`: 15 m terrain, 30 m coverage, 90 ms instead of 734 ms for
  the worst case) - the mesh still uses every terrain vertex, only the radio questions are
  asked less often. `coverage.js` is the hot loop; one path's two questions (what does
  the ground cost in dB, and does it keep the zone clear) live in `pathtrace.js`, and the
  bookkeeping - compass tally, the limit report, which directions were clipped - in
  `coveragestats.js`.
- **A limit the app chooses must be drawn and named.** Three things can end the coverage
  picture: the link's own budget, the user's study range, and the edge of the map. The
  result says which (`stats.limitingFactor`), how much linked ground sits on each border
  (`clippedByRangeCells`, `clippedByMapCells`), and per direction the boundary it ran into
  (`limitM`, `limitKind`, `clippedBy`) - computed in the domain from the mast's real
  position, because a mast 300 m from the west wall has 300 m of west and 4900 m of east.
  `math/vec3.js`'s `rayBoxExitDistance` is what makes "how far until this ray leaves the
  map" a piece of maths rather than a guess. The HUD then says it in words ("our study
  range 1.40 km - the link would reach 1.67 km") and marks a clipped direction `>=`.
  The study-range ring (`app/mapmesh.js`) is drawn *only when it could bind*: a circle
  that can never be the limit trains the eye to ignore the one time it is. "Could bind" is
  measured **from the mast**, not from the middle of the map - `math/vec3.js`'s
  `farthestGroundDistanceM` says how much map there is left from where the antenna stands -
  because `RF.maxRangeLimitsM.max` is wider than the map on purpose (6 km against a 5.2 km
  map, which is 3.68 km of ground from the centre and 7.35 km from a corner), so a ring may
  be real for one mast position and decoration for the next.
- **Three alpha values are a contract, not a style choice.** `1` means the link works,
  `RF.noLinkAlpha` means the ground was asked and defeated the link, `0` means the ground
  was never asked. Beyond the free-space budget the sweep stores the upper bound and marks
  the point `budgetExcluded` instead of walking a ray - legitimate because diffraction and
  clutter only subtract, so a point that misses sensitivity on free space alone could not
  have been saved by the terrain. That makes the pre-filter lossless for the linked set,
  which `coverage: the budget pre-filter cannot move the link boundary` proves by
  comparing both paths over the real map (same linked set, same steps, bit-identical dB at
  every walked point, and every dismissed point shown to be unreachable). The consequence
  is that an excluded point carries **no verdict**: no paint, no band, no Fresnel claim,
  and its clearance sentinel must never be read as "clear".
- **Every percentage names its denominator.** Link availability is over the walked points,
  map coverage over the evaluated points, the Fresnel shares over the *linked* points (a
  zone verdict about ground that cannot receive anything is not information), and each
  compass sector's percentage over the points in it that were neither dismissed nor the
  mast's own cell. A single unlabelled "coverage %" is how a big map next to a small link
  gets read as a bad antenna.
- **The first Fresnel zone is a flag, not a loss term.** `propagation/los.js`
  samples the same ground profile the diffraction loss uses and reports the worst
  height of the ray above the ground along the path, in units of the first-zone
  radius `r1 = sqrt(lambda * d1 * d2 / (d1 + d2))`; the cell is *clear* when that
  stays above `RF.fresnelClearFraction`. Write the relationship down once: the
  Kirchhoff/Lee parameter the loss is computed from **is** `v = sqrt(2) * h / r1`, so
  charging a second penalty for the same ground would be double counting, and the
  zone answer is the reliability reading of the same walk, not new physics.
  Because the zone closes to nothing at either antenna, clearance is judged for a
  terminal `RF.fresnelRxHeightM` above the cell and outside
  `RF.fresnelEndpointGuard` of both ends: against a receiver lying on the ground the
  criterion always fails, and over flat ground it is met only inside
  `2.2 * (h1 + h2) / lambda` (89 m at 868 MHz with a 10 m mast), which is why the
  assumption is a slider whose value the legend and `fresnel()` both print.
  So `coverage.js` walks each path twice when diffraction is on - once to the cell's
  own ground, which is what the decibels are charged against (the receiver height
  must not move the RSSI: pinned by a unit test and a browser test), once to the
  raised terminal for the zone. A cell can be badly diffracted *and* zone-clear, and
  that is geography, not a bug to reconcile.
- **One drape, two readings.** `display.coverageView` is a select with exactly
  `steps | zone`, and `propagation/coveragemesh.js` paints from that one field -
  `coverageRgb` for the step the sweep banded the cell into, or `palette.fresnelZoneRgb`.
  It is a *mode*, never a marking laid over another view: only a minority of cells meet the
  zone criterion, and a tint over the signal steps would make a pixel mean two things. The
  **alpha channel is the same in both** - that part of the message is not a matter of taste -
  the legend is chosen by the same field
  (`coverageLegendItems` / `fresnelZoneLegendItems`, each with
  its own title and each counting every point the sweep can account for), and switching a
  view may not move a single decibel: `browser: the coverage view repaints the drape, and no
  view changes a decibel` walks `steps -> zone -> steps` and requires the whole coverage stats object
  to be `deepEqual` at every stop. `display.showFresnel` is now only the *volume*; a control
  that both drew a tube and recoloured the map was a control whose label lied. A scenario
  never picks a view - presets carry no `display` block, so `?preset=...&fresnel=1` still
  reaches the zone picture and the panel keeps the last view the user chose, and a unit test
  refuses any preset that resolves to a view the panel does not offer.
  The two views replaced three: `bands` and `gradient` were flat steps and a continuous ramp
  over the same signal strength, and both are refused by the reducer now, so the legacy
  spellings are translated in `main.js`, at the URL boundary where old links arrive
  (`LEGACY_COVERAGE_VIEWS`). That is deliberate: the reducer's select coercion rejects any
  value the field table does not offer, which is the house rule for every select, and a
  silent normalisation in one field would break it for all of them.
- **The signal scale is keyed to margin, and its steps are absolute.** The band index comes
  from dB *over the receiver sensitivity*, never dBm, so moving the sensitivity slider cannot
  recolour a map that describes the same antenna over the same ground; and the thresholds are
  never normalised to the best cell on screen, because two screenshots of two different links
  would stop being comparable. Four steps, ordered by lightness (L* 93/74/53/31) because
  lightness is the axis colour blindness keeps, and no more than four because the best gap a
  red-through-yellow path can offer is 19.5 / 12.5 / 9.5 CIEDE2000 for 3 / 4 / 5 steps: a fifth
  would be a colour indistinguishable from its neighbour. Both predecessors are refused by
  measurement, not taste - `tests/unit/palette.test.js` fails the thresholds this app shipped
  for months ("every step must occur on an ordinary link") and fails a top step nobody reaches
  (30/15/5/0 lands on 0.2 % of an ordinary link's cells).
  A colour claim is only as good as its ruler, so the ruler is calibrated in the same file
  against published CIEDE2000 rows - including the blue-sign-flip pair that catches a missing
  rotation term - and shared through `tests/harness/colour.js` rather than copied, because a
  ruler duplicated per test file drifts into whatever it was copied beside.
  The gradient these steps replaced was keyed the same way and was still unreadable: its stops
  sat at L* 76/89/76, its two ends 0.4 apart, its middle the brightest pixel on the map, and
  its legend rows were thirds of its own ramp - a design that could only be checked by asking
  whether a reader could tell two cells apart, which nobody had done.
- **Two views, two vocabularies of colour.** The signal steps are warm and the zone ramp is
  not: violet through mint (`#663f81` / `#be77e2` / `#3effb7`, L* 34/61/90, neighbours 26.5 and
  40.9 CIEDE2000 apart at the tightest), because the two views are switched and a colour that
  means "clear zone" cannot also mean "comfortable link". The zone ramp used to be purple /
  amber / green, and its amber `#e8c33c` sat 10.7 from the yellow signal step - close enough
  that switching views moved cells without moving meaning - while the old ramp itself was only
  9.4 apart at its tightest under protanopia. The palette test now refuses any pair across the
  two scales below 12 CIEDE2000 in any simulated eye (measured floor 15.7, yellow against mint)
  and any two zone states below 12 (floor 26.5). Colour names are declared once, in
  `COLOURS`, and the DOM legend, the drape and the tests all read that one table, so a hue
  cannot be retyped into one of the three and quietly diverge.
- **The asked-and-lost rim is keyed to the ground, not to a colour.** An out-of-coverage cell is
  painted `palette.faintWashRgb(ground)` at `RF.noLinkAlpha` x `RF.overlayOpacity` (0.57 x 0.88),
  where `ground` is the same `terrainRgb` call the terrain mesh used for that cell. A fixed wash
  colour cannot survive a ramp of backdrops - somewhere on the ramp is a ground it matches - and the
  one this shipped with (`COLOURS.noLink` at 22 % alpha) measured **1.4** CIEDE2000 from the dark
  ground it replaced, which is not a difference an eye sees, for a marking whose whole job is to be
  seen. The rule moves that ground's own L* by `RF.faintLightnessShift` (38) away from
  `palette.FAINT_PIVOT_L` (55) and keeps `RF.faintChromaKeep` (0) of its chroma; it is held to 13.1
  from its own ground and 10.9 from any painted cell, worst of four simulated eyes over the terrain
  ramp including its shadowed end (`tests/unit/faintwash.test.js`). Three consequences belong with
  it, all measured:
  - **The flip at the pivot is unavoidable, so it is documented instead of argued away.** A rule
    that keeps its distance from *every* ground on a ramp has no fixed point, and a continuous map
    of lightness onto itself always has one, so two neighbouring grounds must land on opposite sides
    of the rule and jump apart. Over the six shipped configurations 0-1.7 % of faint-cell
    adjacencies straddle it - none on default, flat-field or mountain-shadow; 348 of ~42 700 in
    total - with a worst seen jump of 35 dE000, and both cells mean the same thing, so the crack can
    misinform about nothing. Moving the pivot does not remove it (only 75+ reaches zero, where the
    floor collapses to 8.9 because the rule starts clamping at the top of the gamut), and the
    one-directional variant - always lift, no flip at all - fails the other way: its floor on bright
    ground is **0.5** against the two-way rule's 9.1.
  - **Palette space is not the screen.** Read off the canvas, the rim's 5th percentile is 11.4 and
    its median 15.5 CIEDE2000 from the pixel under it. Two things account for the gap to the palette
    numbers: the drape is composited over *lit* terrain, and the palette's sRGB triples go into
    geometry colour attributes unconverted, where three.js treats them as linear working-space
    values (`viewport.js` sets sRGB output and leaves tone mapping off, so nothing downstream
    undoes this). That is why the shift is 38: at 30 the canvas p05 is 10.0, at 38 it is 11.4, and
    at 45 the wash comes within 8.3 of the zone mint, so the "not a painted cell" floor is what
    caps it. The wider consequence - that every colour claim in this repository is stated in a space
    the renderer does not deliver - is open work, recorded in
    `.taskman/faint-rim-and-tool-traps/step-005/step.md`.
  - **`VIEW.coverageOffsetM` cannot fix the weak pixels.** The drape touches the terrain only at its
    own decimated vertices, so on convex ground between them it can sink and be depth-culled.
    Raising the offset from 0.8 to 2.5 m lifts the all-pixels p10 from 10.1 to 12.5 and moves the
    *interior* floor by less than a point, so the offset stays where it is; the seam where a washed
    cell meets ground the drape leaves alone is documented in the README instead (451 of 1330 rim
    pixels sit in it, median 15.3, worst 2.1).
- **A shadow starts at 0 dB, and the ray has to walk the mesh to see one.** Terrain
  shadowing is `propagation/diffraction.js`: a signed screen parameter (`v` positive where
  ground stands above the ray, negative where the ray has room) run through the fitted
  Kirchhoff/Lee curve, so the loss grows out of nothing as the ray begins to be covered and
  passes the ~6 dB grazing figure at the shadow line. It used to charge nothing until the ray
  was under the ground and then jump to the diffraction of a buried ray, which drew a hard
  0-to-6 dB line across the map where the physics has a curve; the fit is used down to
  `KIRCHHOFF_FIT_FLOOR_V = -0.78` and floored above it. Two more rules belong with it.
  **A path is sampled at the resolution of the ground it walks over** - `pathSamples()` in
  `rf.js`, one sample per terrain cell, with `RF.profileMaxSamples` only as a ceiling on absurd
  lengths - because a narrow crest that no sample lands on cannot be found by *any* later pass
  over the samples: the plan here was a refinement pass around the worst sample, and it is
  unfixable by construction, since a crest no sample lands on is not the worst sample and there
  is nothing to refine around. (The headline that motivated it - a 20 m ridge between samples
  54 m apart charging 0 dB against 11.2 dB - was measured under the old all-or-nothing rule;
  with the continuous screen above the same miss costs a few decibels, which is smaller and
  still not acceptable.) Sampling at the mesh cuts the worst error a path can carry from 6.5 dB
  to 1.9 dB, and finer than the mesh changes nothing, because there is no finer ground to see;
  the rule is one function so that the sweep and `__sim.rayTo` cannot
  disagree (they had: 8.77 dB reported where the map painted 8.46). **And screens accumulate**
  - contiguous obstructed samples collapse into screens (`screenEdges`, so a long slope costs
  one screen and not one per sample), the **tallest** `RF.diffractionEdgeLimit` of them are
  superposed Deygout-style - each measured from the shadow the screens before it cast - and
  the sum is floored at the most significant screen alone, which is what keeps a
  cancellation-heavy sum from ever reporting a *cheaper* path than one ridge standing by
  itself. 29.8 % of the paths the default configuration walks cross two or more screens
  (72.2 % on the loudest link the panel allows), which is why this is not a corner: it moved
  22.1 % of the cells of the default map, by up to 15.7 dB. What is *not* true, and was
  assumed here first: the sum is not monotone in the height of a **near** screen - lifting the
  ridge you look over deepens the shadow behind it (13.31 dB with an 8 m near ridge, 9.99 dB
  with a 12 m one). Bullington's max-of-singles is not better (non-monotone and non-reciprocal
  by 3 dB), so the behaviour is documented, pinned by `tests/unit/multiedge.test.js`, and
  asserted as monotone only in the **last** screen, where it genuinely is.
- **The earth is round, and the ray bows *down*.** `rf.js` owns `earthBulgeM(d1, d2)` and
  `radioHorizonM(h1, h2)` (`Infinity` for a flat earth, because a flat earth has no
  horizon), `los.js` walks rays over that bulge, and `coveragestats.describeEarth()` puts
  `kFactor`, `earthBulgeUnderMaxLinkM`, `radioHorizonM`, `groundHorizonM` and `worldSizeM` in
  the stats so the HUD can quote what the curvature was worth instead of leaving the reader to
  suspect the map. The convention that had the sign wrong for months, in writing, because it is
  the kind of bug that hides: the **height field is a planar datum**, so the equivalent-round-earth
  transform leaves the ground where it is and bends the **ray** - `rayY = lerp(from, to) - bulge`,
  minus, always. Adding the bulge lifted every ray over every obstacle and made the earth help
  the link; nothing looked wrong, because coverage still worked. It is now pinned by the one
  fact that cannot be gotten wrong twice: at the radio horizon of the two heights a path is
  walked between, `rayProfile` reports a ray that exactly grazes the ground, clear inside that
  horizon and obstructed by the earth itself beyond it (`tests/unit/raycurvature.test.js`, with
  a `kFactor: 0` control for the same path). The honest finding, re-measured, has two halves:
  curvature still **never ends the coverage picture** on a 5.2 km map - flat plane, the lowest
  mast, an absurd budget, still `map-edge` - but the earth is the *obstruction* for 2232 cells
  at the panel's 0.5 m mast (all of them 3 km or farther out) and for none at 1 m. So quote
  both horizons: `radioHorizonM` (mast plus `RF.fresnelRxHeightM`) is off this map for every
  legal mast, while `groundHorizonM` - the same formula against a terminal lying on the ground -
  is inside it for any mast below about 2 m, and the HUD's `beyondMap` sentence appends that
  distance when it is. `coverage: the earth does hide part of this map, from the mast height
  that can see it` pins both directions, and
  `browser: at a low mast the curvature row says what the earth is hiding` reads the panel
  itself, because which sentence is printed is presentation. Do not stage a horizon-limited
  demo to make the row interesting; and do not let the reassuring half silence the other one.
  Two related rules: **neither end of a ray may be the obstacle**
  (the transmitter is in the air and the receiver is the endpoint - including them made
  every clear path report a block at its own far end), and *Terrain shadowing
  (diffraction loss)* is a **named** flat-earth mode: it suppresses every diffracted dB - the
  screens, the accumulation, all of it - but not the curved zone walk, and its label says
  exactly that.
- `app/reports.js` computes the reference link the volume is drawn around - the boresight
  out to where it meets the ground, one receiver height above it - and `propagation/fresnelmesh.js` (L4) turns
  that link into a tube. `FRESNEL.radialExaggeration` is the only reason it is
  visible next to a 5.2 km map; at 1 it is a hairline, and the docs say so.
- **Layout follows the window:** `app/controller.js` watches the canvas with a
  `ResizeObserver`, and `settle()` syncs the drawing buffer before painting, so
  headless captures and resized windows both get a correctly sized frame.
- **Two gestures, one canvas:** `app/orbit.js` owns camera gestures and
  `app/relocate.js` owns moving the site. Orbit asks `relocate.intercept(event)`
  before it captures a pointer, so grabbing the hardware never doubles as an
  orbit - and anything that captures a pointer must remember it may not own it at
  `pointerup` (releasing a capture that was never taken throws `NotFoundError`).
  A drag commits an ordinary `{site:{x,z}}` patch; nothing mutates state directly.
- **Scale honesty:** hardware is drawn enlarged (`VIEW.antennaVisualSpanM`) so
  it is visible on a kilometre-wide map; the mast height is always true. The
  lobe is a shape, not a range ring.

## 8. Tooling

| Command | What it does |
| --- | --- |
| `npm run vendor` | Verify `vendor/three/`: sha256 and size against `manifest.json`, licence banner inside the artifact, `LICENSE.txt` + `NOTICE.md` present. |
| `npm run vendor:bundle` | Rebuild the vendored bundle (needs network: registry + `npx esbuild`). |
| `npm run dev` / `start` | Serve the repository root on :8080 (no-cache, `/-/health`). |
| `npm run serve -- --port N --print-url` | Same server on another port. `stop` / `status` subcommands. |
| `npm run browser -- doctor` | Check the Chromium binary, the vendored three.js, CDP and WebGL2 end to end. |
| `npm run browser -- start|status|stop --name NAME` | Drive a persistent headless Chromium. |
| `npm run browser -- eval "EXPR" [--url URL] [--target ID]` / `shot [OUT]` | Eval or screenshot the page that is already open; `--url` opens one instead. |
| `npm run lint` | Architecture + hygiene rules (`--verbose`, `--json`). |
| `npm run test:unit` / `test:browser` / `test` | Timeboxed suites (see §9). |
| `npm run timebox -- -t 20 -- <cmd>` | Run any command with a deadline. |
| `npm run verify` | `lint` + full test suite. This is the gate. |

The app needs no server of ours at all - `python3 -m http.server` in the root
works, and the browser suite happily runs against it (`SIM_URL=http://127.0.0.1:8080/`).

Screenshots in `docs/` come from the tool, not from a human pressing PrintScreen:

```bash
node tools/browser.js shot --url http://127.0.0.1:8080/ --out docs/screenshot.png --width 1440 --height 820
```

`shot` waits for `window.__sim.ready` - which only exists once `boot()` has
finished - and then **refuses to write the file** if that wait times out, naming
the URL. A readiness check that cannot fail is worse than none: an earlier version
swallowed the timeout and produced plausible, empty screenshots that were blamed
on the app. Every budget in this tool comes from `TIMEOUTS` as well.

Two more things the driving commands promise, because both were once broken:

- **They drive the page you opened.** `open <url>` then `eval "document.title"` answers about
  that page, names it on stderr, and leaves it open for the next command. With no page open and
  no `--url` the tool **refuses** (exit 4) rather than inventing an `about:blank` and reporting an
  answer about it - which is what it used to do, in exit 0, sounding like the app.
- **No tool reads an argument it was not given.** Every CLI exits 2 naming the token and saying
  what to type when handed a flag it does not read or an extra positional: `staticserver --prob
  8123` used to *start a server on 8080*, `lint src/config.js` linted the whole tree, `timebox
  --timout 90` ran on the default budget, and `test browser interaction` printed the unit suite.
  The shared check is `checkArgs` in `tools/lib/args.js`; the browser harness guards its session
  options the same way, in milliseconds rather than in a timeout later that blamed the app.
  Writing into a closed pipe (`| head`) ends any of them quietly instead of in an EPIPE stack trace.

The static server serves the repository root, is loopback-only, sends `no-store`,
refuses path traversal, blocks `SERVE_DENY` directories, and answers
`POST /-/shutdown` so a detached server can be stopped politely.

The browser loads `three` through the import map in `index.html`
(`./vendor/three/three.module.min.js`); lint fails if that file is missing, if the
value is not explicitly relative, or if any URL in the page is root-relative.

## 8a. Process lifecycle rules

Chromium is started `detached`, as a process-group leader, and
`/usr/bin/chromium-headless-shell` is a *shell wrapper* around the real binary.
Both facts have already cost a debugging session each:

- **"the recorded pid is gone" is not "the browser is gone".** The wrapper can
  exit on `SIGTERM` while the browser and its GPU/network children ignore the
  signal and get re-parented to init. `terminate(pid, { group: true })`
  therefore waits on `isGroupAlive(pgid)` - a group whose only member is a
  zombie counts as dead - and escalates to `SIGKILL` on the whole group.
  `tests/unit/tooling.test.js` reproduces this with a leader that dies on TERM
  and a grandchild that ignores it.
- **`.tmp/browser/<name>/state.json` is an index, not the truth.** If it is
  deleted, or the process dies before writing it, `status` would report nothing
  running while twelve Chromium processes stay up and make every later browser
  test time out with an "app never booted" error. `findOrphanPids()` recognises
  our own instances by their `--user-data-dir=<repo>/.tmp/browser` prefix;
  `status --all` reports them and exits 2; `stop --all` sweeps them; and
  `tools/test.js` sweeps before and after the browser suite so a crashed run
  cannot poison the next one.

Do not clean up with `pkill -f <pattern>` from a shell whose own command line
matches the pattern - it kills the command doing the cleanup. Kill by pid, or use
`tools/browser.js stop --all`.

Lint and tests exercise the CLIs too (`--help` for every tool, `status --all`,
the static server end to end), because `node --check` cannot see an unimported
name inside `main()` and a server that dies at startup looks exactly like an
application bug from the browser side.

## 9. Testing

**Assert invariants and textbook numbers, never golden output.** No snapshots,
no `.expected` files. If a test needs an expected value, compute it from
physics or state it as a hand-written constant with a comment saying where it
comes from.

- `tests/unit/*.test.js` - plain Node (`node --test`), no DOM, no three.js.
  Cover maths, catalogue, terrain determinism, state patches, architecture and
  the CLI tools (`tooling.test.js` runs every tool for real: `--help`, the static
  server end to end, process-group termination, orphan detection).
- `node tools/test.js` with no flags runs the **unit suite only** - that is the
  fast loop; `--browser` or `--all` adds the slow one.
- `tests/browser/*.test.js` - headless Chromium via CDP; drive `window.__sim`.
- `tests/harness/app.js` - server + browser + app session with guaranteed
  teardown (`createAppSession`, `withApp`).

Style:

```js
test('propagation: doubling distance costs 6.02 dB', async () => { ... });
```

Architecture is tested like physics: `tests/unit/architecture.test.js` reads the
same `tools/lib/arch.js` table that lint uses, so the rules cannot drift from
the tests that claim to check them.

Test layout is lint-enforced too: files are `*.test.js`, every test file imports
`node:test`, the unit suite may not be empty, and a unit test that mentions
`startBrowser(`, `CdpConnection` or `createAppSession` is rejected with "move it
to `tests/browser/`" - the split between the two suites is what keeps the fast
loop fast.

Run one file while iterating:

```bash
node --test --test-reporter=spec tests/unit/propagation.test.js
node tools/test.js --browser --only tests/browser/interaction.test.js
```

### Browser test conventions

- **Never scrape DOM ids or click at coordinates.** Drive the app through
  `window.__sim`, installed by `src/app/testapi.js` and finished by `main.js`.
  Methods: `state`, `patch`, `action`, `settle(frames)`, `step(frames)`, `stats`,
  `scene`, `camera`, `setCamera`, `antenna`, `coverage`, `rssiAt(x, z)`,
  `fresnel`, `terrain`, `heightAt(x, z)`, `rf`, `pixelStats`, `controls`,
  `pick(ndcX, ndcY)`,
  `site`, `grabSite`, `dragSiteTo(ndcX, ndcY)`, `releaseSite`, `dragState`,
  `dispose`.
  `rssiAt()` reports the cell's `fresnelClearanceRatio`, `fresnelClear` and
  `budgetExcluded` (true when the value is the free-space upper bound and the ground was
  never asked); `fresnel()` is the aggregate - criterion, receiver height, the three
  buckets the ramp paints, `walkedCells` (what they partition), `denominatorCells` (what
  `clearPct` is a share of), worst clearance and its distance, and
  `volume: {visible, vertices}` plus the `link` the volume is drawn around. `scene()`
  carries `rangeRing: {visible, radiusM, canBind}`.
  Properties: `boot` (`{status, overrides: {clamped, rejected}, ...}` - what the URL asked
  for that the model trimmed), `ready` (true only once boot finished -
  the tools wait on this), `errors`, `version`, `app`. DOM layout may change;
  this API is the contract, so anything a test needs permanently gets added here
  rather than scraped.
- **The three claims that are not state, and so live only in the DOM.** The rule above is not
  pedantry, it is the reason a re-skin cannot break the suite - but three user-facing claims
  are not in the state at all, and reading `window.__sim` for them would be testing a shadow:
  the About dialog's provenance text (it is deliberately not app state), the *sentence* the
  curvature row chooses for a given mast height (`describeEarth()` returns facts; the HUD
  decides which half to say), and the legend's rows - words, swatch colours and swatch
  alphas. Those may be read from the document, and nothing else may: a test that reads a
  number out of the panel instead of `coverage()` is asserting the formatting of a value the
  API already reports, and it will pass while the value rots.
- **The one claim that is not in the DOM either: pixels.** What the drawing buffer holds is in
  neither `window.__sim` nor the document, and it is the only other thing a test may measure
  directly - `tests/browser/rim.test.js` does it, to check that the faint rim is visible rather than
  merely correct in the palette. Two rules make that honest. **Settle first**: the buffer is
  re-measured from the element's box by `viewport.resize()`, which `settle()` calls and the
  `ResizeObserver` in `controller.js` calls too, so a sample taken before any of those can be
  reading a stretched image - measured broken, a 1110x900 buffer shown in a 570x620 box, which is
  what the harness now refuses to run on. **Prove the null**: read the canvas twice with nothing
  patched between and require the difference to be zero (measured: max 0.000 CIEDE2000 over 22 010
  samples) before claiming anything about a difference you do see. And do not decide what a pixel
  shows by pairing it with `pick()`: that pick slides along the plane the mast stands on, which is
  the visible surface only where the land happens to be flat.
- Use `withApp(async (session) => { ... })` so the Chromium instance and the
  server are always torn down, even on a failed assertion. The session uses
  `SIM_URL` (exported by `tools/test.js`, one shared server per suite) and falls
  back to its own `startServer({ port: 0 })` when you run a file by hand, so both
  `node --test tests/browser/x.test.js` and the suite work.
- Call `session.settle()` before asserting on pixels or scene info: it forces the
  pending rebuilds, syncs the drawing buffer to the CSS box and paints, without
  depending on `requestAnimationFrame` (which headless barely schedules).
- Read the return shapes: `stats()` is the frame loop, `scene()` is the scene
  graph, `antenna()` is the model summary, `coverage()` is the coverage stats.
  They are different objects; mixing them up is the classic flaky test here.
- Assert *no page errors* (`session.errors()` must be empty) in any test that
  exercises the app; it is the cheapest regression net we have.
- **Pin a probe to a feature or to the map, never to a metre reading.** Geography tests
  that used absolute coordinates broke the moment the world grew: use fractions of
  `WORLD.worldSize / 2`, or `ANTENNA.siteLimitsM`, so a resize costs a re-measure instead
  of a rewrite. Check the probe is still *asked about* (`budgetExcluded === false`) rather
  than trusting a sentinel, and remember that the landforms scale with the map while a
  link budget does not - so a probe that must be about the ground, not the budget, pins
  its own sensitivity.
- **Know which sectors are empty ground.** Due west of the map centre the bump field now
  rises to ~90 m within a few hundred metres, so no cell in the W sector links at any mast
  height: a comparison there compares zeros and proves nothing. Either sum the westerly
  sectors or move the mast to ground that can be served (`ANTENNA.siteLimitsM.max * 0.6`,
  the flat field east of centre, has live ground in both compass directions).
- Software-renderer noise (SwiftShader / ANGLE / WebGL fallback warnings) is
  filtered; genuine failures are not.
- `node --test` does **not** put the file's directory on the module path: use
  `import { ... } from '../../tools/lib/paths.js'`, not `'../lib/paths.js'`.
- `session.sim(method, ...args)` inlines the arguments as JSON, so pass only
  serialisable values, and remember CDP `Runtime.evaluate` takes an *expression*:
  there is no argument passing, which is why the harness stringifies for you.
- **Await every page call.** A floating promise that is still waiting for its CDP
  reply when `close()` shuts the socket rejects with `CDP socket closed ()`, and
  the test runner blames that message on whichever test is running. It looks like
  an infrastructure failure and is actually a missing `await`.

### Running the browser tests in this environment

`tools/lib/browser.js` autodetects `/usr/bin/chromium-headless-shell` (or set
`SIM_CHROME`). Headless Chromium here needs `--no-sandbox` plus software WebGL:

```
--no-sandbox --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader
```

Those flags are already in `baseFlags()`. Profiles and logs live in
`.tmp/browser/<name>/`; each test session uses its own name so a crash cannot
poison another test.

### The harness does not rebuild for you

`window.__sim.patch()` returns the reducer's report and **returns before anything is
rebuilt**: the sweep and the meshes happen on the next frame. A test that patches and then
reads a derived result - `coverage()`, `site()`, `fresnel()`, `scene()` - is therefore
reading the *previous* sweep unless it `await session.settle()` in between; `state()` is
the exception, being the instant answer. This is easy to miss because a CDP round trip
usually outlasts a frame, so the stale read looks correct right up until it does not.
`tests/browser/reach.test.js` shows the pattern to follow: patch, settle, read.

## 10. Timeouts

Every budget is a named entry in `TIMEOUTS` (`src/config.js`) - per test, per
test file, per suite, browser launch, CDP call, navigation, screenshot, health
check. Tooling and tests import them; they do not invent numbers.

- `tools/lib/proc.js` `run()` spawns in its own process group and escalates
  SIGTERM → SIGKILL at the deadline; nothing survives a timebox.
- `tools/lib/timeout.js` provides `withTimeout`, `waitFor` (bounded polling),
  `readJson`, `sleep`.
- `tools/browser.js` refuses to talk to CDP without a per-call timeout, and
  kills the browser on `--timeout`.
- The test runner starts one static server per suite, exports `SIM_URL`, kills
  each test file at `TIMEOUTS.*TestPerFile`, and reports `TIMEBOX: killed after N ms`.

`node tools/timebox.js -t 30 -- <cmd>` is the escape hatch for anything manual.

## 11. Definition of done

```bash
npm run verify      # lint + unit + browser, all timeboxed
```

Also expected of a change:

- `npm run vendor` green - never hand-edit or hand-replace `vendor/three/`.
- New tunables added to `src/config.js`, new user fields added to `STATE_FIELDS`.
- New modules classified in `LAYER_TABLE`, with a matching `Layer: L<n>` header.
- New physics covered by an invariant test with a comment explaining the maths.
- User-visible behaviour change reflected in README.md; structural change
  reflected here. Third-party code stays in `vendor/three/` with its licence.
