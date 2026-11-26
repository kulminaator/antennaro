#!/usr/bin/env node
/**
 * Own the third-party bytes the browser loads - no npm install required.
 *
 *   node tools/vendor.js                 verify vendor/three matches its manifest
 *   node tools/vendor.js show            print the manifest
 *   node tools/vendor.js bundle [--version 0.188.0] [--from node_modules]
 *
 * three ships an unminified ESM pair (`three.module.js` + `three.core.js`, about
 * 2.1 MB). We ship one minified, self-contained module with the license attached
 * and the provenance recorded, so that:
 *
 *   - the repository is servable by any static file server, with no node_modules;
 *   - `ls vendor/three` is the complete list of third-party bytes we distribute;
 *   - the MIT notice travels inside the artifact *and* as LICENSE.txt next to it;
 *   - `check` (also run by lint) turns "the shipped bytes are not the published
 *     bytes" into a failing build step instead of a mystery.
 *
 * `bundle` is a maintainer action and needs the network: it downloads the exact
 * published tarball from registry.npmjs.org, minifies it with esbuild (run
 * through npx, never a dependency of this project), and rewrites the manifest.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PATHS, display, ensureDir } from './lib/paths.js';
import { checkArgs, parseArgs, usage } from './lib/args.js';
import { exitAfterFlush, guardBrokenPipe, run } from './lib/proc.js';
import { fetchPackageFiles, sha256 } from './lib/npm.js';
import { TIMEOUTS } from '../src/config.js';

const PACKAGE = 'three';
const ARTIFACT = 'three.module.min.js';
const LICENSE_FILE = 'LICENSE.txt';
const NOTICE_FILE = 'NOTICE.md';
const MANIFEST_FILE = 'manifest.json';
/** Build-time minifier, run via npx. Recorded in the manifest, never a dependency. */
const ESBUILD_VERSION = '0.28.2';
/** Paths inside the published package that we need. */
const UPSTREAM = Object.freeze(['build/three.module.js', 'build/three.core.js', 'LICENSE']);

const paths = {
  dir: PATHS.vendorThree,
  artifact: join(PATHS.vendorThree, ARTIFACT),
  license: join(PATHS.vendorThree, LICENSE_FILE),
  notice: join(PATHS.vendorThree, NOTICE_FILE),
  manifest: join(PATHS.vendorThree, MANIFEST_FILE),
};

function readManifest() {
  if (!existsSync(paths.manifest)) return null;
  try {
    return JSON.parse(readFileSync(paths.manifest, 'utf8'));
  } catch (error) {
    return { __broken: String(error.message) };
  }
}

/** @returns {{version: string|null, artifact: object|null, problems: string[]}} */
export function vendorStatus() {
  const manifest = readManifest();
  const problems = [];
  if (!manifest) return { version: null, artifact: null, problems: ['vendor/three/manifest.json is missing'] };
  if (manifest.__broken) return { version: null, artifact: null, problems: [`manifest.json does not parse: ${manifest.__broken}`] };

  for (const key of ['version', 'artifact', 'sources', 'bundler']) {
    if (!manifest[key]) problems.push(`manifest.json is missing "${key}"`);
  }
  const entry = manifest.artifact?.[ARTIFACT];
  if (!entry) problems.push(`manifest.json does not describe ${ARTIFACT}`);
  if (!manifest.license?.sha256) problems.push('manifest.json does not record the license hash');

  if (entry && existsSync(paths.artifact)) {
    const bytes = readFileSync(paths.artifact);
    if (bytes.length !== entry.bytes) problems.push(`${ARTIFACT} is ${bytes.length} bytes, manifest says ${entry.bytes}`);
    if (sha256(bytes) !== entry.sha256) problems.push(`${ARTIFACT} does not match the sha256 in manifest.json`);
    return { version: manifest.version ?? null, artifact: entry, problems };
  }
  problems.push(existsSync(paths.artifact) ? '' : `${ARTIFACT} is missing from vendor/three/`);
  return { version: manifest.version ?? null, artifact: entry ?? null, problems: problems.filter(Boolean) };
}

