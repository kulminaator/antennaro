# step-013: re-measure the five presets and the default scene

## How to perform this step

Every number the documentation quotes came from the model, so every one is now suspect.
Measure, do not adjust.

1. Extend or reuse `.tmp/readme-numbers.mjs` to print, per preset: linked cells, last
   linked range, budget range, `limitingFactor`, zone-clear percentage, and the band and
   gradient legend counts; and for the default configuration: linked cells, evaluated
   cells, both percentages, the curvature facts (`kFactor`, `earthBulgeUnderMaxLinkM`,
   `radioHorizonM`, `worldSizeM`), median/best/worst RSSI, and the HUD's own range-limit
   and curvature lines.
2. Re-measure the README claims in "What the numbers mean" and "The earth is round" that
   quote per-design free-space ranges and the ground-limited reaches. Free-space cannot
   move (no change to the budget maths in `rf.js`); the ground-limited ones can.
3. If a preset now breaks `coverage: no preset is cut off by our own limits`, retune it
   (height or sensitivity) the way the coverage-reach task did, and note old and new
   values.
4. Append every measured number to this step's comments, and those README/GUIDELINES will
   quote to `task.md`'s comments.

## Expected result

The table of numbers steps 014-016 copy, plus a recorded decision for any preset that
needed retuning.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

## Step comments

`.tmp/readme-numbers.mjs` (presets, default scene, free-space reach per design) and
`.tmp/readme-scenarios.mjs` (the scenarios README argues from). All measured, nothing adjusted.
`tools/staticserver.js stop` is the way to stop that server - no `pkill` needed, which matters
because `pkill -f staticserver` also matches the shell that runs it.

### Presets - none needed retuning, all five still end at their own link

| preset | design | asked / walked / linked | last link | budget | limit | zone clear of linked | median / best / worst dBm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| site-sector | patch | 30624 / 6255 / 2806 | 2.20 km @ 164 deg | 3.08 km | budget | 72.8 % | -87.8 / -48.8 / -124.8 |
| valley-reach | yagi | 30624 / 2398 / 2019 | 2.48 km @ 181 deg | 2.50 km | budget | 99.8 % | -77.4 / -48.1 / -119.4 |
| flat-field | yagi | 30624 / 2169 / 1806 | 2.00 km @ 88 deg | 2.02 km | budget | 95.3 % | -77.1 / -46.1 / -119.0 |
| mountain-shadow | omni-collinear | 30624 / 13518 / 7019 | 2.04 km @ 165 deg | 2.04 km | budget | 96.1 % | -79.8 / -46.4 / -136.4 |
| bumps-hills | biquad | 30624 / 6431 / 534 | 1.42 km @ 219 deg | 3.32 km | budget | 97.0 % | -113.0 / -52.5 / -133.5 |

Band legend counts, in the same order: `[0,5,188,2613,27818]`, `[0,2,59,1958,28605]`,
`[0,1,65,1740,28818]`, `[0,1,256,6762,23605]`, `[0,2,9,523,30090]`. Map coverage 9.2 / 6.6 /
5.9 / 22.9 / 1.7 %, link availability 44.9 / 84.2 / 83.3 / 51.9 / 8.3 %. No clipping by study
range or map edge anywhere; curvature facts unchanged (`k 1.413`, bulge under the longest link
0.028-0.086 m, horizons 26.5-32.5 km, all off the map). `coverage: no preset is cut off by our
own limits` still passes unmodified, so step-013's item 3 is a no-op: **no preset retuned**.

### Default scene (`omni-dipole`, 868 MHz, 10 dBm, -80 dBm, 10 m mast, centre)

- 836 linked of 30624 asked: **2.7 % of the map**, **29.6 % of the ground a link could reach**,
  9159 cells actually walked, 27796 never measured.
- Last link **936 m @ 153 deg**, budget **937 m**, study range 3.80 km, `limit: budget`.
- RSSI median **-90.2**, best **-50.1**, worst **-116.7 dBm**.
- Zone: **87.9 %** of the 836 linked cells clear, **101 linked with the zone cut (12.1 %)**,
  worst clearance **-19.9 r1 at 90 m**.
