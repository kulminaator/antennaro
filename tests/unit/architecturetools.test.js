/**
 * Unit tests: the architecture of `tools/` and of the commands that run them.
 *
 * Layer: test (unit).
 *
 * The tooling is part of the product's honesty: it is what measures, timeboxes and
 * reports. So it has its own line budget, may import nothing but node built-ins and its
 * own lib, takes its time budgets from `TIMEOUTS` rather than inventing numbers, and is
 * reachable through the npm scripts the README documents. The `src/` rules live in
 * architecture.test.js.

 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS, display } from '../../tools/lib/paths.js';
import { countLines, extractImports, relativeTo, resolveSpecifier, walk, findLines } from '../../tools/lib/scan.js';
import { checkModule, layerOf, lineBudgetFor, mayImportThree } from '../../tools/lib/arch.js';
import { TIMEOUTS } from '../../src/config.js';

const packageJson = JSON.parse(readFileSync(join(PATHS.root, 'package.json'), 'utf8'));

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
  // The name promises budgets for tools *and* tests; the tests half used to be missing, which is how
  // five files grew past 320 lines while the guidelines said they could not.
  for (const file of [...walk(PATHS.tools), ...walk(PATHS.tests)]) {
    const relative = relativeTo(PATHS.root, file);
    const source = readFileSync(file, 'utf8');
    const budget = lineBudgetFor(relative);
    assert.ok(countLines(source) <= budget, `${relative}: ${countLines(source)} lines > budget ${budget}`);
  }
  for (const file of walk(PATHS.tools)) {
    const relative = relativeTo(PATHS.root, file);
    const source = readFileSync(file, 'utf8');
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
