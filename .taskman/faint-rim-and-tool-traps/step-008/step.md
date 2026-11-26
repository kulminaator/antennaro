# step-008 - `test.js` refuses arguments it does not read

**Status**: done

## Reproduced first
```
$ node tools/test.js browser interaction
== unit suite: 21 file(s) ==
✔ about: the version it quotes is the app version, not a second copy (1.1ms)
...
$ echo $?
0
```
Two words went into `parsed._`, nothing read them, and the runner printed a suite it had not been
asked for and exited success. Piping a tool into `head` turned out to be a second member of the same
family - found by trying to truncate the output of the very command above:

```
$ node tools/test.js --list --browser | head -3
browser  tests/browser/app-boot.test.js
...
Error: write EPIPE        <- unhandled 'error' event on stdout, exit 1
```
Once the reader is gone the next write raises EPIPE, Node treats it as unhandled, and the tool dies
in a stack trace after having produced the right answer.

## What changed
- `tools/lib/args.js` - `checkArgs(parsed, { name, flags, positionals, hint, usageText })`. A command
  declares the flags it reads and how many positionals it takes; anything else exits 2 naming the
  token. Unknown flags are caught too, not just positionals - `--br0wser` was as unread as the
  positional was. The `hint` line says what to type instead, because a refusal that cannot be acted
  on gets retyped identically.
- `tools/lib/proc.js` - `guardBrokenPipe()`: EPIPE on stdout or stderr ends the run quietly with the
  code already earned; any other stream error still throws.
- `tools/test.js` - `checkArgs` immediately after `--help`, with the hint
  *suites are flags: `--browser` runs the browser tests, and `--only <text>` narrows them to one
  file*, and `guardBrokenPipe()` as the first statement of `main()`.
  Allowed flags listed explicitly: `help all unit browser only grep per-file test-timeout json list`.

Now:
```
$ node tools/test.js browser interaction
test.js: "browser interaction" is not something test.js takes
  suites are flags: --browser runs the browser tests, and --only <text> narrows them to one file
$ echo $?
2
```

## Tests
`tooling: test.js refuses arguments it does not read` in `tests/unit/tooling.test.js`
(file 161 -> 188 lines, inside the tests budget) asserts: positional refusal with exit 2, the token
quoted, the hint present, **no suite banner printed before the refusal**, unknown-flag refusal,
`--list --browser` still working, and `... | head -3` via `/bin/sh` exiting 0 with no `EPIPE` or
`Unhandled` on stderr.

Mutation: with `checkArgs` disabled and `guardBrokenPipe()` removed the test fails at its first
assertion - *expected a refusal, got exit 0* - which is the original bug, quoted from the runner
rather than from me. The EPIPE half was observed directly before the guard existed (stack trace
above), and `tools/test.js --list --browser | head -3` now exits 0.

## Deviations from the plan
- The plan named only the ignored-positional bug. The broken-pipe crash is the same class - a tool
  misreporting its own outcome - so it is fixed here with its own assertion rather than left behind.
- The refusal lives in a shared helper rather than inline in `test.js`, so step-009 applies the same
  rule to the other CLIs instead of re-inventing it six times.
