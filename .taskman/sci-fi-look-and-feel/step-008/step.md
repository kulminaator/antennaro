# step-008: regenerate the four README screenshots, read them back

## How to perform this step

1. Start a detached server on a fresh port and re-shoot all four documented
   views at the documented size (1440x820), every shot timeboxed, exactly the
   established recipe (cf. `.taskman/remove-site-pad/step-006/step.md`):
   ```bash
   (setsid node tools/staticserver.js start --port 8148 --quiet > /dev/null 2>&1 &)
   node tools/timebox.js -t 200 -- node tools/browser.js shot --url "http://127.0.0.1:8148/index.html" --name docsui --width 1440 --height 820 --out docs/screenshot.png
   node tools/timebox.js -t 200 -- node tools/browser.js shot --url "http://127.0.0.1:8148/index.html?preset=valley-reach" --name docsui --width 1440 --height 820 --out docs/screenshot-valley.png
   node tools/timebox.js -t 200 -- node tools/browser.js shot --url "http://127.0.0.1:8148/index.html?preset=valley-reach&view=zone" --name docsui --width 1440 --height 820 --out docs/screenshot-zone.png
   node tools/timebox.js -t 200 -- node tools/browser.js shot --url "http://127.0.0.1:8148/index.html?preset=valley-reach&fresnel=1" --name docsui --width 1440 --height 820 --out docs/screenshot-fresnel.png
   node tools/browser.js stop --all; node tools/staticserver.js stop
   ```
   (`shot` refuses to write unless `window.__sim.ready` — a stale PNG from
   before the skin cannot sneak in.)
2. Read **each** PNG back with the read tool and check against the README
   captions, which quote hard numbers — the physics did not change, so the
   read-out must still print, on the default shot, `836 of 30624 (2.7 %)`,
   `29.6 %`, `the link: budget 0.94 km, last link 0.94 km`, and on the valley
   shots `2019 of 30624`, `84.2 %`, `2481 m @ 181 deg`, `-48.1 / -77.4 /
   -119.4 dBm`, `99.8 %`. Check the pixels too: warm yellow→crimson steps at
   the mast (default + valley), mint/lilac/violet drape (zone, fresnel), the
   translucent zone tube (fresnel), the new console chrome everywhere, scene
   and page in the same void.
3. If a digit or a colour disagrees with the caption, the picture is wrong,
   not the number (GUIDELINES rule for captions): find why (wrong URL, wrong
   port serving stale bytes) and re-shoot. Record the check results in the
   step comments.

## Expected result

The four `docs/*.png` show the skinned app with the same physics numbers and
colours as before; captions remain true without edits (any edit needed is
evidence of a wrong picture — investigate first).

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Recipe worked as written (server 8148 detached, `--name docsui`, four
  timeboxed `shot`s at 1440x820, then `stop --all` + server stop). Chaining
  several `shot --url` in a row is fine - each opens its own page.
- All four read back, every captioned digit confirmed in-pixel, physics
  unmoved: default `836 of 30624 (2.7 %)`, `29.6 %`, `budget 0.94 km, last
  link 0.94 km`, `k 1.41 ... 0.012 m`, `73.7 %`, `87.9 % - 101 linked with the
  zone cut`; valley/zone/fresnel all `2019 of 30624 (6.6 %)`, `84.2 %`,
  `2481 m @ 181 deg`, `-48.1 / -77.4 / -119.4 dBm`, `14.8 %`, `99.8 %`.
- Zone vs fresnel differ exactly as the docs claim: the fresnel shot carries
  the pale translucent volume band along the beam (also pinned by the URL
  browser tests: `fresnel=1` -> volume true). Chrome in all four shots is the
  new console skin, scene in the new void; data colours unchanged. No caption
  needed an edit.
