# step-005: About dialog, scrollbars, responsive pass

## How to perform this step

1. In `assets/app.css`, finish the skin:
   - `dialog.about`: same glass treatment (`linear-gradient` panel background,
     `border: 1px solid var(--line-strong)`, corner clip or `border-radius`,
     `box-shadow: 0 0 30px rgba(0, 0, 0, 0.6), var(--glow)`);
     `::backdrop: rgba(2, 6, 12, 0.72)`. `.about-row dt` keeps uppercase dim;
     `dialog.about a` stays `var(--accent)`; `.about-licence pre` keeps mono +
     `var(--bg)` box. **Do not touch `src/ui/about.js`** — its provenance text
     is DOM-read by tests.
   - Scrollbars: add `* { scrollbar-color: var(--line-strong) transparent; }`
     (Firefox) and `::-webkit-scrollbar { width: 8px }` +
     `::-webkit-scrollbar-thumb { background: var(--line); border-radius: 4px }`
     with a `:hover` brighten, for `.panel` and `.hud`.
   - `@media (max-width: 880px)` block: keep the layout logic exactly (order,
     45vh cap, column swap); only the border colour references update to the
     new tokens (they already use `var(--line)`, so verify nothing regressed).
   - Final sweep: `grep -n "#[0-9a-fA-F]\{3,6\}" assets/app.css` — every raw
     hex outside `:root` must be gone except deliberate semantic ones (boot
     error red, white glows); fold the rest into tokens.
2. Verify: `node --test tests/unit/about.test.js` green (About text logic
   untouched); open the dialog path through the browser once:
   `node tools/browser.js stop --all; node tools/timebox.js -t 120 -- node tools/browser.js eval "(async () => { document.querySelector('[data-action=\"about\"]').closest('.panel'); const d = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'About'); d.click(); return document.querySelector('dialog.about').open; })()" --url "http://127.0.0.1:8147/" --name skinstep`
   — must print `true` — then shot to `.tmp/skin-005.png` and read it back:
   the dialog renders as a glass console card over a dim void.

## Expected result

The About dialog, scrollbars and the small-screen layout all wear the same
skin; About's provenance text and tests untouched.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Executed: `dialog.about` → `--bg-dialog` base + top sheen + strong border +
  glow, `::backdrop` deepened; console scrollbars (`scrollbar-color` +
  webkit thumb/hover); media-query layout logic untouched (only its border
  reference moved to `--line-strong`); hex sweep folded `#0a1424` →
  `--bg-lift`, `#0b1322` → `--bg-dialog`, `#0a111d` → `--bg-card` (now
  `#0a111d` by definition). Surviving raw hex is only the deliberate
  semantic set: white-on-hover `#fff` and the red alert family
  (`#ffe4e4`/`#ff4d5e`).
- Verified: `about.test.js` 8/8 (provenance logic untouched); dialog opened
  through the real **About** button and screenshotted - renders as the glass
  console card over a dim void (`about.js` never edited).
- Tooling note: a `shot --url` run closes/rotates the browser's page, so a
  later `eval` without `--url` exits 4 ("no page is open"). Sequence that
  works: `open URL` → `eval` → `shot` (no `--url` reuses the page).
