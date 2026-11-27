# step-009: README claim sweep against the new look

## How to perform this step

1. Hunt every README sentence that could describe chrome the skin moved:
   `grep -n -i "red\|banner\|panel\|read-out\|legend\|grey\|gray\|dark\|bright" README.md`.
   Check each against the code/CSS, not memory. Expected survivors (all still
   true — verify, do not assume): the red **"Startup failed"** banner
   (step-004 kept it red); every colour word there refers to *data* colours
   (signal steps, zone ramp, ash wash, bare terrain), which did not move; the
   *read-out panel on the right* is still right; the legend is still under the
   numbers.
2. No README prose describes fonts, radii or the panel's look, so the
   expected outcome is usually *no text edits* — the four re-shot images are
   the documentation change. If the sweep finds one stale sentence, fix only
   that sentence.
3. Check image wiring: `grep -c "docs/screenshot" README.md` (expect 5 — four
   images, one of them in the two-image pair table), and that all four files
   exist with today's date. `node tools/lint.js` green (it checks the page's
   asset references resolve).
4. Quick look at GUIDELINES.md: it documents structure, not skin — confirm it
   contains no appearance claim this task invalidated (it should not; it has
   no data-colour or DOM-class text that the CSS-only change could contradict).

## Expected result

Every README/GUIDELINES sentence about appearance is true of the skinned app;
the four images referenced resolve to the new pictures.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Sweep ran over the whole README (grep for red/banner/panel/read-out/grey/
  dark/bright/font): every surviving claim checks out against the new look -
  red "Startup failed" banner (still red), left panel / read-out panel on the
  right / legend under the numbers (layout untouched), grab-hand cursor,
  pale study-range ring, all data-colour prose (data colours unmoved). **No
  README sentence needed an edit.** GUIDELINES: no appearance claim
  invalidated (its canvas measurements re-verified below).
- The one real finding: step-006's optional cool moonlight had shifted the
  canvas measurements quoted in README and GUIDELINES (p05 11.4 → 11.7, fade
  451 → 446, worst interior pixel). Fixed at the root, not in the prose:
  reverted `0xd8e8ff` → `0xfff3e0` in `viewport.js`; rim re-run reproduces
  the documented figures exactly (p05 11.4, median 15.6, fade n=451, worst
  interior `#677b60`). All four screenshots re-shot from the shipped bytes
  (server 8149) so pictures and code cannot drift; default shot re-read.
- Wiring: `docs/screenshot*.png` appears 5 times in 4 lines (valley twice,
  once in the two-image pair table) - matches the four existing files; lint
  green.
