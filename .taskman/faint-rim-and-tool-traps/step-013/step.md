# step-013 - split `tests/browser/interaction.test.js` (344 lines) into gestures and legend

**Status**: done

## The seam
The legend assertions were the only browser test in the file that reads the document instead of
`window.__sim`, so they got their own file - which is also what makes the seam honest rather than
cosmetic: `tests/browser/legend.test.js` is the file GUIDELINES §9's DOM exception applies to.

| file | lines | tests |
| --- | --- | --- |
| `tests/browser/interaction.test.js` | 276 | 10 - design swap, junk input, clamping/wrapping, azimuth to pixels, mast height, display toggles, presets, seed determinism, `?preset=` boot, reload |
| `tests/browser/legend.test.js` (new) | 91 | 1 - `browser: the legend says what the map is painted with` |

Its two private helpers travelled with it (`cssRgb`, the `READ_LEGEND` page script) and the imports
that only they used (`COLOURS`, `hexToRgb`, `FAINT_CHIP_COLOUR`) were removed from
`interaction.test.js`, which is left importing only `ANTENNA`.

## The bug my split script introduced, and how it was caught
My helper-extraction walked forward until a line equalled `});`. The `READ_LEGEND` template literal
does **not** end that way - it ends `` })`; `` - so the walk ran on to the end of the *next* real
statement and dragged `browser: switching design changes the model, the rig and the coverage` into
`legend.test.js`, where `YAGI_PARAMS` does not exist. The suite caught it immediately:

```
✖ browser: switching design changes the model, the rig and the coverage
```
moved back (24 lines), `legend.test.js` has one test again, and the mechanical check below confirms
nothing else travelled by accident. Two orphaned doc comments from the same script (the `cssRgb` and
`READ_LEGEND` doc lines, which were left behind in the wrong file) were also moved back to their
subjects.

## Mechanical proof that nothing was lost
Comparing `git show HEAD:tests/browser/interaction.test.js` against the two files together:

- test names: **11 -> 11, identical set**
- assertion lines (`assert.*` / `await assert*`, normalised): **87 -> 87, identical multiset**, nothing lost and nothing gained

## Verification
`node tools/test.js --browser --only legend` -> 1/1, file took 0.8 s (0.7 s of it the test itself) ·
`--only interaction` -> 10/10 in 23.0 s · `node tools/lint.js` down to 3 violations, `interaction.test.js`
no longer one of them.

## Cost of another browser file
The browser group now has 9 files, so a full run pays one more Chromium launch plus app boot. The
new file is not free but it is small: 0.8 s of reported file time against 23 s for `interaction`,
because the legend test is a single DOM read with no coverage sweep. Measured again at step-017 for
the whole group.

## Documentation drift this creates
`GUIDELINES.md` line 681 still uses `--only tests/browser/interaction.test.js` as its example command
(still a valid example), and the closed `stepped-coverage-colours` task record names
`interaction.test.js` for the legend assertions. That record is history and is not rewritten; this
note is where the move is logged.