- Curvature: `k 1.413`, ray bows **0.0122 m** over the longest link, radio horizon **21.90 km**,
  map 5200 m, map reach from the mast 3677 m.
- Bands `[0,0,20,816,29788]`; gradient thirds **8 strong / 58 weaker / 770 at the limit**;
  faint (measured, lost) **1992**; out of budget **27796**.
- HUD lines, read off the running page:
  `Range limit - the link: budget 0.94 km, last link 0.94 km`,
  `Curvature - k 1.41 - the ray bows 0.012 m over the last 0.94 km link; the earth curves away
  long before this map ends`,
  `Cells with link - 836 of 30624 points (2.7 % of the map)`,
  `Served within reach - 29.6 % of ground a link could reach`,
  `Shadowed cells - 73.7 % (> 6 dB diffracted)`,
  `First Fresnel zone - 87.9 % of linked points clear - 101 linked with the zone cut - worst
  -19.9 r1 @ 90 m`.
- The sector table now reads N 36 % / 718 m, NE 43 % / 782 m, E 11 % / 378 m, SE 65 % / 936 m,
  S 86 % / 931 m and **0 % in SW, W and NW** - the dipole is omnidirectional, so those three
  directions are ground, not gain.

### README claims re-measured

- Free-space reach per design at the default budget, unchanged as expected (no change to the
  budget maths): dipole 2.15 dBi / 937 m, patch 6.66 / 1.57 km, collinear 7.17 / 1.67 km, biquad
  8.13 / 1.86 km, Yagi 9.56 / 2.20 km.
- "the five designs reach 0.93, 1.39, 1.66, 1.70 and 2.17 km ... the patch and the biquad get to
  89 % and 91 %" is now **0.93, 1.56, 1.67, 1.86, 2.18 km and 100, 99, 100, 100, 99 %** of their
  own free space, still exactly in gain order. The two beams that used to lose 10 % to the far
  edge of the field now lose one per cent: those old numbers predate steps 007-012, and the
  continuous onset plus one-sample-per-cell walk is what closed the gap.
- "the Yagi reaches 0.96 km of its 2.20 km budget, the patch 0.93 km of 1.57 km, and the biquad
  reaches furthest at 1.24 km of 1.86 km" is now **Yagi 0.81 of 2.20, patch 0.93 of 1.57, biquad
  0.97 of 1.86** (centre, 10 m, aimed east). The story - gain ordered, range not - survives with
  different numbers.
- "the banded view paints 828 of the 844 linked cells in one colour (16 a band higher); the
  gradient splits the same 828 into 6, 56 and 782" is now **816 of 836 in one band (20 a band
  higher), split 8 / 58 / 770**.
- "links 844 points and 117 of them (13.9 %) do it with the first zone cut ... 86.1 % clear" is
  now **836 points, 101 of them (12.1 %), 87.9 % clear**.
- Band sweep at the default budget, "70.6 % clear at 433 MHz, 86.1 % at 868 MHz, 93.7 % at
  2.4 GHz, 100 % at 5.8 GHz ... at 5.8 GHz only 12 points link" is now **77.1 % of 2165 linked
  at 433 MHz, 87.9 % of 836 at 868 MHz, 92.9 % of 84 at 2.4 GHz, 93.3 % of 15 at 5.8 GHz**. The
  5.8 GHz sample has grown from 12 to 15 cells and no longer clears everything - with screens
  accumulating, the highest band now loses zone verdicts too.
- "the flat-field scenario at 10 m links 314 points and reaches 897 m of a 2018 m budget, at
  21 % zone-clear; at 25 m it links 2057 points over 2004 m at 91 %" is now **273 points,
  0.81 km of a 2.20 km budget, 19 % zone-clear** at 10 m and **1770 points, 2.18 km, 93 %** at
  25 m. (The budget in the old sentence was the preset's own 2018 m; the free-space budget for
  that preset at 25 m of mast is 2.20 km.)
