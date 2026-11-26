# step-004 - palette tests for the faint rule, plus a guard against misusing the colour ruler

**Status**: done

## What changed
- `tests/unit/faintwash.test.js` (new, 8 tests). A new file rather than growing
  `tests/unit/palette.test.js` (275 lines) because step-011 makes the 320-line test budget real.
- `tests/harness/colour.js`: `deltaE000` is now `deltaE000Lab`, and `seenDistance(rgb1, rgb2,
  kind)` is exported. `tests/unit/palette.test.js` call sites renamed.
- `src/palette.js`: `FAINT_PIVOT_L` is exported, so the test can document the rule instead of
  copying the number 55 into itself.

## The two floors, measured
Worst of the four simulated eyes, over the terrain albedo ramp at four shading multipliers:

| claim | measured | guard in the test |
| --- | --- | --- |
| the rim is never the ground it replaces | **10.0**, at ground `#0a120f`, L\* 5 | `>= 9.5` |
| the rim is not a painted cell | **11.2**, against the zone view's violet `#663f81` | `>= 10.5` |

The guards sit half a point under the measurement so that rounding drift is not a red build; the
failure either guard exists to catch is 1.4, which is what the old fixed colour measured.

## A claim of mine that the test disproved
I wrote "the rim mutes the terrain, it does not erase it" and asserted that neighbouring cells
keep their difference. It failed immediately: `#6c604b` next to `#6b5c4d` keep only **60 %**.
Those two ground colours have nearly the same lightness and differ almost entirely in hue, and the
wash removes hue. So the honest claim, now what the test says, is narrower:

- a **lightness** difference survives exactly (the shift is additive), which is the relief;
- a difference that is **only hue** does not survive, which is the price of a wash that must not
  read as a level on either colour scale.

## The flip at the pivot: found, measured, and shown to be unavoidable
The rule pushes dark ground up and bright ground down, so two neighbours on opposite sides of the
pivot land ~60 L\* apart. That is a crack in the rim along a terrain-lightness contour.

- Measured on all six shipped configurations (`.tmp/pivot-straddle.mjs`): straddling faint-cell
  adjacencies are **0 % on default, flat-field and mountain-shadow**, 0.9 % on `valley-reach`,
  1.5 % on `site-sector`, 1.7 % on `bumps-hills`; summed over the six, **348 straddles out of
  ~42 700 faint-cell adjacencies (0.8 %)**. Worst seen jump **28 dE000**.
- Sweeping where the pivot sits (`.tmp/pivot-sweep.mjs`) does not remove it: pivots 50, 55, 60, 70
  give 425, 348, 422, 353 straddles (0.8-1.0 %); only 75 and 80 reach 0, and there the floor drops
  to ~8.9 because the rule starts clamping against the top of the gamut on ground that exists.
- It is also *unavoidable in any rule of this shape*: a continuous map from lightness to lightness
  has a fixed point, so a rule that guarantees a minimum distance from **every** ground must be
  discontinuous somewhere. The choice is where, not whether.
- I tried the one-directional alternative (always lift, `# → ground + shift`, clamp) because it has
  no flip at all: `.tmp/one-way.mjs` measures its floor at **0.5** on bright ground against the
  two-way rule's 9.1, because a lifted near-white has nowhere to go. The renderer lights the
  terrain with a 2.1-intensity sun, so near-white ground is possible. The two-way rule is kept.

## Where the floors could still move, and what will settle it
The floors above are measured against the **albedo** ramp - what the rule is keyed to. The eye
actually sees the *lit* terrain, and if lighting pushes ground brighter than the albedo ramp, the
downward branch starts clamping: re-running the sweep with grounds brightened past L\* 90 drops the
two floors to **9.1** and **9.5** (`.tmp/one-way.mjs`). That is the open risk from step-002, and it
is a measurement question, not a taste question: step-005 samples the real canvas and will say
whether these numbers hold, and if they do not, the rule gets retuned and the numbers here get
amended rather than quietly restated.

## The harness trap, and what was done about it
While probing I twice wrote `deltaE000(see(a, k), see(b, k))` - feeding sRGB to a function that
takes Lab. `see(x, 'normal')` returns its input unchanged, so the result is a plausible small
number rather than an error: the second bug in this task's family, a tool that answers instead of
refusing. Fixes: the Lab-level function is now `deltaE000Lab` (so the wrong call reads wrong),
`seenDistance` exists so the sRGB path has a name, and the doc comment records the trap. A
throw-on-looks-like-sRGB heuristic was rejected: a ground at L\* 5 is legitimate Lab, so the
heuristic would reject real inputs to catch a typo.

The matrices themselves are cross-checked rather than trusted: `palette.js` and
`tests/harness/colour.js` carry **independent** implementations, so breaking one is visible to the
other - verified below.

## Mutation matrix
| mutation | caught by |
| --- | --- |
| `RF.noLinkAlpha` 0.57 → 0.22 | *visible on every ground*, *not a painted cell* |
| `RF.faintLightnessShift` 30 → 12 | *visible on every ground*, *not a painted cell* |
| `RF.faintChromaKeep` 0 → 0.45 | *not a painted cell*, *keeps the relief and gives up the hue*, *lightness move not a hue* |
| `src/palette.js` D65 white point → `[1, 1, 1]` | *lightness move not a hue* (and two others) |
| legend chip replaced by a typed hex | *the legend chip is the rule applied to a representative ground* |
| `coverageRgb` allowed to colour an out-of-coverage cell | *coverageRgb refuses to colour a cell that did not link* |

## Verification
`node --test tests/unit/faintwash.test.js` 8/8; `npm run test:unit` 21 files in 6.7 s; `node
tools/lint.js` ok (45 src, 15 tools, 29 tests).
