# step-006: re-audit and confirm the ordering; refresh the recorded table

## How to perform this step

1. Re-run `node tools/timebox.js -t 60 -- node .tmp/antenna-audit.mjs` and put the new
   table in this step's comments next to the old one from step-001.
2. Confirm, in the comments: no row has a positive `peak - Kraus` (allow the 0.25 dB of
   test slack, i.e. nothing above -0.25); the biquad's default gain is now below the
   Yagi's; the Yagi's H beamwidth is below the biquad's.
3. Sanity-check the pattern still *looks* right: `npm run browser -- shot --url
   "http://127.0.0.1:8080/?design=biquad-reflector&nohud=1" --out .tmp/artifacts/physics-biquad.png
   --width 1000 --height 700` (start `node tools/staticserver.js start --port 8080
   --quiet` detached first) and read the PNG back: the lobe should still be a broad
   sector, just dimmer in absolute dBi terms, which the lobe colour scale shows.
4. Stop what you started: `node tools/browser.js stop --all`,
   `node tools/staticserver.js stop`.
5. Verify: both tables and the three confirmations are in the comments; the screenshot is
   under `.tmp/artifacts/`.

## Expected result

Evidence that the fix moved the numbers in the physically correct direction, kept with
the task.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->
