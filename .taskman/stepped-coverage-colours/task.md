# Task: stepped coverage colours

## Description

The coverage overlay is hard to read: everything on the map looks yellowish. Measured, the
continuous range gradient has stops at `L* 76 / 89 / 76` - the two ends of a 30 dB scale are
0.4 `L*` apart and the middle is the lightest thing on the map - so only 41 % of linked-cell
pairs differ by 10 CIEDE2000 (24 % under deuteranopia) and the 836 linked cells of the default
map land on 5 distinct colours. The banded view is worse in a different way: its thresholds
(0/15/30/45 dB of margin) sit far above the data, so 93-98 % of linked cells land in one band.

Replace both signal views with **one clearly stepped scale: red where the link is at its
limit, yellow where it has room**, four steps, thresholds placed where the cells actually are,
and drop the continuous gradient view entirely (its reason for existing was that the bands were
one colour, and that is what this change fixes). The Fresnel zone view keeps its own meaning but
must give up its amber, which now sits 10.7 CIEDE2000 from the new strong step.

Design, measured in `.tmp/steps-design.mjs` and `.tmp/zone-fix.mjs` (quote these, do not
re-derive them):

- Signal steps, strongest first: `#fff046` `#f6a600` `#d35900` `#980011`
  (`L* 93/74/53/31`, hue 97/78/57/39). Neighbour gaps 22.8 normal, 11.5 deuteranopia,
  15.1 protanopia, 18.0 tritanopia. 24.1 from bare terrain, 24.1 from the faint asked-and-lost
  wash, at least 31.5 from every zone colour.
- Step thresholds, margin over the receiver, strongest first: 8 / 3 / 1 / 0 dB. On the linked
  cells this spreads 21/30/36/13 % on the default scene, 11/20/37/33 on site-sector,
  17/29/36/18 on valley-reach, and 0/0/0/100 on the loudest configuration (correct: there the
  link really is comfortable everywhere).
- Zone ramp: cut `#663f81`, partly cut `#be77e2`, clear `#3effb7` (`L* 34/61/90`), worst
  neighbour gap 26.5 under all four vision models - against 9.4 for the shipped ramp under
  protanopia. 28-35 from the zone volume and the new signal steps.
- Why four steps and not five: the red-to-yellow axis carries order by lightness for
  red-green colour blindness, so the ceiling is 19.5 (3 steps), 12.5 (4), 9.5 (5) CIEDE2000.
  The by-eye heat ramp `#c4302b #e07b2a #f0b429 #f5e04a` scores only 7.1.

Finished means: one signal view painted in four unmistakable steps, the zone view still its own
question, every gate green, and README/GUIDELINES/screenshots quoting re-measured numbers.

## Steps

1. step-001 — config.js: four step colours, new thresholds, new zone ramp
2. step-002 — palette.js: retire the continuous gradient helpers
3. step-003 — coveragemesh.js: one signal paint path
4. step-004 — app: the view vocabulary becomes steps | zone, with legacy aliases
5. step-005 — presets, index.html, testapi, main: the last view references
6. step-006 — schema and controls: view labels and legend titles
7. step-007 — hud: wording that still names the gradient
8. step-008 — palette.test.js: the stepped scale's invariants
9. step-009 — unit test fallout, plus a legacy-alias test
10. step-010 — browser tests: view cycle and a step boundary
11. step-011 — run every gate and fix what breaks
12. step-012 — README: re-measure and rewrite the colour story
13. step-013 — GUIDELINES: the colour-scale rule, with its measurements
14. step-014 — docs screenshots, re-shot and re-captioned from pixels
15. step-015 — final verify, and the measured numbers recorded here

*(Step statuses are tracked only in each `step-NNN/status` file, never here.)*

## Comments

## Result (step-015 closed the task; step-016 does not exist - there are fifteen steps)

Full `npm run verify`: `vendor ok - three 0.187.0, ...`, `lint ok - 45 src, 15 tools, 28 tests
file(s)`, `all 26 test file(s) passed in 78457 ms`. 15 commits, +669 / -417 lines across
`src`, `tests`, `docs`, README and GUIDELINES.

