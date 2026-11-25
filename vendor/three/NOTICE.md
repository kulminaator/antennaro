# Vendored three.js

| | |
| --- | --- |
| Package | `three@0.187.0` |
| Upstream | https://threejs.org , https://www.npmjs.com/package/three/v/0.187.0 |
| License | MIT - full text in [`LICENSE.txt`](LICENSE.txt) |
| Copyright | (c) 2010-2026 three.js authors |
| Shipped file | [`three.module.min.js`](three.module.min.js) (732 KiB, sha256 `9f2d0c0657a75f4ddf9db1bffd9dc0bfcfe54aff890affc31826295e5e2790d4`) |
| Built with | `npx --yes esbuild@0.28.2 build/three.module.js --bundle --format=esm --minify --legal-comments=none --target=es2020` |
| Built at | 2026-11-25T14:28:49.495Z |

## Why a bundle instead of a dependency

The application is static files. Anyone who clones this repository can serve it
with `python3 -m http.server` or push it to GitHub Pages; there is no install
step, no bundler and no CDN, so the exact bytes the browser runs have to be in
the repository.

## What was built, from what

`three.module.min.js` is the published ESM entry (`build/three.module.js` plus the
`build/three.core.js` it imports) bundled into one module and minified. Nothing
was added, removed or patched. The upstream hashes pin exactly which published
bytes went in:

| upstream file | bytes | sha256 |
| --- | --- | --- |
| `build/three.module.js` | 658900 | `104f56145899722094556490d787aae0617cc2fc3382f31df02d724ea1aee341` |
| `build/three.core.js` | 1474799 | `613e370f76638fdef83926642bf256dc9615684922de1ce1f63a8583e5d78578` |

The published package contains no minified ESM build, which is why this step
exists. `node tools/vendor.js check` (also run by `npm run lint`) verifies the
shipped bytes against `manifest.json`.

## Reproducing

```bash
node tools/vendor.js bundle --version 0.187.0   # needs network
node tools/vendor.js check
```

The minifier is fetched with `npx --yes` at build time; it is deliberately not a
dependency of this project, and its version is recorded above.
