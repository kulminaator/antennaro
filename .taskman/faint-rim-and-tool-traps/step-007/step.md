# step-007 - `eval` and `shot` drive the page you opened, or say there is none

**Status**: done

## The bug, reproduced rather than described
With the shipped code, after `open`ing the app:

```
$ node tools/browser.js open http://127.0.0.1:8131/ --name repro
$ node tools/browser.js eval 'document.title' --name repro
""
$ node tools/browser.js eval 'window.__sim ? "app" : "no app here"' --name repro
"no app here"
```

Exit code 0 both times. `commandEval` and `commandShot` each called `openPage`, which always
creates a target, and with no `--url` navigated that fresh target to `about:blank`. So the tool
answered a question about a page it had just invented, in the same shape as a real answer - and the
obvious workflow (`open` once, then `eval` repeatedly against the instance the tool itself tells you
is "persistent") could never have worked. `shot` also ignored a positional output path, so
`shot docs/x.png` wrote a timestamped file under `.tmp/artifacts` and said it had written that
instead.

## What changed
- `tools/lib/cdp.js`
  - `attachPageSession(cdp, targetId, { timeoutMs, closeTarget })` - the error collector and the
    `Page/Runtime/Log.enable` calls, shared by opening and attaching, so the two cannot drift.
    `closeTarget` is the only real difference between them: a page this tool opened gets closed
    afterwards, a page it borrowed only gets detached.
  - `attachToPageTarget(cdp, targetId)` and `attachToOpenPage(cdp)`. The latter returns **null**
    when the browser has no real page: inventing one is the caller's decision, not the library's.
    With several pages open it prefers a local app page, then the first page, and returns its url so
    the caller can say which one it took.
- `tools/browser.js`
  - `resolvePage(cdp, flags, { timeoutMs })`: `--url` opens, `--target` attaches by id, otherwise the
    open page is reused; none of those is an error with an actionable message and exit code 4.
    The chosen page is reported on **stderr**, so `eval`'s stdout stays parseable JSON.
  - `shot [OUT]` honours a positional path, refuses to guess when both `OUT` and `--out` are given,
    and after a `--width/--height` override dispatches `resize` and waits for the canvas drawing
    buffer to match its css box - the trap found in step-005, where a stale buffer stretched into a
    new box produces a plausible screenshot of the wrong geometry.
  - Header comment and `--help` updated for `[OUT]`, `--target` and the reuse rule.

## Tests
`tests/browser/browsercli.test.js` (new, 2 tests, 8.2 s - real CLI, real Chromium, in the browser
group because the unit tooling tests never launch a browser):

1. `open` then `eval 'document.title'` must mention the app, must say it is reusing the open page,
   `eval 'window.__sim.state().display.coverageView'` must come back `steps`, `pages --json` must
   still list the page (a borrowed page must not be closed), and `shot <path>` must write a real
   picture **at that path** (> 10 KiB, so a blank frame cannot pass).
2. With no page open, both `eval` and `shot` must fail and say `no page is open`.

Mutation matrix:

| mutation | caught by |
| --- | --- |
| restore `flags.url ?? 'about:blank'` in `commandEval` | both tests: *"eval is not answering about the opened page - it said `""`"*, and the refusal test |
| positional output ignored (pre-fix behaviour) | *"shot ignored the positional output path"* |
| borrowed page closed | *"a command that borrows a page must not close it"* |

## Verification
`node --check` on both files · `node tools/lint.js` ok (45 src, 15 tools, 31 tests) ·
`node --test tests/browser/browsercli.test.js` 2/2 · `tests/unit/tooling.test.js` still green ·
manual: positional shot at 1000x700 (219 KiB), `--out` shot at 1280x800 (426 KiB), two positionals
refused by the no-page rule rather than silently dropping the second.

## Deliberate choices
- **`--target <id>`** was not in the plan. With several pages open, "the first local page" is a
  guess; the flag makes the choice explicit, and the message always names what was picked.
- **Reuse does not close.** `open` + `eval` + `eval` + ... is the use case; tidying the page away
  after each command would have made the persistence the tool advertises a lie.
- **Exit code 4** for "no page", distinct from the usage errors' 2, so a script can tell "you asked
  wrong" from "the browser has nothing to drive".
