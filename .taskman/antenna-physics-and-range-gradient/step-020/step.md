# step-020: screenshots regenerated and read back

## How to perform this step

1. Start the static server detached on port 8080, then regenerate with
   `node tools/browser.js shot --url "http://127.0.0.1:8080/" ...` at 1440x820:
   `docs/screenshot.png` (default scene, now the range gradient),
   `docs/screenshot-valley.png` (`?preset=valley-reach`),
   `docs/screenshot-fresnel.png` (`?preset=valley-reach&fresnel=1`).
2. If the hero picture no longer explains the bands view, add one image that does:
   `docs/screenshot-bands.png` at `?view=bands`, referenced once in the new
   **What the colours can mean** section.
3. Read every PNG back with the `read` tool and rewrite each README caption from what is
   actually visible - including the yellow-to-pink ramp and the `Curvature` row in the
   read-out.
4. Stop server and browser (`node tools/browser.js stop --all`,
   `node tools/staticserver.js stop`) and note in the comments what each image shows.
5. Verify: `git status --short` lists only the docs images and the task files.

## Expected result

The pictures in the README show the three views and the new read-out row, and their
captions describe those pixels.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- Server detached on 8080, four shots at 1440x820 via `node tools/browser.js shot` (each
  behind `tools/timebox.js`), then all four read back with the image tool and every caption
  rewritten from the pixels:
  - `docs/screenshot.png` - default scene, so now the **range gradient**: warm core at the
    mast, pink over nearly the whole lit disc (honest for a 0.94 km budget), wide faint band
    of asked-and-lost ground, bare map beyond; HUD legible down to the new **Curvature**
    row, quoted in the caption.
  - `docs/screenshot-valley.png` - `?preset=valley-reach`, yellow core running into pale
    yellow down the valley floor and a pink rim where the link dies; HUD shows 10 directors,
    10.69 dBi, F/B 26.0 dB, budget 2.50 km, last link 2.48 km @ 181 deg, 2024 points
    (6.6 % of the map, 84.4 % of reachable ground), bulge 0.085 m, 98.9 % zone-clear.
  - **new** `docs/screenshot-bands.png` - `?preset=valley-reach&view=bands`, the same scene
    and the same HUD numbers, and the entire linked area in one flat orange. Referenced once
    in *What the colours can mean*, in a two-column table opposite the gradient shot.
  - `docs/screenshot-fresnel.png` - `?preset=valley-reach&fresnel=1`: green drape with amber
    where the zone is partly cut, plus the translucent zone volume along the boresight.
- Measured the exact bucket counts for the valley scene so the two captions quote numbers
  rather than impressions (the same script path as step-019): bands `0 / 2 / 59 / 1963`
  linked plus 374 faint and 28 226 unmeasured; gradient `20 / 207 / 1797` linked plus the
  same 374 and 28 226. Both add to 2024 linked and 30 624 accounted ✓ - the caption claim
  "1963 of its 2024 linked points are one colour" is the measured figure, and my first draft
  ("all 2024") was wrong and is what the measurement was for.
- Server and browser stopped (`browser.js stop --all` also cleaned 8 orphaned renderer
  processes; `staticserver.js stop`), port 8080 confirmed dead.
- `git status --short`: only the four `docs/*.png`, `README.md` and the task files.
