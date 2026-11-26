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
