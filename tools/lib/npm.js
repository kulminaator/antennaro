/**
 * Fetch a published npm package with no dependencies.
 *
 * The project deliberately ships zero dependencies, so the vendored third-party
 * code cannot be produced by `npm install <pkg>` on the build machine: `bundle`
 * in tools/vendor.js downloads the exact published tarball from the registry and
 * reads the files it needs out of it. That also makes provenance honest - the
 * bytes we vendor are the bytes the registry served, hashed into the manifest.
 *
 * `gunzipSync` plus a 30-line tar reader is enough: npm tarballs are
 * gzip'd ustar archives with paths under `package/`.
 */

import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { withTimeout } from './timeout.js';

export const REGISTRY = 'https://registry.npmjs.org';

/** NUL/space-terminated ASCII field of a tar header. */
function field(header, start, length) {
  const slice = header.subarray(start, start + length);
  let end = 0;
  while (end < slice.length && slice[end] !== 0 && slice[end] !== 0x20) end += 1;
  return Buffer.from(slice.subarray(0, end)).toString('utf8');
}

/**
 * Read a gzip'd tar into `path -> Buffer`.
 * Regular files only; directories, symlinks and pax headers are skipped.
 * @param {Buffer} targz
 * @returns {Map<string, Buffer>}
 */
export function readTarGz(targz) {
  const bytes = gunzipSync(targz);
  const files = new Map();
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break; // end-of-archive block
    const name = field(header, 0, 100);
    const prefix = field(header, 345, 155); // ustar long-name prefix
    const path = prefix ? `${prefix}/${name}` : name;
    const size = parseInt(field(header, 124, 12) || '0', 8);
    const type = String.fromCharCode(header[156] || 0x30);
    const dataStart = offset + 512;
    if (type === '0' && name) files.set(path, Buffer.from(bytes.subarray(dataStart, dataStart + size)));
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return files;
}

/** Download `https://registry.npmjs.org/<name>/-/<name>-<version>.tgz`. */
export async function fetchTarball(name, version, { timeoutMs = 120_000, registry = REGISTRY } = {}) {
  const url = `${registry}/${name.replace('/', '%2f')}/-/${name.split('/').pop()}-${version}.tgz`;
  const response = await withTimeout(fetch(url), timeoutMs, `fetch ${url}`);
  if (!response.ok) throw new Error(`registry answered ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Pull specific files out of a published package.
 * @param {string} name package name, e.g. "three"
 * @param {string} version exact version
 * @param {string[]} wanted paths inside the package, e.g. ["build/three.module.js", "LICENSE"]
 * @returns {Promise<Map<string, Buffer>>} keyed by the requested path
 */
export async function fetchPackageFiles(name, version, wanted, options = {}) {
  const tarball = await fetchTarball(name, version, options);
  const entries = readTarGz(tarball);
  const found = new Map();
  for (const path of wanted) {
    const buffer = entries.get(path) ?? entries.get(`package/${path}`);
    if (!buffer) {
      const sample = Array.from(entries.keys()).filter((key) => key.includes('/build/')).slice(0, 8).join(', ');
      throw new Error(`${name}@${version} has no "${path}" (build dir holds: ${sample || 'nothing'})`);
    }
    found.set(path, buffer);
  }
  return found;
}

/** sha256 hex digest - the unit the vendor manifest records provenance in. */
export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
