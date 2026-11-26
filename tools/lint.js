#!/usr/bin/env node
/**
 * Static project checks - the rules in GUIDELINES.md that a machine can enforce.
 *
 *   node tools/lint.js              # all checks
 *   node tools/lint.js --verbose    # also print the informational notes
 *   node tools/lint.js --json       # machine-readable report
 *
 * Checks:
 *   1. syntax        `node --check` on every JS file in src, tools, tests
 *   2. module rules  layering, renderer boundary, purity, hygiene (tools/lib/arch.js)
 *   3. file size     per-area line budgets
 *   4. reachability  every src module is reachable from src/main.js
 *   5. vendor        vendor/three matches its manifest (hash, license, notice)
 *   6. index.html    import map + relative URLs: the repo root is the web root
 *   7. test layout   *.test.js names, unit tests stay browser-free
 *
 * Exit 0 = clean, 1 = violations printed as `file:line [rule] message`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS, display } from './lib/paths.js';
import { countLines, extractImports, relativeTo, resolveSpecifier, reachable, walk } from './lib/scan.js';
import { checkModule, lineBudgetFor } from './lib/arch.js';
import { checkArgs, parseArgs, usage } from './lib/args.js';
import { guardBrokenPipe, runSync } from './lib/proc.js';
import { vendorProblems } from './vendor.js';

const violations = [];
const notes = [];

function add(file, rule, message, line = 1) {
  violations.push({ file: display(file), rule, message, line });
}

/** Read a module and turn its import statements into resolvable records. */
function readModule(file) {
  const relative = relativeTo(PATHS.root, file);
  const source = readFileSync(file, 'utf8');
  const imports = extractImports(source).map((specifier) => {
    const target = resolveSpecifier(file, specifier);
    return {
      specifier,
      relativeTarget: target ? relativeTo(PATHS.root, target) : null,
      exists: target ? existsSync(target) : true,
    };
  });
  return { file, relative, source, imports };
}

function checkFileSizes(files) {
  // The budget lives in one table (LINE_BUDGET) and used to be applied to src modules only: a
  // 500-line file dropped into tools/ passed lint without a word, and no test file was ever measured
  // there at all. GUIDELINES declares a budget for all three trees, so lint measures all three.
  let over = 0;
  for (const file of files) {
    const relative = relativeTo(PATHS.root, file);
    const lines = countLines(readFileSync(file, 'utf8'));
    const budget = lineBudgetFor(relative);
    if (lines > budget) {
      over += 1;
      add(file, 'file-size', `${relative}: ${lines} lines exceeds the ${budget}-line budget: split the file`);
    }
  }
  notes.push(`line budget: ${files.length} file(s) measured, ${over} over`);
}

function checkSyntax(files) {
  for (const file of files) {
    const result = runSync(process.execPath, ['--check', file], { timeoutMs: 20_000 });
    if (result.code === 0) continue;
    const header = (result.stderr ?? '').split('\n').find((line) => line.includes(display(file)));
    const detail = (result.stderr ?? 'syntax error').split('\n').filter(Boolean).slice(0, 2).join(' | ');
    add(file, 'syntax', detail, header ? Number(header.split(':')[1]) || 1 : 1);
  }
  notes.push(`syntax: ${files.length} file(s) parsed`);
}

