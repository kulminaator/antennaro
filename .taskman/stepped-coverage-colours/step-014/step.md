# step-014: docs screenshots, re-shot and re-captioned from pixels

## How to perform this step
1. Start a detached static server on a free port, take the four documented shots at 1440x820 with
   `node tools/browser.js shot --name docs3`: default, `?preset=valley-reach`,
   `?preset=valley-reach&view=bands` (the legacy alias - it must land on the steps view), and
   `?preset=valley-reach&fresnel=1`; overwrite `docs/screenshot.png`, `docs/screenshot-valley.png`,
   `docs/screenshot-bands.png`, `docs/screenshot-fresnel.png`.
2. Read each PNG back with the read tool and rewrite every caption from what is actually visible,
   including the HUD digits - compare them against step-012's measured numbers and correct the
   caption, never the measurement, if they disagree.
3. Stop the server and `node tools/browser.js stop --all`.

## Expected result
Four documentation pictures show the new scale and their captions say what is in them.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet points. This section starts empty and is append-only. -->
