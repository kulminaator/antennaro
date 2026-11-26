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

- Repo-wide sweep for the retired vocabulary, excluding `.tmp/`, `.taskman/` and git: `index.html`
  and `assets/app.css` contain no colour-view wording at all; `tools/` and `src/ui/about.js`
  mention neither views nor colours; only README.md and GUIDELINES.md carry the retired names, and
  there only as history with its measurements attached. `src/` has exactly two live mentions of
  `bands`/`gradient`, both inside `LEGACY_COVERAGE_VIEWS` in `main.js`.
- README link check done in Node with GitHub slug rules, not with shell `tr` (which failed on the
  space-to-dash range and reported six false misses): all six internal anchors and all four
  images resolve, and `docs/screenshot-bands.png` is referenced nowhere outside the task notes.
- No CI workflow exists in the repository to update (`.github/` is absent); deployment is the
  repository root as web root, so the renamed screenshots need no other change.
- The page itself was already proven to load with the deleted exports gone: `app-boot` asserts an
  empty `appErrors`, `pageErrors` and console-error list, which is what catches a stale
  `import { rangeGradientRgb }` that lint cannot see.
