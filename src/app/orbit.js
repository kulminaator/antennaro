/**
 * Minimal orbit camera controls (drag to orbit, wheel to zoom, right-drag or
 * shift-drag to pan, arrow keys to nudge).
 *
 * Layer: L4 (render adapter). Written from scratch on purpose: the project keeps
 * three.js as its only dependency, and camera control is ~100 lines of maths.
 * All the maths lives in the viewport's spherical camera state, so this module
 * only translates input events into changes of that state.
 *
 * An optional `intercept` gate lets another pointer tool (see `app/relocate.js`)
 * claim a gesture first: orbit asks it once per `pointerdown`, before it touches
 * any state, and when the gate answers true orbit ignores the event entirely - no
 * pointer capture, no dragging flag, no `preventDefault`.
 */

import { VIEW } from '../config.js';
import { clamp } from '../math/scalar.js';
import { wrapDeg360 } from '../math/scalar.js';

const ORBIT_SPEED = 0.28; // degrees per pixel
const PAN_FACTOR = 0.0016; // target units per pixel, scaled by camera distance
const ZOOM_FACTOR = 0.0016;
const KEY_STEP = 6;

/**
 * @param {{domElement:HTMLElement, viewport:ReturnType<import('./viewport.js').createViewport>,
 *   limits?:{minDistance?:number,maxDistance?:number,minElevationDeg?:number,maxElevationDeg?:number},
 *   intercept?:(event:Event)=>boolean}} options
 * @returns {{dispose:()=>void, state:()=>object, enabled:(value:boolean)=>void}}
 */
export function createOrbitControls(options) {
  const { domElement, viewport } = options;
  const limits = {
    minDistance: VIEW.cameraLimits.minDistance,
    maxDistance: VIEW.cameraLimits.maxDistance,
    minElevationDeg: VIEW.cameraLimits.minElevationDeg,
    maxElevationDeg: VIEW.cameraLimits.maxElevationDeg,
    ...options.limits,
  };
  /** Asked once per pointerdown: true means another tool owns that gesture. */
  const intercept = options.intercept ?? (() => false);

  let dragging = false;
  let panning = false;
  let lastX = 0;
  let lastY = 0;
  let active = true;

  function apply(patch) {
    const current = viewport.cameraState();
    const next = { ...current, ...patch };
    next.azimuthDeg = wrapDeg360(next.azimuthDeg);
    next.elevationDeg = clamp(next.elevationDeg, limits.minElevationDeg, limits.maxElevationDeg);
    next.distance = clamp(next.distance, limits.minDistance, limits.maxDistance);
    viewport.setCamera(next);
  }

  function onPointerDown(event) {
    if (!active || intercept(event)) return;
    dragging = true;
    panning = event.button === 2 || event.shiftKey;
    lastX = event.clientX;
    lastY = event.clientY;
    domElement.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!dragging || !active) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    const state = viewport.cameraState();
    if (panning) {
      const step = state.distance * PAN_FACTOR;
      const rad = (state.azimuthDeg * Math.PI) / 180;
      // Camera right and "forward on the ground" vectors, derived from azimuth.
      const rightX = Math.cos(rad);
      const rightZ = Math.sin(rad);
      const fwdX = -Math.sin(rad);
      const fwdZ = -Math.cos(rad);
      apply({
        targetX: state.targetX - rightX * dx * step - fwdX * dy * step,
        targetZ: state.targetZ - rightZ * dx * step - fwdZ * dy * step,
      });
    } else {
      apply({
        azimuthDeg: state.azimuthDeg - dx * ORBIT_SPEED,
        elevationDeg: state.elevationDeg + dy * ORBIT_SPEED,
      });
    }
  }

  function onPointerUp(event) {
    const wasDragging = dragging;
    dragging = false;
    panning = false;
    // Only release a capture orbit actually took. A pointerdown that `intercept`
    // claimed never captured, and releasing a pointer we never grabbed throws a
    // NotFoundError in the page.
    if (wasDragging) domElement.releasePointerCapture?.(event.pointerId);
  }

  function onWheel(event) {
    if (!active) return;
    event.preventDefault();
    const state = viewport.cameraState();
    const factor = Math.exp(event.deltaY * ZOOM_FACTOR);
    apply({ distance: state.distance * factor });
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  function onKeyDown(event) {
    if (!active) return;
    const state = viewport.cameraState();
    switch (event.key) {
      case 'ArrowLeft':
        apply({ azimuthDeg: state.azimuthDeg - KEY_STEP });
        break;
      case 'ArrowRight':
        apply({ azimuthDeg: state.azimuthDeg + KEY_STEP });
        break;
      case 'ArrowUp':
        apply({ elevationDeg: state.elevationDeg + KEY_STEP });
        break;
      case 'ArrowDown':
        apply({ elevationDeg: state.elevationDeg - KEY_STEP });
        break;
      case '+':
      case '=':
        apply({ distance: state.distance * 0.85 });
        break;
      case '-':
      case '_':
        apply({ distance: state.distance * 1.18 });
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointercancel', onPointerUp);
  domElement.addEventListener('wheel', onWheel, { passive: false });
  domElement.addEventListener('contextmenu', onContextMenu);
  globalThis.addEventListener('keydown', onKeyDown);

  function dispose() {
    domElement.removeEventListener('pointerdown', onPointerDown);
    domElement.removeEventListener('pointermove', onPointerMove);
    domElement.removeEventListener('pointerup', onPointerUp);
    domElement.removeEventListener('pointercancel', onPointerUp);
    domElement.removeEventListener('wheel', onWheel);
    domElement.removeEventListener('contextmenu', onContextMenu);
    globalThis.removeEventListener('keydown', onKeyDown);
  }

  return {
    dispose,
    state: () => viewport.cameraState(),
    enabled: (value) => {
      active = Boolean(value);
    },
  };
}
