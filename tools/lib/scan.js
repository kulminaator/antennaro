/**
 * Source scanning helpers shared by lint and the architecture tests.
 *
 * Deliberately dumb: a regex over the text, not an AST parse. We only need the
 * import graph and the presence of a few forbidden tokens.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.tmp', '.git', 'vendor', 'dist', 'coverage']);

/**
 * All files under `dir` matching `extensions`, sorted by path.
 * @param {string} dir
 * @param {{extensions?:string[], skip?:Set<string>}} [options]
 * @returns {string[]} absolute paths
 */
export function walk(dir, options = {}) {
  const extensions = options.extensions ?? ['.js'];
  const skip = options.skip ?? SKIP_DIRS;
  const out = [];
  if (!existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) stack.push(full);
      } else if (extensions.includes(entry.name.slice(entry.name.lastIndexOf('.')))) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

const IMPORT_PATTERNS = [
  /(?:^|\n)\s*import\s+[^'"]*?from\s*['"]([^'"]+)['"]/g,
  /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
  /(?:^|\n)\s*export\s+[^'"]*?from\s*['"]([^'"]+)['"]/g,
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Specifiers imported by a file, in source order.
 * @returns {string[]}
 */
/**
 * Blank out comments so prose cannot impersonate code.
 *
 * Comments are replaced by spaces and their newlines are kept, so the line
 * numbers of everything that survives still match the original file. String and
 * template contents are preserved verbatim - import specifiers live in strings,
 * and a URL in a string is not a comment.
 * @param {string} source
 * @returns {string}
 */
export function stripComments(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      out += ch;
      i += 1;
      while (i < n) {
        if (source[i] === '\\') {
          out += source[i] + (source[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (source[i] === ch) break;
        out += source[i];
        i += 1;
      }
      if (i < n) {
        out += source[i];
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

export function extractImports(source) {
  const code = stripComments(source);
  const found = [];
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(code);
    while (match) {
      found.push(match[1]);
      match = pattern.exec(source);
    }
  }
  return found;
}

/** Resolve a relative specifier against the importing file's directory. */
export function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  return resolve(dirname(fromFile), specifier);
}

/** Line number of the first match of `needle` in `source` (1-based, 0 if absent). */
export function lineOf(source, needle) {
  const index = source.indexOf(needle);
  if (index < 0) return 0;
  return source.slice(0, index).split('\n').length;
}

/** Every line matching a regexp, as {line, text}. */
export function findLines(source, regexp) {
  const hits = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    regexp.lastIndex = 0;
    if (regexp.test(lines[i])) hits.push({ line: i + 1, text: lines[i].trim() });
  }
  return hits;
}

/** Import graph reachable from entry points, following relative specifiers. */
export function reachable(entryFiles) {
  const seen = new Set();
  const queue = entryFiles.filter(existsSync).map((file) => resolve(file));
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const specifier of extractImports(source)) {
      const target = resolveSpecifier(file, specifier);
      if (target) queue.push(target);
    }
  }
  return seen;
}

/** Path relative to `root`, with forward slashes. */
export function relativeTo(root, path) {
  return relative(root, path).split(sep).join('/');
}

/** Number of lines in a file (as committed, no trailing blank counting). */
export function countLines(source) {
  return source.replace(/\s+$/, '').split('\n').length;
}

export function isDirectory(path) {
  return existsSync(path) && statSync(path).isDirectory();
}
