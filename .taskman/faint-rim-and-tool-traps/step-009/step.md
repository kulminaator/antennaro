# step-009 - the same refusal in every other CLI

**Status**: done

## What each tool was doing with an argument it could not read
Probed before changing anything:

| invocation (before) | what actually happened |
| --- | --- |
| `lint.js src/config.js` | linted the whole tree, exit 0 - a "targeted check" that was not targeted at anything |
| `lint.js --verbose-y` | same, exit 0 |
| `staticserver.js --prob 8123` | **started a server on 8080** and ran in the foreground until killed |
| `timebox.js --timout 90 true` | ran the child under the default 60 s budget |
| `vendor.js show --json` | exit 0, flag unread |
| `browser.js shot --force` | exit 0 with the flag unread |
| `browser.js shot a.png b.png` | wrote `a.png`, silently dropped `b.png` |

The `staticserver` row is the one that justifies the whole step: a two-character typo in a flag
listens on a port nobody asked for. Reproduced once, deliberately, with a 240 s shell timeout as the
only reason it did not linger.

## What changed
All five use `checkArgs` from step-008, each declaring only what it really reads:

- `tools/browser.js` - a `COMMAND_ARGS` table, **per subcommand**: `doctor/start/stop/status/pages`
  take one positional (the command word), `open/eval/shot/screenshot` take two. A flag belonging to
  another subcommand is refused, because `status --url X` is not "harmless", it is a command nobody
  ran. `screenshot` aliases `shot`'s entry rather than duplicating it.
- `tools/lint.js` - flags `help, verbose, json`, no positionals, with a hint pointing at `wc -l` for
  the single-file question people actually meant. The tool's own positional check is gone: there was
  never one (see the correction below).
- `tools/staticserver.js` - flags `help, port, host, quiet, print-url`, one positional, checked
  *before* any listen: the refusal happens ahead of the side effect.
- `tools/timebox.js` - flags `help, timeout, kill-after, quiet, json`, positionals unlimited: after
  `--` the words belong to the child, so refusing them would break every legitimate use.
- `tools/vendor.js` - flags `help, check, version, from`, one positional; its existing
  `unknown command "x"` refusal is kept (it names the valid commands better than a generic hint).
- `guardBrokenPipe()` (step-008) installed at the top of `main()` in all five, so `| head` ends any
  of them quietly.

## Corrections to my own earlier records
- step-004's notes said *"`lint.js` refuses extra positionals"*. It did not: `lint.js src/config.js`
  linted everything and exited 0. That claim was wrong, and this step is where it gets fixed.
- I have twice this session typed `staticserver.js stop --force` and it appeared to work. It never
  honoured `--force` - stop escalates to SIGKILL on its own after `terminate()`'s grace period - the
  flag was simply ignored. It is now refused, which is the honest answer.

## Tests
`tests/unit/tooling.test.js` 188 -> 229 lines, two new table-driven tests:

1. **`tooling: every CLI refuses arguments it cannot read`** - eight cases across all five tools.
   Each must exit **2**, quote the offending token, and print a hint line. Includes the
   `staticserver --prob 8123` case, so a future regression that starts a listening server fails a
   unit test rather than sitting on port 8080.
2. **`tooling: the arguments the CLIs do read still work`** - ten invocations that the refusal must
   not break: `lint` bare/`--json`/`--verbose`, `test --list`/`--list --browser`, `timebox -t 20 -- node -e 0`,
   `vendor show`, `vendor check`, `staticserver status`, `browser status --all` - each must exit 0 and
   must not contain `is not a flag` / `is not something`.

Mutation: disabling `checkArgs` in `staticserver.js` fails the first test with
*"staticserver.js --prob 8123 exited 0 instead of refusing"* - and the test then took **60 s**,
because the mutated tool started a foreground server the harness had to kill at its time budget. The
cost of the bug is visible in the timing of the test that catches it.

Extra checks run by hand: `shot a.png b.png`, `open http://a http://b`, `eval 1 2`, `status extra`
all exit 2 naming the second positional; `start --headful --url x` is still accepted as a legitimate
invocation and fails only on the unreachable URL, which is the app's business, not the parser's.

## Verification
`node tools/lint.js` ok · `node --test tests/unit/tooling.test.js` 8/8 in 6.1 s · no stray
listeners on 8080/81xx and no leftover browsers (`browser.js stop --all` swept 14 orphan pids that
earlier sessions had left).
