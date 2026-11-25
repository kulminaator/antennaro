/**
 * Argument parsing for the CLI tools.
 *
 * Minimal by design: `--key value`, `--key=value`, `--flag` (boolean), `-x`
 * aliases and positionals. No dependency on a parsing library.
 */

const DEFAULT_BOOLEANS = ['help', 'json', 'quiet', 'all', 'force', 'verbose', 'daemon', 'print-url', 'wait'];

/**
 * @param {string[]} argv arguments after the tool name
 * @param {{booleans?:string[], aliases?:Record<string,string>}} [options]
 * @returns {{_: string[], flags: Record<string, string|boolean>, help: boolean}}
 */
export function parseArgs(argv, options = {}) {
  const booleans = new Set([...DEFAULT_BOOLEANS, ...(options.booleans ?? [])]);
  const aliases = options.aliases ?? {};
  const flags = {};
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      const key = aliases[body] ?? body;
      if (booleans.has(key)) {
        flags[key] = true;
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        flags[key] = argv[i + 1];
        i += 1;
      } else {
        flags[key] = true;
      }
      continue;
    }
    if (token.startsWith('-') && token.length > 1) {
      const key = aliases[token.slice(1)] ?? token.slice(1);
      if (booleans.has(key)) {
        flags[key] = true;
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        flags[key] = argv[i + 1];
        i += 1;
      } else {
        flags[key] = true;
      }
      continue;
    }
    positional.push(token);
  }

  return { _: positional, flags, help: flags.help === true };
}

export function usage(text, code = 0) {
  process.stdout.write(`${text.trimEnd()}\n`);
  process.exit(code);
}

/** Read a numeric flag with a fallback, rejecting nonsense early. */
export function numFlag(flags, key, fallback) {
  if (flags[key] === undefined || flags[key] === true) return fallback;
  const value = Number(flags[key]);
  if (!Number.isFinite(value)) throw new RangeError(`--${key} expects a number, got "${flags[key]}"`);
  return value;
}