/** Everything `check` can say about the shipped vendor directory. */
export function vendorProblems() {
  const { version, problems } = vendorStatus();
  if (version === null) return problems;

  const license = existsSync(paths.license) ? readFileSync(paths.license, 'utf8') : '';
  if (!license) problems.push(`${LICENSE_FILE} is missing - the MIT notice must be distributed with the code`);
  else if (!/MIT/i.test(license) || !/three\.js authors/.test(license)) {
    problems.push(`${LICENSE_FILE} does not look like three's MIT notice`);
  }

  const notice = existsSync(paths.notice) ? readFileSync(paths.notice, 'utf8') : '';
  if (!notice) problems.push(`${NOTICE_FILE} is missing - provenance must be written down`);
  else if (version && !notice.includes(version)) problems.push(`${NOTICE_FILE} does not mention version ${version}`);

  const artifact = existsSync(paths.artifact) ? readFileSync(paths.artifact, 'utf8') : '';
  if (artifact) {
    const banner = artifact.slice(0, 1200);
    if (!/three\.js authors/.test(banner) || !/MIT/i.test(banner)) {
      problems.push(`${ARTIFACT} has no license banner at the top of the file`);
    }
    if (/from\s+['"]\.\/three\.core/.test(artifact)) problems.push(`${ARTIFACT} still imports three.core.js - it must be self-contained`);
    if (/sourceMappingURL/.test(artifact)) problems.push(`${ARTIFACT} references a source map we do not ship`);
  }
  return problems;
}

function commandCheck() {
  const problems = vendorProblems();
  const { version } = vendorStatus();
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`vendor: ${problem}\n`);
    process.stderr.write('fix it with: node tools/vendor.js bundle\n');
    return 1;
  }
  const bytes = readFileSync(paths.artifact).length;
  process.stdout.write(
    `vendor ok - three ${version}, ${ARTIFACT} ${(bytes / 1024).toFixed(0)} KiB, license + notice present\n`,
  );
  return 0;
}

function commandShow() {
  const manifest = readManifest();
  if (!manifest) {
    process.stderr.write('no manifest - run: node tools/vendor.js bundle\n');
    return 1;
  }
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  return 0;
}

/** @returns {Promise<Map<string, Buffer>>} upstream files, from registry or node_modules. */
async function upstreamSources(version, from) {
  const localDir = join(PATHS.nodeModules, PACKAGE);
  if (from === 'node_modules' || (from === undefined && existsSync(join(localDir, 'build', 'three.module.js')))) {
    const files = new Map();
    for (const path of UPSTREAM) {
      const file = join(localDir, path);
      if (!existsSync(file)) throw new Error(`${display(file)} is missing - drop --from node_modules and it will be fetched`);
      files.set(path, readFileSync(file));
    }
    process.stdout.write(`sources: ${display(localDir)} (local node_modules)\n`);
    return files;
  }
  if (from !== 'node_modules') process.stdout.write(`sources: registry.npmjs.org ${PACKAGE}@${version}\n`);
  return fetchPackageFiles(PACKAGE, version, UPSTREAM, { timeoutMs: TIMEOUTS.vendorBundle });
}

function banner(version, sourceHash) {
  return `/*! three.js r${version.split('.')[1]} - ${PACKAGE}@${version}, minified bundle
 * https://threejs.org - (c) 2010-2026 three.js authors - MIT license
 * The license text is distributed next to this file as ${LICENSE_FILE}; provenance
 * (upstream files, hashes, build command) is in ${NOTICE_FILE} and ${MANIFEST_FILE}.
 * Built from build/three.module.js sha256 ${sourceHash}. Do not edit by hand.
 */\n`;
}

