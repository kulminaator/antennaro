# step-007: full verify

## How to perform this step

1. Clean the driving processes: `node tools/browser.js stop --all` and
   `node tools/staticserver.js stop` (the scratch server on 8147; the suite
   starts its own).
2. `node tools/timebox.js -t 400 -- npm run verify`
   (vendor + lint + unit + browser; the full run measured ~80 s once green).
3. Fix only what this task broke — everything fixed must trace to
   `assets/app.css` or the two `VIEW` colours. Typical suspects if one lights:
   - `legend.test.js` / `curvature.test.js` → something in the CSS touched the
     DOM contract (a swatch `background`/`opacity` override, a pseudo-element
     that swallowed `previousElementSibling` text, letter-spacing changing
     `textContent`? — it does not, so look for real mutations);
   - `rim.test.js` → step-006's atmosphere, apply its fallback;
   - `architecture.test.js` / lint → nothing of this task should trip them; if
     one does, read the message, do not work around it (GUIDELINES §1).
   Record every fix and every measured floor in `task.md`'s Comments when it
   is globally useful, in the step's comments when local.
4. Re-run until green; note the elapsed time and counts in the step comments.

## Expected result

`npm run verify` fully green on the skinned app: vendor ok, lint ok, unit +
browser suites pass.

## Step comments

<!-- Step-specific details found during execution are appended here as bullet
     points. This section starts empty and is append-only. -->

- First run red: my two-line comment in `config.js` put the file at 351
  lines > the 350 budget (lint `file-size`). Fixed by inlining the comment
  (file back to 350). Lesson: in `src/config.js` every added line counts.
- Second run (`.tmp/verify-007.log`): `npm run verify` exit 0 - vendor ok
  (three 0.187.0), lint ok (45 src / 15 tools / 38 tests), **all 36 test
  files passed in 96.5 s**. rim measured p05 11.7 / median 16.0 on the
  skinned scene. Nothing outside this task's files needed touching.
