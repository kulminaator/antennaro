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

- Re-ran `node tools/timebox.js -t 60 -- node .tmp/antenna-audit.mjs`. Refreshed table,
  same columns as step-001 (`peak-Kraus` > 0 means more gain than the beam can hold):

  | design | params | peak dBi | H deg | V deg | Kraus | peak-Kraus |
  | --- | --- | --- | --- | --- | --- | --- |
  | omni-dipole | default | 2.15 | 360.0 | 78.0 | 1.67 | +0.48 (exempt: omni) |
  | omni-collinear | default | 7.17 | 360.0 | 44.6 | 4.10 | +3.07 (exempt: omni) |
  | omni-collinear | min / max | 4.16 / 10.18 | 360.0 | 76.4 / 6.4 | 1.76 / 12.53 | +2.40 / -2.35 |
  | yagi | default | 9.56 | 41.6 | 66.0 | 11.77 | **-2.21** |
  | yagi | min / max | 7.39 / 12.63 | 68.6 / 20.6 | 66.0 | 9.60 / 14.82 | -2.21 / -2.19 |
  | yagi | 2 / 7 / 14 dir | 7.60 / 9.56 / 12.29 | 65.2 / 41.6 / 22.2 | 66.0 | 9.82 / 11.77 / 14.50 | -2.22 / -2.21 / -2.20 |
  | biquad-reflector | default | **8.13** (was 12.40) | 69.0 | 69.0 | 9.38 | **-1.25** |
  | biquad-reflector | min / max | 7.29 / **9.06** (was 8.60 / 16.20) | 76.0 / 62.0 | 76.0 / 62.0 | 8.54 / 10.31 | -1.25 / -1.25 |
  | patch | default | 6.66 (was 6.60) | 72.0 | 68.0 | 9.26 | **-2.60** |
  | patch | min / max | 3.56 / 10.18 (was 4.06 / 8.36) | 103.0 / 48.0 | 97.2 / 45.4 | 6.15 / 12.77 | -2.59 / -2.59 |

  No directional row is positive: the whole family sits a *constant* distance under its own
  ceiling (-2.21, -1.25, -2.60 dB), which is exactly what "gain is derived, not typed" looks
  like - that constant is `10*log10(efficiency)` and nothing else.
- Ordering at defaults, which is the user's complaint answered in one line:
  Yagi 9.56 dBi at 41.6 x 66.0 deg, biquad 8.13 dBi at 69.0 x 69.0 deg, patch 6.66 dBi at
  72.0 x 68.0 deg, collinear 7.17 dBi omni, dipole 2.15 dBi omni. The Yagi now has the most
  gain of anything except itself at 14 directors, and the biquad sits between the dipole and
  the collinear - where a 69-degree biquad belongs.
- Front-to-back ratios survived and still respond to the reflector: biquad 17.0 dBi at
  0.10 lambda spacing, 23.0 at the default 0.25, 26.0 at 0.40 - the plate still buys
  something real, it just no longer buys gain.
- Screenshot `.tmp/artifacts/physics-biquad.png` (`?design=biquad-reflector&nohud=1`,
  port 8080, read back to confirm): the drawn lobe is still the broad forward fan it was -
  the pattern was never wrong, only the number attached to it. Server and browser stopped
  after the shot.