async function commandBundle(flags) {
  const manifest = readManifest() ?? {};
  const version = String(flags.version ?? manifest.version ?? '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    process.stderr.write('give a version: node tools/vendor.js bundle --version 0.187.0\n');
    return 2;
  }
  const buildDir = ensureDir(join(PATHS.tmp, 'vendor-build', `${PACKAGE}-${version}`));
  const files = await upstreamSources(version, flags.from);

  // esbuild resolves `./three.core.js` relative to the entry, so unpack together.
  const entry = join(buildDir, 'three.module.js');
  writeFileSync(entry, files.get('build/three.module.js'));
  writeFileSync(join(buildDir, 'three.core.js'), files.get('build/three.core.js'));
  const rawOut = join(buildDir, ARTIFACT);

  const args = [
    '--yes', `esbuild@${ESBUILD_VERSION}`, entry,
    '--bundle', '--format=esm', '--minify', '--legal-comments=none', '--target=es2020',
    `--outfile=${rawOut}`,
  ];
  process.stdout.write(`minifying with npx --yes esbuild@${ESBUILD_VERSION} ...\n`);
  const result = await run('npx', args, { timeoutMs: TIMEOUTS.vendorBundle, cwd: PATHS.root });
  if (result.code !== 0 || !existsSync(rawOut)) {
    process.stderr.write(`esbuild failed (exit ${result.code}):\n${(result.stderr || result.stdout).slice(-1500)}\n`);
    return 1;
  }

  const sourceHash = sha256(files.get('build/three.module.js'));
  const minified = readFileSync(rawOut, 'utf8');
  const artifact = `${banner(version, sourceHash)}${minified}`;
  ensureDir(paths.dir);
  writeFileSync(paths.artifact, artifact);

  const licenseText = files.get('LICENSE').toString('utf8');
  writeFileSync(paths.license, licenseText);

  const artifactBytes = Buffer.from(artifact);
  const record = {
    package: PACKAGE,
    version,
    artifact: { [ARTIFACT]: { bytes: artifactBytes.length, sha256: sha256(artifactBytes) } },
    license: { file: LICENSE_FILE, sha256: sha256(files.get('LICENSE')) },
    sources: Object.fromEntries(
      ['build/three.module.js', 'build/three.core.js'].map((path) => [path, {
        bytes: files.get(path).length,
        sha256: sha256(files.get(path)),
      }]),
    ),
    bundler: { name: 'esbuild', version: ESBUILD_VERSION, command: `npx --yes esbuild@${ESBUILD_VERSION} build/three.module.js --bundle --format=esm --minify --legal-comments=none --target=es2020` },
    importedAs: 'three',
    builtAt: new Date().toISOString(),
  };
  writeFileSync(paths.manifest, `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(paths.notice, notice(record));

  const before = record.sources['build/three.module.js'].bytes + record.sources['build/three.core.js'].bytes;
  process.stdout.write(
    `wrote ${display(paths.artifact)}: ${(artifactBytes.length / 1024).toFixed(0)} KiB `
    + `(from ${(before / 1024).toFixed(0)} KiB upstream)\n`,
  );
  return commandCheck();
}

function notice(record) {
  return `# Vendored three.js

| | |
| --- | --- |
| Package | \`${record.package}@${record.version}\` |
| Upstream | https://threejs.org , https://www.npmjs.com/package/three/v/${record.version} |
| License | MIT - full text in [\`${LICENSE_FILE}\`](${LICENSE_FILE}) |
| Copyright | (c) 2010-2026 three.js authors |
| Shipped file | [\`${ARTIFACT}\`](${ARTIFACT}) (${(record.artifact[ARTIFACT].bytes / 1024).toFixed(0)} KiB, sha256 \`${record.artifact[ARTIFACT].sha256}\`) |
| Built with | \`${record.bundler.command}\` |
| Built at | ${record.builtAt} |

## Why a bundle instead of a dependency

The application is static files. Anyone who clones this repository can serve it
with \`python3 -m http.server\` or push it to GitHub Pages; there is no install
step, no bundler and no CDN, so the exact bytes the browser runs have to be in
the repository.

## What was built, from what

\`${ARTIFACT}\` is the published ESM entry (\`build/three.module.js\` plus the
\`build/three.core.js\` it imports) bundled into one module and minified. Nothing
was added, removed or patched. The upstream hashes pin exactly which published
bytes went in:

| upstream file | bytes | sha256 |
| --- | --- | --- |
${Object.entries(record.sources).map(([path, info]) => `| \`${path}\` | ${info.bytes} | \`${info.sha256}\` |`).join('\n')}

The published package contains no minified ESM build, which is why this step
exists. \`node tools/vendor.js check\` (also run by \`npm run lint\`) verifies the
shipped bytes against \`manifest.json\`.

## Reproducing

\`\`\`bash
node tools/vendor.js bundle --version ${record.version}   # needs network
node tools/vendor.js check
\`\`\`

The minifier is fetched with \`npx --yes\` at build time; it is deliberately not a
dependency of this project, and its version is recorded above.
`;
}

async function main() {
  guardBrokenPipe();
  const parsed = parseArgs(process.argv.slice(2), { booleans: ['check'] });
  checkArgs(parsed, {
    name: 'vendor.js',
    flags: ['help', 'check', 'version', 'from'],
    positionals: 1,
    hint: 'commands are check (default), show and bundle; bundle takes --version and --from',
  });
  const command = parsed._[0] ?? (parsed.flags.check ? 'check' : 'check');
  if (parsed.help) {
    usage(`vendor.js - own the third-party bytes the browser loads

  node tools/vendor.js                                   verify (default)
  node tools/vendor.js show                              print manifest.json
  node tools/vendor.js bundle [--version X] [--from node_modules]

  check verifies: sha256 + size against manifest.json, license banner inside the
  artifact, ${LICENSE_FILE} next to it, ${NOTICE_FILE} provenance.
  bundle needs the network (registry + npx esbuild).`);
  }

  if (command === 'show') return commandShow();
  if (command === 'bundle') return commandBundle(parsed.flags);
  if (command === 'check') return commandCheck();
  process.stderr.write(`unknown command "${command}" (try: check, show, bundle)\n`);
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  exitAfterFlush(await main());
}
