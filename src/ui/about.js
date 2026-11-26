/**
 * About dialog: where this comes from, what it costs you, and what it is built on.
 *
 * Layer: L5 (UI adapter). Three facts belong here and nowhere else in the interface:
 * the repository the code lives in, the licence it ships under, and the fact that the
 * picture you are looking at is three.js - which is MIT-licensed and asks, in exchange
 * for using it, that its copyright notice and licence text travel with the software.
 * They do travel with it, in `vendor/three/` alongside the bundle the page actually
 * runs; the dialog names that directory and renders the text from the file, so the
 * notice in the browser can never drift away from the notice in the repository.
 *
 * Nothing here is app state: an open dialog is not a property of the simulation, so it
 * is not in `app/state.js`, not in a patch, and not in the URL. The `ABOUT` data is
 * exported separately from the DOM builder so that a Node test can check the claims
 * (a URL, a licence id, paths that exist) without a document to build into.
 */

import { APP, PATHS } from '../config.js';

const ABOUT = Object.freeze({
  /** Public web address of the source, not the SSH remote someone would push to. */
  repoUrl: 'https://github.com/kulminaator/antennaro',
  licence: 'MIT',
  /** Licence of *this* simulator, relative to the page. */
  licencePath: 'LICENSE',
  copyright: '© 2026 martin roos',
  /** three.js keeps its own notice next to the bundle this page imports. */
  threeCopyright: '© 2010-2026 three.js authors',
  threeUpstream: 'https://threejs.org',
});

/**
 * The claims the dialog makes, as plain data. Pure, so a test can hold them to the
 * repository they describe.
 */
export function aboutFacts() {
  return Object.freeze({
    version: APP.version,
    repoUrl: ABOUT.repoUrl,
    licence: ABOUT.licence,
    licencePath: ABOUT.licencePath,
    copyright: ABOUT.copyright,
    three: Object.freeze({
      copyright: ABOUT.threeCopyright,
      upstream: ABOUT.threeUpstream,
      /** Where the vendored bundle, its licence text and its provenance live. */
      dir: PATHS.vendor,
      licencePath: `${PATHS.vendor}/LICENSE.txt`,
      noticePath: `${PATHS.vendor}/NOTICE.md`,
      manifestPath: `${PATHS.vendor}/manifest.json`,
    }),
  });
}

/** `0.187.0` is release 187; three.js itself quotes the short form. Exported so a test
    can hold the dialog's "rNNN" to the same manifest the dialog reads. */
