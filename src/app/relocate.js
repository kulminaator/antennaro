/**
 * Relocate the antenna by dragging it across the map.
 *
 * Layer: L4 (render adapter). *Translate pointer gestures into site
 * relocations.* It owns no state and mutates nothing: it reads the camera and the
 * current site, works out where on the ground the pointer is, and hands the
 * controller a `{x, z}` for it to patch. The camera keeps doing what the state
 * says - even while you drag.
 *
 * `intercept(event)` is the gate `createOrbitControls` asks before it takes a
 * gesture. It is not a passive question: when it answers true it has already
 * claimed the pointer and started the drag, so orbit must stand down for the whole
 * gesture. Hover and commit handling live here, in `pointermove`/`pointerup`
 * listeners of our own, because orbit ignores a gesture we claimed.
 *
 * The drag slides the site along the horizontal plane at its own foot height - the
 * same plane `window.__sim.pick()` reports, so a test and a mouse agree.
 */

import { cameraPose, pickGround, projectToNdc } from './pick.js';

/** How close to the mast (CSS pixels) a pointer has to be to be "holding" it. */
const GRAB_RADIUS_PX = 26;
/**
 * Longest stretch of pointer events to ignore while dragging. A relocation
 * regenerates the height field and the coverage grid (~100 ms for both), so
 * committing every `pointermove` would only drop frames.
 */
const COMMIT_INTERVAL_MS = 120;

/**
 * @param {{domElement:HTMLElement, viewport:object, getSite:()=>object,
 *   onMove:(point:{x:number, z:number})=>void, now?:()=>number}} options
 */
export function createSiteRelocator(options) {
  const { domElement, viewport, getSite, onMove } = options;
  const now = options.now ?? (() => globalThis.performance?.now?.() ?? Date.now());

  let active = false;
  let planeY = 0;
  let lastCommitMs = 0;
  /** @type {{x:number, z:number}|null} */
  let last = null;

  function pose() {
    const camera = viewport.camera;
    return cameraPose({ ...viewport.cameraState(), fovDeg: camera.fov, aspect: camera.aspect });
  }

  function rect() {
    return domElement.getBoundingClientRect();
  }

  /** Pointer event -> normalised device coordinates (x right, y up). */
  function pointerNdc(event, box) {
    const boxRect = box ?? rect();
    return {
      ndcX: ((event.clientX - boxRect.left) / boxRect.width) * 2 - 1,
      ndcY: -(((event.clientY - boxRect.top) / boxRect.height) * 2 - 1),
    };
  }

  /** The hardware a pointer can grab: the phase centre and the foot of the mast. */
  function grabPoints() {
    const site = getSite();
    return [{ x: site.x, y: site.y, z: site.z }, { x: site.x, y: site.groundY, z: site.z }];
  }

  /** Is the pointer close enough to the drawn hardware to count as a grab? */
  function nearSite(event) {
    const box = rect();
    if (box.width <= 0 || box.height <= 0) return false;
    const current = pose();
    for (const point of grabPoints()) {
      const ndc = projectToNdc(current, point);
      if (!(ndc.depth > 0)) continue;
      const px = (ndc.ndcX * 0.5 + 0.5) * box.width;
      const py = (1 - (ndc.ndcY * 0.5 + 0.5)) * box.height;
      const dx = event.clientX - box.left - px;
      const dy = event.clientY - box.top - py;
      if (Math.hypot(dx, dy) <= GRAB_RADIUS_PX) return true;
    }
    return false;
  }

  /** Commit a position, at most once per COMMIT_INTERVAL_MS unless forced. */
  function commit(x, z, force) {
    if (!force && now() - lastCommitMs < COMMIT_INTERVAL_MS) return false;
    lastCommitMs = now();
    last = { x, z };
    onMove({ x, z });
    return true;
  }

  function begin() {
    active = true;
    planeY = getSite().groundY;
    domElement.style.cursor = 'grabbing';
  }

  /** Gate handed to the orbit controls: claims the gesture when it says true. */
  function intercept(event) {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
    if (!nearSite(event)) return false;
    begin();
    return true;
  }

  function onPointerMove(event) {
    if (active) {
      const { ndcX, ndcY } = pointerNdc(event);
      const point = pickGround(pose(), ndcX, ndcY, planeY);
      if (point) commit(point.x, point.z, false);
      return;
    }
    domElement.style.cursor = nearSite(event) ? 'grab' : '';
  }

  function onPointerUp(event) {
    if (!active) return;
    const { ndcX, ndcY } = pointerNdc(event);
    const point = pickGround(pose(), ndcX, ndcY, planeY);
    // The last position must land even if the throttle is still closed, otherwise
    // the antenna would stop short of where the pointer was released.
    if (point) commit(point.x, point.z, true);
    active = false;
    domElement.style.cursor = '';
  }

  /** Programmatic grab (the pointer sits on the mast), for the test surface. */
  function beginAtSite() {
    begin();
    return { ok: true, planeY };
  }

  /** Programmatic drag to a pointer position in NDC. Commits immediately. */
  function dragToNdc(ndcX, ndcY) {
    if (!active) begin();
    const point = pickGround(pose(), ndcX, ndcY, planeY);
    if (!point) return { ok: false, reason: 'not on the ground', active };
    commit(point.x, point.z, true);
    return { ok: true, x: point.x, z: point.z, active };
  }

  function release() {
    active = false;
    domElement.style.cursor = '';
    return { ok: true, active };
  }

  function state() {
    return { active, hovering: false, planeY, last };
  }

  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointercancel', onPointerUp);

  function dispose() {
    domElement.removeEventListener('pointermove', onPointerMove);
    domElement.removeEventListener('pointerup', onPointerUp);
    domElement.removeEventListener('pointercancel', onPointerUp);
    domElement.style.cursor = '';
    active = false;
  }

  return { intercept, beginAtSite, dragToNdc, release, state, dispose };
}
