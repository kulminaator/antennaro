# Task: remove-site-pad

## Description

There is still a way to make a hill move when the antenna moves: the flattened site
pad. It is cut level with the ground under the mast and blends back to the natural
surface by `WORLD.sitePadRadius * WORLD.sitePadBlendFactor` (45 m x 2.4 = 108 m),
which is right on gentle ground and a landform on steep ground. Measured with the
default seed and the site at (365, -400) - the mast on the shoulder of the northern
ridge, exactly where the user dragged it:

```
padElevation        150.6 m   (the ground at the mast)
fill at r = 30 m     +38 m    (the ground east of the mast is 112 m, the pad is 150 m)
fill at r = 60 m     +67 m    worst +99.7 m at r = 57 m
```

So the pad builds a plateau with a cliff around the mast, the plateau travels with the
mast, and coverage shadows everything behind the new edge - the user's complaint:
"hills don't shift around when I move the antenna". Making the deviation smaller or
capped is still moving the map. The decision is the user's and it is simpler:
**there is no pad.** The mast stands on the natural ground, full stop.

Finished means:

- `heightAt()` is the four terrain zones and nothing else. No `padElevation`,
  `padRadius`, `padBlendFactor`, no `naturalHeightAt` twin, and the terrain
  generators no longer take a site position at all.
- The height field does not depend on `state.site`. Consequence to take advantage
  of: relocating the mast must no longer dirty the terrain stage - the terrain cache
  key loses `site.x`/`site.z`, and `STATE_FIELDS` gives the two placement sliders an
  impact of antenna + coverage instead of terrain + coverage. Moving the mast gets
  cheaper, not just cleaner.
- The mast base is still exactly the drawn ground: `resolveSite().groundY` equals
  `field.sample(site.x, site.z)` on a ridge, a cliff edge, a valley floor and the
  map centre - the mast never floats and is never buried, without any grading.
- Tests say what is now true: the unit suite asserts the ground is independent of
  where the mast stands (two site positions, identical fields), and the browser
  suite asserts a relocation changes the rig, the coverage and the pixels while
  `heightAt()` at fixed points is unchanged.
- README and GUIDELINES stop talking about a pad (opening paragraph, *What you see*,
  controls, the camera table, §4 config list, §7 terrain note), screenshots that show
  the pad are regenerated, and `npm run verify` is green.

Constraints: zero dependencies; pure core runs in bare Node; `three` behind L4
adapters; tunables in `src/config.js`; UI dispatches patches and never mutates state;
browser tests drive `window.__sim`; `src/` files stay under 350 lines
(`controller.js` is at 320 - this task only removes lines from it).

## Steps

1. step-001 — generators.js: the height field is the terrain, the pad is gone
2. step-002 — config + call sites: the ground no longer depends on the site
3. step-003 — site.js: the mast foot sits on natural ground everywhere
4. step-004 — unit tests: the map does not move when the antenna does
5. step-005 — browser tests: relocate without reshaping the world
6. step-006 — documentation and screenshots
7. step-007 — full `npm run verify` and closing commit

## Comments

- The terrain cache key (`terrainSignature()`) no longer contains the site, so a
  relocation now costs one coverage rebuild and nothing else. Keep it that way: any
  future feature that wants the ground to depend on the antenna is reintroducing the
  bug this task removed.
- `src/app/fields.js` gives `site.x`/`site.z` the impact `[ANTENNA, COVERAGE]`;
  `markDirty` cascades ANTENNA -> COVERAGE, and `rebuildAntenna()` is what re-resolves
  the site and re-places the rig, so dropping the TERRAIN edge loses nothing.