export function releaseTag(version) {
  const parts = String(version).split('.');
  const minor = Number(parts[1]);
  return Number.isFinite(minor) && minor > 0 ? `r${minor}` : `v${version}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(text, href, external = true) {
  const node = el('a', null, text);
  node.href = href;
  if (external) {
    node.target = '_blank';
    node.rel = 'noopener';
  }
  return node;
}

/** A labelled line of the dialog's definition list. */
function row(term, nodes) {
  const pair = el('div', 'about-row');
  pair.appendChild(el('dt', null, term));
  const value = el('dd');
  for (const node of nodes) {
    value.appendChild(typeof node === 'string' ? document.createTextNode(node) : node);
  }
  pair.appendChild(value);
  return pair;
}

/**
 * Build the trigger button and the dialog.
 *
 * @param {{mount?:Node}} options `mount` is where the dialog is inserted; the trigger
 *   is returned unbuilt-in so the caller decides where the button lives.
 * @returns {{trigger:HTMLButtonElement, open:()=>void, close:()=>void,
 *   info:()=>{open:boolean, threeVersion:string}, dispose:()=>void}}
 */
export function createAbout(options = {}) {
  const facts = aboutFacts();
  const mount = options.mount ?? document.body;
  let threeVersion = '';
  let licenceRequested = false;

  const trigger = el('button', 'btn btn-ghost');
  trigger.type = 'button';
  trigger.dataset.action = 'about';
  trigger.textContent = 'About';
  trigger.title = 'Source, licence and third-party notices';

  const dialog = el('dialog', 'about');
  dialog.dataset.key = 'about';
  dialog.setAttribute('aria-label', 'About this simulator');

  const threeLine = el('dd', 'about-three');
  const licenceBody = el('div', 'about-licence');
  const licenceDetails = el('details', 'about-details');

  // Not "About <product>": the product is named by the page this dialog sits on, and a
  // second copy of that title in here is a second truth.
  dialog.appendChild(el('h2', null, 'About this simulator'));
  const versionLine = el('p', 'about-version',
    `Version ${facts.version} - a static-page radio study tool: no account, no telemetry, `
    + 'no CDN, no build step, no dependency that is not in the repository you downloaded.');
  dialog.appendChild(versionLine);

  const list = el('dl', 'about-list');
  list.appendChild(row('Source', [link(facts.repoUrl, facts.repoUrl)]));
  list.appendChild(row('Licence', [
    el('span', null, `${facts.licence} - full text in `),
    link(facts.licencePath, facts.licencePath, false),
    el('span', null, `, ${facts.copyright}.`),
  ]));
  threeLine.appendChild(el('span', null,
    'three.js (MIT), vendored rather than downloaded - see the notice below.'));
  list.appendChild(row('Built with', [threeLine]));
  list.appendChild(row('Third-party notice', [
    el('span', null, `${facts.three.copyright} - vendored into this page as one audited file under `),
    link(`${facts.three.dir}/`, `${facts.three.dir}/`, false),
    el('span', null, ', with its licence text and provenance: '),
    link('LICENSE.txt', facts.three.licencePath, false),
    el('span', null, ', '),
    link('NOTICE.md', facts.three.noticePath, false),
    el('span', null, '. Upstream: '),
    link('threejs.org', facts.three.upstream),
    el('span', null, '.'),
  ]));
  dialog.appendChild(list);

  licenceDetails.appendChild(el('summary', null, `three.js licence (${facts.licence})`));
  licenceDetails.appendChild(licenceBody);
  dialog.appendChild(licenceDetails);

  const close = el('button', 'btn', 'Close');
  close.type = 'button';
  // Where the dialog puts its focus, and so where Enter and Escape both land: on the way
  // out, not on the first link, which would otherwise open the repository by accident.
  close.autofocus = true;
  close.dataset.action = 'about-close';
  close.addEventListener('click', () => dialog.close());
  const foot = el('div', 'about-foot');
  foot.appendChild(close);
  dialog.appendChild(foot);

  /**
   * Say which build of three.js this page is running, and show the notice that has to
   * travel with it. Both come from the repository - the manifest that `tools/vendor.js`
   * writes, and the licence file that came out of the package - because retyping either
   * here would be a second truth, and second truths go stale.
   */
  async function readProvenance() {
    try {
      const [manifest, licence] = await Promise.all([
        fetch(facts.three.manifestPath, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)),
        fetch(facts.three.licencePath, { cache: 'no-cache' }).then((r) => (r.ok ? r.text() : null)),
      ]);
      if (manifest?.version) {
        threeVersion = String(manifest.version);
        threeLine.textContent = `three.js ${releaseTag(threeVersion)} (${threeVersion}), MIT licensed.`;
      }
      if (licence) licenceBody.replaceChildren(el('pre', null, licence.trim()));
    } catch {
      // Offline, or served from somewhere the paths do not resolve: the dialog still
      // names the licence and links to where it lives, which is the whole point of it.
    }
  }

  /** Opening is the only moment the provenance is worth reading, whoever asks for it. */
  function show() {
    if (!licenceRequested) {
      licenceRequested = true;
      void readProvenance();
    }
    dialog.showModal();
  }

  trigger.addEventListener('click', show);
  // A click outside the panel lands on the dialog element itself, not on its children.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  mount.appendChild(dialog);

  return {
    trigger,
    open: show,
    close: () => {
      if (dialog.open) dialog.close();
    },
    info: () => ({ open: dialog.open, threeVersion }),
    dispose: () => {
      dialog.remove();
      trigger.remove();
    },
  };
}
