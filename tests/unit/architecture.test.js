/**
 * Unit tests: the architecture itself.
 *
 * These are the cheap, high-value tests: they keep the promises that make the
 * rest of the project testable - the physics core runs in Node without three.js,
 * the renderer is quarantined behind adapters, configuration stays central, and
 * every documented layer boundary is real. They read the same rule table that
 * `tools/lint.js` enforces (tools/lib/arch.js), so prose, lint and tests cannot
 * drift apart.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PATHS, display } from '../../tools/lib/paths.js';
import { countLines, extractImports, relativeTo, resolveSpecifier, walk, findLines } from '../../tools/lib/scan.js';
import { checkModule, layerOf, lineBudgetFor, mayImportThree } from '../../tools/lib/arch.js';
import { ANTENNA_IDS } from '../../src/antenna/catalogue.js';
import { TIMEOUTS } from '../../src/config.js';

const packageJson = JSON.parse(readFileSync(join(PATHS.root, 'package.json'), 'utf8'));

/** All src modules as {file, relative, source, imports}. */
const modules = walk(PATHS.src).map((file) => {
  const source = readFileSync(file, 'utf8');
  return {
    file,
    relative: relativeTo(PATHS.root, file),
    source,
    imports: extractImports(source).map((specifier) => {
      const target = resolveSpecifier(file, specifier);
      return {
        specifier,
        relativeTarget: target ? relativeTo(PATHS.root, target) : null,
        exists: target ? existsSync(target) : true,
      };
    }),
  };
});

function describe(violations) {
  return violations
    .map((violation) => `${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`)
    .join('\n');
}

test('architecture: no module breaks the layer or renderer rules', () => {
  const problems = [];
  for (const module of modules) {
    const violations = checkModule({ relative: module.relative, source: module.source, imports: module.imports });
    for (const violation of violations) problems.push({ file: module.relative, ...violation });
  }
  assert.deepEqual(problems, [], `architecture violations:\n${describe(problems)}`);
});

test('architecture: every module declares the layer the table gives it', () => {
  for (const module of modules) {
    const declared = module.source.match(/Layer: L(\d)/);
    assert.ok(declared, `${module.relative}: header comment must state "Layer: L<n>"`);
    const table = layerOf(module.relative);
    assert.equal(Number(declared[1]), table.layer,
      `${module.relative}: comment says L${declared[1]} but the layer table says L${table.layer} (${table.name})`);
    assert.notEqual(table.name, 'unclassified', `${module.relative}: add it to the layer table in tools/lib/arch.js`);
  }
});

test('architecture: files stay inside the line budget', () => {
  for (const module of modules) {
    const lines = countLines(module.source);
    const budget = lineBudgetFor(module.relative);
    assert.ok(lines <= budget, `${module.relative}: ${lines} lines > budget ${budget}`);
  }
});

