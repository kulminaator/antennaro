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
  propagation/   rf algebra, line-of-sight/diffraction/Fresnel clearance, coverage,
                 coverage mesh, Fresnel zone mesh
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

## 4. Configuration centrality

Every tunable that describes the **world or the radio** lives in `src/config.js`:
world size, terrain amplitudes and blend band, RF constants (including
`RF.speedOfLightMps`, `RF.kFactor` and the band table), antenna limits, where the
mast may stand (`ANTENNA.defaultSiteXm` / `defaultSiteZm` / `siteLimitsM` /
`siteStepM`, shared by the sliders and the drag), the Fresnel criterion
(`RF.fresnelClearFraction`, `RF.fresnelRxHeightM` - the receiver height the verdict
is stated for - and `RF.fresnelEndpointGuard`), the `FRESNEL` block (mesh density,
opacity, `radialExaggeration`, `rampMaxRatio`, `groundSearchStepM`) and the
`COLOURS.fresnel*` stops of the zone ramp, camera
defaults, colours, path names and every timeout. The UI schema and the state
reducer read the same ranges, so a slider can never disagree with the physics.
`VIEW.cameraFovDeg` is here for the same reason: `app/pick.js` needs the vertical
FOV to unproject a pointer, and a FOV that only the renderer knows would let the
mouse and the picture disagree.

A module may keep a local numeric constant only when it is not a knob:
a mathematical identity (`DEG_PER_RAD`), a structural count (`SECTOR_COUNT`), a
numerical guard (`DEGENERATE_DOT` in `aim.js`), or something purely presentational
that nobody would ever tune from the panel (`ORBIT_SPEED`, `HUD_REFRESH_MS`). The
two borderline cases are deliberately declared next to the maths they belong to -
`PATTERN_FLOOR_DB` in `antenna/pattern.js` and `NEAR_FIELD_SKIP_FACTOR` in
`propagation/coverage.js` - because moving them to config would separate a model
from the constant that defines where the model stops being meaningful. Both are
named, exported or commented, and pinned by tests; neither is a magic number
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

- The UI **never mutates state**; it emits patch objects.
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
  Catalogue entries carry `gainDbi(params)` and `pattern(params)`; the model
  adds aim, tilt and electrical downtilt, and clamps to `PATTERN_FLOOR_DB`.
- **Coverage** evaluates the link budget per cell: EIRP toward the cell, minus
  free-space loss, minus knife-edge diffraction over the sampled ground profile
  (with `kFactor` Earth bulge), minus clutter. Levels are **margin over the
  receiver sensitivity**, so the legend moves when the user changes sensitivity.
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
- **The zone has its own colour view.** `propagation/coveragemesh.js` paints either
  the signal bands or the zone ramp (`palette.fresnelZoneRgb`), switched by
  `display.showFresnel`; it is a mode rather than a marking laid over the bands
  because only a minority of cells meet the criterion, and a flag painted on the RSSI
  colours would be one hue over the whole map. `app/reports.js` computes the
  reference link the volume is drawn around - the boresight out to where it meets the
  ground, one receiver height above it - and `propagation/fresnelmesh.js` (L4) turns
  that link into a tube. `FRESNEL.radialExaggeration` is the only reason it is
  visible next to a 2.4 km map; at 1 it is a hairline, and the docs say so.
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
| `npm run browser -- eval "EXPR" --url URL` / `shot --out f.png` | One-shot page eval / screenshot. |
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
  `rssiAt()` reports the cell's `fresnelClearanceRatio` and `fresnelClear`; `fresnel()`
  is the aggregate - criterion, receiver height, the three buckets the ramp paints,
  worst clearance and its distance, and `volume: {visible, vertices}` plus the `link`
  the volume is drawn around.
  Properties: `boot` (`{status, ...}`), `ready` (true only once boot finished -
  the tools wait on this), `errors`, `version`, `app`. DOM layout may change;
  this API is the contract, so anything a test needs permanently gets added here
  rather than scraped.
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