function checkModules(modules) {
  for (const module of modules) {
    for (const problem of checkModule(module)) {
      add(module.file, problem.rule, problem.message, problem.line);
    }
  }
  const threeUsers = modules.filter((module) => /from ['"]three['"]/.test(module.source));
  notes.push(`renderer boundary: ${threeUsers.length} module(s) import three.js (${threeUsers.map((m) => m.relative).join(', ')})`);
}

function checkReachability(modules) {
  const entry = join(PATHS.src, 'main.js');
  if (!existsSync(entry)) {
    add(entry, 'reachability', 'entry point src/main.js is missing');
    return;
  }
  const seen = reachable([entry]);
  for (const module of modules) {
    if (!seen.has(module.file)) {
      add(module.file, 'reachability', 'not reachable from src/main.js: dead code or missing wiring');
    }
  }
  notes.push(`reachability: ${seen.size}/${modules.length} src modules reachable`);
}

function checkVendorAndImportMap() {
  const problems = vendorProblems();
  for (const problem of problems) add(PATHS.vendorThree, 'vendor', problem);
  if (problems.length === 0) {
    const manifest = JSON.parse(readFileSync(join(PATHS.vendorThree, 'manifest.json'), 'utf8'));
    notes.push(`vendor: three ${manifest.version} (minified bundle, license + notice present)`);
  }

  checkIndexHtml();
}

/**
 * The repository root is the web root, so index.html must work from any base
 * path: relative asset URLs only, an import map that points at a file that
 * exists, and no dependency on our own dev server.
 */
function checkIndexHtml() {
  const htmlPath = join(PATHS.webRoot, 'index.html');
  if (!existsSync(htmlPath)) {
    add(htmlPath, 'import-map', 'index.html is missing from the repository root (the web root)');
    return;
  }
  const html = readFileSync(htmlPath, 'utf8');

  // Absolute "/foo" URLs break the moment the app is hosted under a sub-path,
  // which is exactly what GitHub Pages does.
  for (const [index, line] of html.split('\n').entries()) {
    const absolute = line.match(/(href|src)="\//);
    if (absolute) add(htmlPath, 'static-hostable', 'root-relative URL breaks hosting under a sub-path - use a relative path', index + 1);
  }

  const match = html.match(/"three"\s*:\s*"([^"]+)"/);
  if (!match) {
    add(htmlPath, 'import-map', 'no import map entry for "three"');
    return;
  }
  // Chrome resolves an import map value against the document base only when it
  // is *explicitly* relative ("./" or "../"); a bare "vendor/x.js" is treated as
  // specifier-like text and rejected with "blocked by a null value".
  const target = match[1];
  if (!/^\.\./.test(target) && !/^\.\//.test(target) && !/^[a-z+]+:\/\//i.test(target)) {
    add(htmlPath, 'import-map', `import map target "${target}" must be explicitly relative (start with "./" or "../") or absolute`);
  }
  if (target.startsWith('/')) {
    add(htmlPath, 'import-map', `import map target "${target}" must not be root-relative - it breaks hosting under a sub-path`);
  }
  const resolvedTarget = join(PATHS.webRoot, target.replace(/^\.\//, ''));
  if (!existsSync(resolvedTarget)) add(htmlPath, 'import-map', `import map points at ${target}, which does not exist`);
  else notes.push(`import map: three -> ${match[1]}`);

  const css = html.match(/<link[^>]+href="([^"]+)"/)?.[1];
  if (css && !existsSync(join(PATHS.webRoot, css))) add(htmlPath, 'static-hostable', `stylesheet ${css} is missing`);
  const entry = html.match(/<script type="module" src="([^"]+)"/)?.[1];
  if (!entry) add(htmlPath, 'static-hostable', 'no <script type="module" src="..."> entry point');
  else if (!existsSync(join(PATHS.webRoot, entry))) add(htmlPath, 'static-hostable', `entry module ${entry} is missing`);

  // Zero third-party dependencies is what makes the clone-and-serve story true.
  const pkg = JSON.parse(readFileSync(join(PATHS.root, 'package.json'), 'utf8'));
  for (const key of ['dependencies', 'devDependencies']) {
    const names = Object.keys(pkg[key] ?? {});
    if (names.length > 0) {
      add(join(PATHS.root, 'package.json'), 'static-hostable', `${key} must be empty - third-party code is vendored under vendor/ (${names.join(', ')})`);
    }
  }
}

function checkTestLayout() {
  const unit = walk(PATHS.unitTests);
  const browser = walk(PATHS.browserTests);
  if (unit.length === 0) add(PATHS.unitTests, 'test-layout', 'no unit tests found - the pure core must be covered');
  for (const file of [...unit, ...browser]) {
    if (!file.endsWith('.test.js')) add(file, 'test-layout', 'test files must be named *.test.js');
  }
  for (const file of unit) {
    const source = readFileSync(file, 'utf8');
    if (/startBrowser\(|CdpConnection|createAppSession/.test(source)) {
      add(file, 'test-layout', 'unit test needs a browser - move it to tests/browser/');
    }
    if (!source.includes("from 'node:test'")) add(file, 'test-layout', 'test file does not import node:test');
  }
  notes.push(`tests: ${unit.length} unit, ${browser.length} browser file(s)`);
}

async function main() {
  guardBrokenPipe();
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) usage('lint.js - architecture and hygiene checks\n\n  node tools/lint.js [--verbose] [--json]');
  // It checks the whole tree or nothing: a file argument used to be accepted and ignored, which
  // made `lint.js src/config.js` look like a targeted check when it had just linted the repo.
  checkArgs(parsed, {
    name: 'lint.js',
    flags: ['help', 'verbose', 'json'],
    positionals: 0,
    hint: 'lint checks the whole tree; to measure one file use: wc -l <file>',
    usageText: 'usage: node tools/lint.js [--verbose] [--json]',
  });

  const srcFiles = walk(PATHS.src);
  const toolFiles = walk(PATHS.tools);
  const testFiles = walk(PATHS.tests);
  const modules = srcFiles.map(readModule);

  checkSyntax([...srcFiles, ...toolFiles, ...testFiles]);
  checkFileSizes([...srcFiles, ...toolFiles, ...testFiles]);
  checkModules(modules);
  checkReachability(modules);
  checkVendorAndImportMap();
  checkTestLayout();

  violations.sort((a, b) => `${a.file}:${a.rule}:${a.line}`.localeCompare(`${b.file}:${b.rule}:${b.line}`));

  if (parsed.flags.json) {
    process.stdout.write(`${JSON.stringify({ ok: violations.length === 0, violations, notes }, null, 2)}\n`);
  } else {
    for (const violation of violations) {
      process.stdout.write(`${violation.file}:${violation.line}  [${violation.rule}] ${violation.message}\n`);
    }
    if (parsed.flags.verbose) for (const note of notes) process.stdout.write(`note: ${note}\n`);
    if (violations.length === 0) {
      process.stdout.write(`lint ok - ${srcFiles.length} src, ${toolFiles.length} tools, ${testFiles.length} tests file(s)\n`);
    } else {
      process.stdout.write(`\n${violations.length} violation(s)\n`);
    }
  }
  process.exitCode = violations.length === 0 ? 0 : 1;
}

await main();
