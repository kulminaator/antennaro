/**
 * Filesystem locations shared by every tool.
 *
 * Nothing outside this module computes paths from `process.cwd()`: the project
 * must work when a tool is started from a subdirectory or from CI.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOLS_DIR = dirname(fileURLToPath(import.meta.url)).replace(/[/\\]lib$/, '');
export const ROOT_DIR = resolve(TOOLS_DIR, '..');

export const PATHS = Object.freeze({
  root: ROOT_DIR,
  /**
   * The repository root is the web root: index.html, assets/, src/ and vendor/
   * are served as they are, so `python3 -m http.server` in a clone works and
   * GitHub Pages needs no build step. `webRoot` exists as a name so tools read
   * the intent instead of guessing from `root`.
   */
  webRoot: ROOT_DIR,
  src: join(ROOT_DIR, 'src'),
  tools: TOOLS_DIR,
  tests: join(ROOT_DIR, 'tests'),
  unitTests: join(ROOT_DIR, 'tests', 'unit'),
  browserTests: join(ROOT_DIR, 'tests', 'browser'),
  helpers: join(ROOT_DIR, 'tests', 'helpers'),
  nodeModules: join(ROOT_DIR, 'node_modules'),
  vendor: join(ROOT_DIR, 'vendor'),
  vendorThree: join(ROOT_DIR, 'vendor', 'three'),
  tmp: join(ROOT_DIR, '.tmp'),
  browserProfiles: join(ROOT_DIR, '.tmp', 'browser'),
  artifacts: join(ROOT_DIR, '.tmp', 'artifacts'),
  logs: join(ROOT_DIR, '.tmp', 'logs'),
});

export function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
  return path;
}

/** The vendored, minified three.js module the import map points at. */
export const THREE_ENTRY = join(PATHS.vendorThree, 'three.module.min.js');

/** Files a static dev server must never hand out, even though they are on disk. */
export const SERVE_DENY = Object.freeze(['.git', '.tmp', '.github', 'node_modules', '.env']);

/** Human-readable path relative to the repo root. */
export function display(path) {
  return path.startsWith(ROOT_DIR) ? path.slice(ROOT_DIR.length + 1) || '.' : path;
}
