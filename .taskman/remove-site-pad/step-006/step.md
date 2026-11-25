# step-006: documentation and screenshots

## How to perform this step

1. Read `README.md` and `GUIDELINES.md` in full (they are the contract this step
   rewrites) and remove every claim about a site pad.
   `grep -n "pad" README.md GUIDELINES.md` should end up with nothing but unrelated
   words (`padStart`, `padding`).
   Places that certainly need it, as of this writing:
   - README opening: "An antenna stands on a flattened pad on a map, and where it
     stands is up to you" and "The pad is part of the site, not of the map ... The pad
     is graded to the height of the ground it lands on" - replace with the truth: the
     mast stands on the ground where you put it, and moving it does not reshape the
     map.
   - the `![...](docs/screenshot.png)` alt text ("Omni dipole on the site pad").
   - *What you see*, the mast bullet: the "ground is flattened into a pad ... pad
     stops about a hundred metres from the mast" sentences - replace with "the mast
     stands on the natural surface; `Antenna height` is measured from the ground under
     it, and on a ridge flank that means the phase centre can sit below the ridge top
     a few metres away - the map does not move out of the antenna's way".
   - the Placement row of the controls table ("measured from the ground the pad is cut
     to") and the camera table row "Drag the mast | Move the site: the pad, mast,
     hardware, lobe and coverage go with it".
   - GUIDELINES §2 layout line `terrain/  height field, generators, site pad, terrain
     mesh`; §4's "how far the site pad reaches (`WORLD.sitePadRadius`,
     `WORLD.sitePadBlendFactor`)"; §7's whole **site pad** passage. In §7 replace it
     with the note that the height field is the four zones only and is deliberately
     independent of `state.site` - with the measured reason the pad was removed (a
     level pad graded to the mast's own ground filled 99.7 m at 57 m from the mast on
     the northern ridge shoulder, and travelled with the mast) so nobody reintroduces
     it. Keep the sentence about `state.site` no longer being part of the terrain cache
     key - now it must *not* be.
2. Regenerate the two README screenshots that show the mast's immediate ground, so the
   pictures match the prose (1440x820, same as the current files), with the server
   backgrounded and everything timeboxed:

   ```bash
   (setsid node tools/staticserver.js start --port 8134 --quiet > /dev/null 2>&1 &)
   node tools/timebox.js -t 200 -- node tools/browser.js shot --url "http://127.0.0.1:8134/index.html" --name docs2 --width 1440 --height 820 --out docs/screenshot.png
   node tools/timebox.js -t 200 -- node tools/browser.js shot --url "http://127.0.0.1:8134/index.html?preset=valley-reach" --name docs2 --width 1440 --height 820 --out docs/screenshot-valley.png
   node tools/timebox.js -t 200 -- node tools/browser.js shot --url "http://127.0.0.1:8134/index.html?preset=valley-reach&fresnel=1" --name docs2 --width 1440 --height 820 --out docs/screenshot-fresnel.png
   node tools/browser.js stop --all; node tools/staticserver.js stop
   ```

   Look at each generated file (read tool) before keeping it: the mast must be
   standing on ground that looks like the surrounding terrain, with no bench or scarp
   around it. Update captions if the picture says something different.
3. Re-read both documents against the code one more time: no sentence may claim the
   ground is graded, flattened, cut or filled anywhere.
4. `node tools/lint.js` (it checks docs-free things only, but run it to be sure the
   screenshots did not upset the vendor/asset checks).

## Expected result

The documentation says the mast stands on the ground, never mentions a pad, and the
screenshots show it.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
