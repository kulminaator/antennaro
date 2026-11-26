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
