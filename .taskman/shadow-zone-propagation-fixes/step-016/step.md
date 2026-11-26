# step-016: screenshots from the new numbers, full verify, closing measurements

## How to perform this step

1. Background the server - `(setsid node tools/staticserver.js start --port 8080 --quiet > /dev/null 2>&1 &)`
   - and regenerate the four docs images at 1440x820 with
   `node tools/browser.js shot --url URL --out docs/FILE.png --width 1440 --height 820`,
   matching the four files already in `docs/` (default, valley preset, bands view,
   fresnel view). Timebox each shot.
2. Read each PNG back with the read tool and rewrite its README caption from what is
   actually in the picture - legend counts, range-limit line, curvature line - using the
   step-013 numbers; correct anything in the four captions the new model changed.
3. Stop the server, `node tools/browser.js stop --all`, confirm the process table is
   clean, then `node tools/timebox.js -t 900 -- npm run verify`.
4. Append to `task.md`: the final verify line (vendor/lint/test counts, duration), the
   sweep cost before and after from steps 010 and 012, and one sentence per defect: what
   the fix was and which test pins it.
5. Commit what remains, then write `done` into this step's status.

## Expected result

Done when the step's own verification commands pass and
`node tools/lint.js` is green.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