| defect | fix | what refuses it now |
| --- | --- | --- |
| The gradient's stops sat at L\* 76/89/76: a 30 dB scale whose ends were 0.4 apart and whose middle was the brightest pixel. 41 % of linked-cell pairs differed by 10 CIEDE2000, 23 % under deuteranopia, 5 distinct colours on a whole map | Four steps `#fff046 #f6a600 #d35900 #980011`, ordered by lightness 93/74/53/31 | `palette: the signal scale is four steps and every neighbour is a different colour` (worst eye >= 11.5), `... reads as more signal where there is more signal` (L\* and LCh hue monotone 99 -> 34 deg) |
| Band thresholds 45/30/15/0 dB sat above the data: 93-98 % of linked cells in one row | 8/3/1/0 dB over the receiver, placed on six measured configurations | `every step must occur on an ordinary link`, `one step holds > 70 %`, `the strongest step holds 0.2 % ... nothing here is ever painted yellow`, median-margin-in-a-middle-step. Mutation runs: both 45/30/15/0 and 30/15/5/0 fail |
| Two signal views for one quantity, and the reducer would have had to accept both | `display.coverageView` is `steps \| zone`; the select coercion rejects the retired names; `LEGACY_COVERAGE_VIEWS` translates old URLs in `main.js` | `panel: the coverage view is one field with two honest values` (values and labels), `browser: ... no view changes a decibel` (`steps -> zone -> steps`), plus a preset-resolves-to-an-offered-view guard |
| The zone ramp's amber `#e8c33c` sat 10.7 from the new yellow step, and the old ramp was 9.4 apart at its tightest under protanopia | Violet / lilac / mint `#663f81 #be77e2 #3effb7`, L\* 34/61/90 | `palette: the zone view keeps colours that belong to no step` (cross-view >= 12, floor 15.7; zone neighbours >= 12, floor 26.5), and the browser legend test asserts no zone row wears a signal colour |
| The drape's 0.88 opacity was a literal inside `coveragemesh.js`, so no test could say what it cost | `RF.overlayOpacity` | `palette: a step survives the drape, the ground and the faint rim` - at 0.35 it reports "a step is invisible on bare ground: 13.2 dE000" |
| Legend carried three titles and two signal paths, one of which could print two rows in one colour | Two titles, one path, step names in the rows | legend assertions in `palette.test.js` (swatch = map colour, alphas 1 / 0.22 / 0, counts = recount) and in `interaction.test.js` (words, swatches, alphas, both legends summing to `walkedCells + budgetExcludedCells`) |
| `palette.js` claimed the zone ramp shared the signal scale's warm-to-cool language, and quoted an unmeasured "one cell in ten" | Rewritten: the scales share nothing, and the figure is 1080 of 30624 cells (38 % of walked paths) | prose reviewed in step-010; no code path |

**Where the plan's numbers and the shipped numbers differ, and why.** The design block above
says the steps are "at least 31.5 from every zone colour" and the README says the closest pair is
15.7 apart. Both are true and they are different measurements: 31.5 is normal vision, 15.7 is the
worst of the four simulated eyes (`#fff046` against mint `#3effb7`), and every shipped claim now
quotes the worst-eye figure and says which it is. The step shares listed as 21/30/36/13 % are the
default map's 105/300/253/178 read weakest-first; the README quotes them strongest-first to match
`RF.levelMarginsDb`, which is 13/36/30/21. The hue angles in the design block (97/78/57/39) are
the same four colours measured with the calibrated ruler at 99.3/75.9/54.3/34.5. And the
neighbour gaps 22.8/11.5/15.1/18.0 mix two pairs - they are pair 0->1 normal/deutan/protan and
pair 1->2 tritan; measured per pair it is 22.8/11.5/15.1/21.6, 24.8/16.4/22.2/18.0 and
24.4/21.4/21.7/18.5, whose minimum 11.5 is the number the test guards.

**Where the steps did not follow the step list.** The list was written before the code was read.
`presets.js` turns out to carry no `display` block at all, so step-006 measured that instead of
editing it; there is no legend click handler anywhere, so step-005's "keep the browser-harness
legend click key aligned" was dropped as a non-existent thing; the reducer already rejects unknown
select values, so the legacy alias went to the URL boundary (step-005) rather than into the
reducer (as step-004's plan said); `index.html` and `testapi` had no view references, which left
step-005 with the URL aliases alone. Each drift is written at the top of the affected step.

**Found and deliberately not fixed.** The faint asked-and-lost wash is only 2.7 CIEDE2000 from the
bare terrain it sits on, where the ground is dark low ground (`#213d33`), because 0.22 alpha over
dark green is nearly invisible. It is a legibility defect of exactly the family this task was
about, it predates it, and fixing it would change a documented contract (the faint rim means
"measured and lost") and the README sentences that go with it. It is recorded here and in
step-008's notes rather than quietly widened into this task.