test('architecture: three.js stays behind the renderer adapters', () => {
  const threeUsers = modules.filter((module) => /from ['"]three['"]/.test(module.source));
  assert.ok(threeUsers.length >= 5, 'the renderer adapters are supposed to exist');
  for (const module of threeUsers) {
    assert.ok(mayImportThree(module.relative), `${module.relative} imports three.js but is not an allowed adapter`);
  }
  // The physics core must be usable with no renderer at all: this import would
  // fail loudly in Node if the boundary ever leaked.
  const pure = ['src/terrain/generators.js', 'src/antenna/model.js', 'src/propagation/coverage.js', 'src/app/state.js'];
  for (const relative of pure) {
    const module = modules.find((candidate) => candidate.relative === relative);
    assert.ok(module, `${relative} is missing`);
    assert.equal(module.imports.some((entry) => entry.specifier === 'three'), false, `${relative} imports three.js`);
    assert.ok(/from ['"]\.\.?\//.test(module.source) || relative.includes('config'), 'pure modules import their peers');
  }
});

test('architecture: the shipped app has no dependencies at all', () => {
  // Cloning the repository and serving it must be enough: no install step, no
  // bundler, no CDN. Anything third-party lives under vendor/ with a manifest.
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    assert.deepEqual(packageJson[key] ?? {}, {}, `package.json ${key} must stay empty - third-party code is vendored`);
  }
});

test('architecture: the vendored three.js is auditable and licensed', () => {
  const dir = PATHS.vendorThree;
  const manifestPath = join(dir, 'manifest.json');
  assert.ok(existsSync(manifestPath), 'vendor/three/manifest.json is missing - run: node tools/vendor.js bundle');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  assert.match(manifest.version, /^\d+\.\d+\.\d+$/, 'the manifest pins an exact version');
  const artifact = manifest.artifact['three.module.min.js'];
  assert.ok(artifact, 'the manifest must describe the shipped artifact');

  const bytes = readFileSync(join(dir, 'three.module.min.js'));
  assert.equal(bytes.length, artifact.bytes, 'artifact size drifted from the manifest');
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest, artifact.sha256, 'shipped bytes do not match the recorded sha256 - rebuild with tools/vendor.js bundle');

  // MIT requires the notice to travel with the code: inside the file and next to it.
  const license = readFileSync(join(dir, 'LICENSE.txt'), 'utf8');
  assert.match(license, /MIT/i);
  assert.match(license, /three\.js authors/);
  assert.match(bytes.subarray(0, 1200).toString('utf8'), /MIT/, 'the artifact itself must carry the notice');
  assert.match(bytes.subarray(0, 1200).toString('utf8'), /three\.js authors/);

  const notice = readFileSync(join(dir, 'NOTICE.md'), 'utf8');
  assert.ok(notice.includes(manifest.version), 'NOTICE.md must state which version was built');
  assert.match(notice, /python3 -m http.server|static file server/, 'NOTICE.md must say why the bundle exists');
  assert.match(notice, /esbuild/, 'NOTICE.md must record how the bundle was produced');

  const upstream = manifest.sources['build/three.module.js'];
  assert.match(upstream.sha256, /^[0-9a-f]{64}$/, 'upstream provenance must be a sha256');
  assert.ok(manifest.bundler.name === 'esbuild' && manifest.bundler.version, 'the minifier and its version must be recorded');
});

test('architecture: the web root is the repository root and serves from any base path', () => {
  const htmlPath = join(PATHS.webRoot, 'index.html');
  assert.ok(existsSync(htmlPath), 'index.html must sit at the repository root');
  const html = readFileSync(htmlPath, 'utf8');

  for (const [index, line] of html.split('\n').entries()) {
    assert.equal(/(href|src)="\//.test(line), false, `line ${index + 1}: root-relative URL breaks hosting under a sub-path`);
  }
  for (const [, attr, value] of html.matchAll(/(href|src)="([^"]+)"/g)) {
    if (/^[a-z+]+:\/\//i.test(value) || value.startsWith('#')) continue;
    assert.ok(existsSync(join(PATHS.webRoot, value)), `${attr}="${value}" does not exist (relative to the web root)`);
  }
  assert.equal(html.includes('/src/'), false, 'the page must not assume it is served from the repository root layout');
});

test('architecture: our own work is licensed', () => {
  const licensePath = join(PATHS.root, 'LICENSE');
  assert.ok(existsSync(licensePath), 'LICENSE is missing at the repository root');
  const license = readFileSync(licensePath, 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) \d{4} .+/);
  assert.equal(packageJson.license, 'MIT', 'package.json must agree with LICENSE');
});

test('architecture: the browser entry points at the vendored copy of three', () => {
  const html = readFileSync(join(PATHS.webRoot, 'index.html'), 'utf8');
  const importMap = html.match(/"three"\s*:\s*"([^"]+)"/);
  assert.ok(importMap, 'index.html must map the bare specifier "three" for the browser');
  assert.match(importMap[1], /^\.\//, 'Chrome only resolves explicitly relative import map values');
  const target = join(PATHS.webRoot, importMap[1]);
  assert.ok(existsSync(target), `${importMap[1]} does not exist - run node tools/vendor.js bundle`);
  assert.equal(html.includes('node_modules'), false, 'the page must not reach into node_modules');
  assert.ok(html.includes('__sim'), 'the boot guard and test API must be installed before the modules run');
});

test('architecture: the only bare specifier in the graph is three', () => {
  // "three" is resolved by the import map to the vendored bundle; nothing else
  // may be imported by bare name, because there is no node_modules at runtime.
  assert.deepEqual(packageJson.dependencies ?? {}, {}, 'package.json must declare no dependencies');
  for (const module of modules) {
    for (const entry of module.imports) {
      if (entry.specifier.startsWith('.')) continue;
      assert.equal(entry.specifier, 'three', `${module.relative} imports "${entry.specifier}" - not allowed`);
    }
  }
  for (const file of [...walk(PATHS.tools), ...walk(PATHS.tests)]) {
    for (const specifier of extractImports(readFileSync(file, 'utf8'))) {
      if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;
      assert.equal(specifier, 'three', `${display(file)} imports "${specifier}" - tools and tests use Node built-ins only`);
    }
  }
});

test('architecture: every import resolves and nothing is orphaned', () => {
  const graph = new Map(modules.map((module) => [module.relative, module.imports
    .filter((entry) => entry.relativeTarget)
    .map((entry) => entry.relativeTarget)]));
  for (const module of modules) {
    for (const entry of module.imports) {
      assert.ok(entry.exists || !entry.relativeTarget, `${module.relative}: cannot resolve "${entry.specifier}"`);
    }
  }
  const imported = new Set([...graph.values()].flat());
  const orphans = modules
    .map((module) => module.relative)
    .filter((relative) => relative !== 'src/main.js' && !imported.has(relative));
  assert.deepEqual(orphans, [], 'unreferenced modules: dead code should be deleted or wired up');
});

test('architecture: the import graph has no cycles', () => {
  const graph = new Map(modules.map((module) => [module.relative, module.imports
    .filter((entry) => entry.relativeTarget)
    .map((entry) => entry.relativeTarget)]));
  const done = new Set();
  const active = [];
  const cycles = [];
  const visit = (node) => {
    if (done.has(node)) return;
    if (active.includes(node)) {
      cycles.push([...active.slice(active.indexOf(node)), node].join(' -> '));
      return;
    }
    active.push(node);
    for (const dep of graph.get(node) ?? []) visit(dep);
    active.pop();
    done.add(node);
  };
  for (const node of graph.keys()) visit(node);
  assert.deepEqual(cycles, [], 'import cycles make load order and reasoning fragile');
});

test('architecture: configuration really is central', () => {
  const config = modules.find((module) => module.relative === 'src/config.js');
  assert.deepEqual(config.imports, [], 'config.js must not import anything');
  const importers = modules.filter((module) => module.imports.some((entry) => entry.relativeTarget === 'src/config.js'));
  assert.ok(importers.length >= 10, 'most modules should read their constants from config');

  // No second source of truth for the numbers the app runs on.
  for (const module of modules) {
    if (module.relative === 'src/config.js') continue;
    const violations = findLines(module.source, /\b6_371_000\b|\b6371000\b|\b299_792_458\b|\b299792458\b/);
    assert.deepEqual(violations, [], `${module.relative}: physical constants belong in src/config.js`);
  }
});

test('architecture: determinism - one dice roll in the whole app', () => {
  const randomUsers = modules
    .map((module) => ({ relative: module.relative, hits: findLines(module.source, /Math\.random/) }))
    .filter((entry) => entry.hits.length > 0);
  assert.equal(randomUsers.length, 1, `Math.random appears in ${randomUsers.map((r) => r.relative).join(', ')}`);
  assert.equal(randomUsers[0].relative, 'src/app/controller.js',
    'only the explicit "new seed" button may roll dice; everything downstream is seeded');
  assert.equal(findLines(modules.find((m) => m.relative === 'src/app/controller.js').source, /Math\.random/).length, 1);
});

test('architecture: nothing hard-codes an antenna design id outside the catalogue', () => {
  // The catalogue owns the ids, presets name one each, and config picks the default.
  const allowed = new Set(['src/antenna/catalogue.js', 'src/app/presets.js', 'src/config.js']);
  for (const module of modules) {
    if (allowed.has(module.relative)) continue;
    const found = ANTENNA_IDS.filter((id) => module.source.includes(`'${id}'`) || module.source.includes(`"${id}"`));
    assert.deepEqual(found, [], `${module.relative} hard-codes design id(s) ${found.join(', ')}; read the catalogue instead`);
  }
});

test('architecture: shipped code is quiet', () => {
  for (const module of modules) {
    if (!module.relative.startsWith('src/')) continue;
    assert.deepEqual(findLines(module.source, /\bconsole\.(log|debug)\s*\(/), [], `${module.relative}: use the HUD, not console.log`);
    assert.deepEqual(findLines(module.source, /\bdebugger\b/), [], `${module.relative}: debugger left in`);
    assert.deepEqual(findLines(module.source, /\bTODO\b(?!\()/), [], `${module.relative}: TODO must be TODO(owner): ...`);
    assert.deepEqual(findLines(module.source, /\bFIXME\b/), [], `${module.relative}: no FIXMEs`);
  }
});

test('architecture: every module starts with a doc comment', () => {
  for (const module of modules) {
    assert.ok(module.source.startsWith('/**\n'), `${module.relative}: must open with a /** doc comment`);
    const header = module.source.slice(0, module.source.indexOf('\n */'));
    assert.ok(header.length > 120, `${module.relative}: the header comment should explain why the module exists`);
  }
});

test('architecture: timeouts are declared in config and used by the tooling', () => {
  const keys = Object.keys(TIMEOUTS);
  assert.ok(keys.length >= 8);
  for (const [key, value] of Object.entries(TIMEOUTS)) {
    assert.ok(Number.isInteger(value) && value > 0, `${key} must be a positive integer of milliseconds`);
    const longRunning = /suite|bundle/.test(key.toLowerCase());
    const cap = longRunning ? 900_000 : 180_000;
    assert.ok(value <= cap, `${key} = ${value} ms is suspiciously long (cap ${cap})`);
  }
  const tooling = [...walk(PATHS.tools), ...walk(PATHS.tests)]
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  const used = keys.filter((key) => tooling.includes(`TIMEOUTS.${key}`) || tooling.includes(`timeoutMs: TIMEOUTS.${key}`));
  assert.ok(used.length >= 3, `tools should take their budgets from TIMEOUTS (found ${used.join(', ') || 'none'})`);
});

test('architecture: tools and tests have their own budgets and no cycles into src', () => {
  for (const file of walk(PATHS.tools)) {
    const relative = relativeTo(PATHS.root, file);
    const source = readFileSync(file, 'utf8');
    const budget = lineBudgetFor(relative);
    assert.ok(countLines(source) <= budget, `${relative}: ${countLines(source)} lines > budget ${budget}`);
    for (const entry of extractImports(source)) {
      if (!entry.startsWith('.')) {
        assert.ok(entry.startsWith('node:'), `${relative}: tools may only import node built-ins (found ${entry})`);
      }
    }
  }
  for (const file of walk(PATHS.unitTests)) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /from 'node:test'/, `${display(file)}: unit tests use node:test`);
    assert.ok(source.includes('test('), `${display(file)}: no tests in the file`);
    assert.equal(/window\./.test(source), false, `${display(file)}: unit tests must not touch the DOM`);
  }
});

test('architecture: package.json exposes the documented commands', () => {
  for (const script of ['vendor', 'dev', 'lint', 'test', 'test:unit', 'test:browser', 'verify', 'browser', 'timebox']) {
    assert.ok(packageJson.scripts[script], `npm run ${script} is missing`);
  }
  assert.equal(packageJson.type, 'module', 'the project is native ESM');
  assert.match(packageJson.scripts.lint, /tools\/lint\.js/);
  assert.match(packageJson.scripts.verify, /lint/);
});


