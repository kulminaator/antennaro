/**
 * Unit tests for the About dialog's claims.
 *
 * The dialog is L5 and builds DOM, so the browser suite is where its pixels belong.
 * What is testable in Node is the half that was written to be testable: `aboutFacts()`,
 * which holds every claim the dialog makes as plain data. A browser test could not tell
 * a stale licence path from a working one; this can, because the claims are checked
 * against the files sitting in the repository.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { APP, PATHS } from '../../src/config.js';
import { aboutFacts, releaseTag } from '../../src/ui/about.js';
import { PATHS as TOOL_PATHS } from '../../tools/lib/paths.js';

test('about: the version it quotes is the app version, not a second copy', () => {
  const facts = aboutFacts();
  assert.equal(facts.version, APP.version, 'the dialog must not carry its own version number');
});

test('about: the source link is a public web address, not a push remote', () => {
  const facts = aboutFacts();
  assert.match(facts.repoUrl, /^https:\/\/github\.com\/[^/]+\/[^/]+$/, 'must be browsable as typed');
  assert.ok(!facts.repoUrl.endsWith('.git'), 'a .git url is for pushing, and 404s in a browser');
  assert.ok(!facts.repoUrl.endsWith('/'), 'a trailing slash is an accident, not a style');
  const pkg = JSON.parse(readFileSync(join(TOOL_PATHS.root, 'package.json'), 'utf8'));
  assert.equal(facts.licence, pkg.licence ?? pkg.license, 'the dialog and package.json agree');
  assert.equal(pkg.license, 'MIT');
});

test('about: every file it points at is in the repository it ships from', () => {
  const facts = aboutFacts();
  // The dialog's paths are relative to the page, and the page is the web root; the repo
  // root is the web root, so a path the browser can fetch is a path we can stat.
  for (const path of [facts.licencePath, facts.three.dir, facts.three.licencePath,
    facts.three.noticePath, facts.three.manifestPath]) {
    assert.ok(existsSync(join(TOOL_PATHS.root, path)), `${path} is quoted by the dialog and missing`);
  }
  assert.equal(join(TOOL_PATHS.root, facts.three.dir), TOOL_PATHS.vendorThree,
    'the directory the page fetches from is the directory tools/vendor.js writes');
});

test('about: the notice it points at is the notice it describes', () => {
  const facts = aboutFacts();
  const licence = readFileSync(join(TOOL_PATHS.root, facts.three.licencePath), 'utf8');
  assert.match(licence, /^The MIT License/m, 'three.js is MIT, and so says its own licence file');
  assert.match(licence, /three\.js authors/, 'the copyright line the dialog quotes is in the text');
  const notice = readFileSync(join(TOOL_PATHS.root, facts.three.noticePath), 'utf8');
  assert.match(notice, /MIT/, 'NOTICE.md names the licence too');
});

test('about: the three.js release is read, never retyped', () => {
  const facts = aboutFacts();
  assert.equal(facts.three.version, undefined,
    'no version may be baked into the dialog: the manifest is the only copy of that fact');
  const manifest = JSON.parse(readFileSync(join(TOOL_PATHS.root, facts.three.manifestPath), 'utf8'));
  assert.equal(manifest.package, 'three');
  assert.equal(releaseTag(manifest.version), `r${Number(manifest.version.split('.')[1])}`,
    'the short release form the dialog prints follows three.js own convention');
  assert.equal(releaseTag('0.0.0'), 'v0.0.0', 'release 0 is not a release number to print');
  assert.equal(releaseTag('who knows'), 'vwho knows', 'something unreadable is quoted as it came');
});

test('about: the licence of this simulator is the file the dialog names', () => {
  const facts = aboutFacts();
  const licence = readFileSync(join(TOOL_PATHS.root, facts.licencePath), 'utf8');
  assert.match(licence, /^MIT License/m);
  assert.ok(licence.includes(facts.copyright.replace('© ', '')),
    'the copyright holder named in the dialog appears in the licence text');
});
