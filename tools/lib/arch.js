/**
 * Architecture rules, shared by tools/lint.js and tests/unit/architecture.test.js.
 *
 * One table, two consumers: the CLI that fails the build and the unit test that
 * explains the failure with a nice diff. Keeping the rules in code (instead of
 * prose) is what makes GUIDELINES.md §4-§5 enforceable instead of aspirational.
 */

import { stripComments } from './scan.js';

/**
 * Layer map. A module may import modules at a LOWER layer or at its own layer,
 * never upwards. The first matching entry wins, so list specific files before
 * the directory they live in.
 */
export const LAYER_TABLE = Object.freeze([
  Object.freeze({ match: /^src\/config\.js$/, layer: 0, name: 'configuration' }),
  Object.freeze({ match: /^src\/math\/(scalar|vec3)\.js$/, layer: 0, name: 'maths' }),

  Object.freeze({ match: /^src\/math\/noise\.js$/, layer: 1, name: 'seeded randomness' }),
  Object.freeze({ match: /^src\/core\/eventbus\.js$/, layer: 1, name: 'events' }),
  Object.freeze({ match: /^src\/palette\.js$/, layer: 1, name: 'palette' }),
  Object.freeze({ match: /^src\/terrain\/(heightfield|generators|site)\.js$/, layer: 1, name: 'terrain domain' }),
  Object.freeze({ match: /^src\/antenna\/(aim|catalogue|pattern|geometryspec)\.js$/, layer: 1, name: 'antenna domain' }),
  Object.freeze({ match: /^src\/propagation\/(rf|los)\.js$/, layer: 1, name: 'propagation domain' }),
  Object.freeze({ match: /^src\/app\/fields\.js$/, layer: 1, name: 'state schema' }),

  Object.freeze({ match: /^src\/antenna\/model\.js$/, layer: 2, name: 'domain service' }),
  Object.freeze({ match: /^src\/propagation\/coverage\.js$/, layer: 2, name: 'domain service' }),
  Object.freeze({ match: /^src\/app\/(state|presets)\.js$/, layer: 2, name: 'app service' }),
  Object.freeze({ match: /^src\/ui\/schema\.js$/, layer: 2, name: 'ui schema' }),

  Object.freeze({ match: /^src\/core\/loop\.js$/, layer: 3, name: 'frame loop' }),

  Object.freeze({ match: /mesh\.js$/, layer: 4, name: 'render adapter' }),
  Object.freeze({ match: /^src\/app\/(viewport|labels|orbit)\.js$/, layer: 4, name: 'render adapter' }),

  Object.freeze({ match: /^src\/ui\//, layer: 5, name: 'ui adapter' }),
  Object.freeze({ match: /^src\/app\//, layer: 5, name: 'composition' }),
  Object.freeze({ match: /^src\/main\.js$/, layer: 5, name: 'composition root' }),
]);


/** Modules allowed to `import 'three'`: the renderer adapters and nothing else. */
export const THREE_ALLOW = Object.freeze([
  /mesh\.js$/,
  /^src\/app\/(viewport|labels|controller)\.js$/,
]);

/** Modules that must run in plain Node with no DOM, clock or randomness. */
export const PURE_PATTERNS = Object.freeze([
  /^src\/config\.js$/,
  /^src\/math\//,
  /^src\/core\/eventbus\.js$/,
  /^src\/palette\.js$/,
  /^src\/terrain\/(heightfield|generators|site)\.js$/,
  /^src\/antenna\/(pattern|catalogue|aim|model|geometryspec)\.js$/,
  /^src\/propagation\/(rf|los|coverage)\.js$/,
  /^src\/app\/(fields|state|presets)\.js$/,
  /^src\/ui\/schema\.js$/,
]);

/** Token -> why it is forbidden in the pure core. */
export const PURE_FORBIDDEN = Object.freeze([
  { pattern: /\bdocument\b/, why: 'DOM access' },
  { pattern: /\bwindow\b/, why: 'global browser object' },
  { pattern: /\bnavigator\b/, why: 'browser API' },
  { pattern: /performance\.now\s*\(/, why: 'wall clock' },
  { pattern: /Date\.now\s*\(/, why: 'wall clock' },
  { pattern: /Math\.random\s*\(/, why: 'unseeded randomness - use math/noise.js' },
  { pattern: /setTimeout\s*\(|setInterval\s*\(|requestAnimationFrame\s*\(/, why: 'timer' },
  { pattern: /\bfetch\s*\(|XMLHttpRequest/, why: 'network access' },
  { pattern: /console\.(log|warn|error|info)\s*\(/, why: 'logging belongs in the UI layer' },
]);

/** Shipped-code hygiene rules: [pattern, message]. */
export const HYGIENE_RULES = Object.freeze([
  [/\bconsole\.(log|debug)\s*\(/, 'console.log in shipped code'],
  [/\bdebugger\b/, 'debugger statement'],
  [/\bTODO\b(?!\()/, 'TODO must carry an owner: TODO(name): ...'],
  [/\bFIXME\b/, 'FIXME not allowed; reference an issue instead'],
]);

export const LINE_BUDGET = Object.freeze({ 'src/': 350, 'tools/': 430, 'tests/': 320 });

/** @returns {{layer:number, name:string}} */
export function layerOf(relativePath) {
  for (const entry of LAYER_TABLE) {
    if (entry.match.test(relativePath)) return { layer: entry.layer, name: entry.name };
  }
  return { layer: 99, name: 'unclassified' };
}

export function mayImportThree(relativePath) {
  return THREE_ALLOW.some((pattern) => pattern.test(relativePath));
}

export function isPureModule(relativePath) {
  return PURE_PATTERNS.some((pattern) => pattern.test(relativePath));
}

export function lineBudgetFor(relativePath) {
  for (const [prefix, budget] of Object.entries(LINE_BUDGET)) {
    if (relativePath.startsWith(prefix)) return budget;
  }
  return 400;
}

/**
 * All rules that can be answered from a single module's text.
 * @param {{relative:string, source:string, imports:Array<{specifier:string, relativeTarget:string|null, exists:boolean}>}} module
 * @returns {Array<{rule:string, message:string, line:number}>}
 */
export function checkModule(module) {
  const { relative, source, imports } = module;
  // Prose must not be able to trip a rule (a comment mentioning `window` is not
  // DOM access), so purity and hygiene scan the code with comments blanked out.
  // Line numbers survive because blanking keeps newlines.
  const code = stripComments(source);
  const problems = [];
  const push = (rule, message, line = 1) => problems.push({ rule, message, line });

  const usesThree = /from\s+['"]three['"]/.test(source);
  if (usesThree && !mayImportThree(relative)) {
    push('renderer-boundary', 'imports three.js but is not an allowed renderer adapter');
  }

  const own = layerOf(relative);
  if (own.layer === 99) push('layer', 'module is not classified in the layer table');

  for (const entry of imports) {
    if (!entry.relativeTarget) {
      if (entry.specifier !== 'three' && !entry.specifier.startsWith('three/')) {
        push('dependency-policy', `bare import "${entry.specifier}" - three.js is the only external dependency allowed`);
      }
      continue;
    }
    if (!entry.exists) push('import-graph', `cannot resolve import "${entry.specifier}"`);
    const targetLayer = layerOf(entry.relativeTarget);
    if (own.layer !== 99 && targetLayer.layer > own.layer) {
      push('layer', `layer ${own.layer} (${own.name}) may not import layer ${targetLayer.layer} (${entry.relativeTarget})`);
    }
    if (own.layer <= 3 && /(^|\/)(tests|tools)\//.test(entry.relativeTarget)) {
      push('dependency-direction', `src must never import ${entry.relativeTarget}`);
    }
  }

  if (isPureModule(relative)) {
    for (const forbidden of PURE_FORBIDDEN) {
      const lines = linesMatching(code, forbidden.pattern);
      for (const line of lines) push('purity', `${forbidden.why} is forbidden in a pure module`, line);
    }
    if (usesThree) push('purity', 'pure modules must not import three.js');
  }

  if (relative.startsWith('src/')) {
    for (const [pattern, message] of HYGIENE_RULES) {
      for (const line of linesMatching(code, pattern)) push('hygiene', message, line);
    }
  }

  return problems;
}

/** 1-based line numbers whose text matches `pattern`. */
export function linesMatching(source, pattern) {
  const out = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    pattern.lastIndex = 0;
    if (pattern.test(lines[i])) out.push(i + 1);
  }
  return out;
}
