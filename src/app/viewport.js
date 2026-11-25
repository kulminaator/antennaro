/**
 * Renderer, scene, camera and lights.
 *
 * Layer: L4 (render adapter). Owns the WebGL context and nothing else: no
 * antennas, no terrain, no state. Everything else is added to `world`.
 */

import * as THREE from 'three';
import { VIEW } from '../config.js';
import { fromCompass } from '../math/vec3.js';

const DEFAULT_STATE = Object.freeze({
  azimuthDeg: VIEW.cameraStart.azimuthDeg,
  elevationDeg: VIEW.cameraStart.elevationDeg,
  distance: VIEW.cameraStart.distance,
  targetX: 0,
  targetY: 0,
  targetZ: 0,
});

/**
 * @param {{canvas:HTMLCanvasElement, preserveDrawingBuffer?:boolean, antialias?:boolean}} options
 */
export function createViewport(options) {
  const { canvas } = options;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: options.antialias ?? true,
    // Keeping the back buffer makes canvas.toDataURL() (the "Save PNG" button)
    // and headless pixel assertions possible. Costs a little bandwidth.
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
  renderer.setClearColor(VIEW.background, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(VIEW.background);
  scene.fog = new THREE.Fog(VIEW.fogColour, VIEW.fogNear, VIEW.fogFar);

  const camera = new THREE.PerspectiveCamera(VIEW.cameraFovDeg, 1, 1, 20000);
  const world = new THREE.Group();
  world.name = 'world';
  scene.add(world);

  const sunDirection = fromCompass(VIEW.sunAzimuthDeg, VIEW.sunElevationDeg, 1);
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.1);
  sun.position.set(sunDirection.x * 2000, sunDirection.y * 2000, sunDirection.z * 2000);
  scene.add(sun);
  const sky = new THREE.HemisphereLight(0xbcd7ff, 0x2a2f28, 1.05);
  scene.add(sky);

  let state = { ...DEFAULT_STATE };
  let frameCount = 0;

  function applyCamera() {
    const offset = fromCompass(state.azimuthDeg, state.elevationDeg, state.distance);
    camera.position.set(state.targetX + offset.x, state.targetY + offset.y, state.targetZ + offset.z);
    camera.lookAt(state.targetX, state.targetY, state.targetZ);
    camera.updateMatrixWorld();
  }

  /** Match the drawing buffer to the CSS size; returns true if it changed. */
  function resize() {
    const width = Math.max(1, canvas.clientWidth || canvas.width || 1);
    const height = Math.max(1, canvas.clientHeight || canvas.height || 1);
    const expectedWidth = Math.floor(width * renderer.getPixelRatio());
    const expectedHeight = Math.floor(height * renderer.getPixelRatio());
    if (renderer.domElement.width === expectedWidth && renderer.domElement.height === expectedHeight) {
      return false;
    }
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    return true;
  }

  function render() {
    applyCamera();
    renderer.render(scene, camera);
    frameCount += 1;
    return frameCount;
  }

  function setCamera(patch = {}) {
    state = { ...state, ...patch };
    applyCamera();
  }

  function cameraState() {
    return { ...state };
  }

  /**
   * Back to the start view. `center` overrides the look-at point, so a view can
   * be recentred on a relocated site; without it the map centre is used.
   */
  function resetCamera(center = {}) {
    state = {
      ...DEFAULT_STATE,
      targetX: Number.isFinite(center.x) ? center.x : DEFAULT_STATE.targetX,
      targetY: Number.isFinite(center.y) ? center.y : DEFAULT_STATE.targetY,
      targetZ: Number.isFinite(center.z) ? center.z : DEFAULT_STATE.targetZ,
    };
    applyCamera();
  }

  function add(object) {
    world.add(object);
    return object;
  }

  function remove(object) {
    world.remove(object);
    return object;
  }

  function info() {
    return {
      frameCount,
      width: renderer.domElement.width,
      height: renderer.domElement.height,
      drawingBufferWidth: renderer.getContext().drawingBufferWidth,
      drawingBufferHeight: renderer.getContext().drawingBufferHeight,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      pixelRatio: renderer.getPixelRatio(),
      webgl2: renderer.capabilities.isWebGL2 === true,
      contextLost: renderer.getContext().isContextLost(),
    };
  }

  function dispose() {
    renderer.dispose();
  }

  resize();
  applyCamera();

  return {
    renderer,
    scene,
    world,
    camera,
    sun,
    resize,
    render,
    setCamera,
    cameraState,
    resetCamera,
    add,
    remove,
    info,
    dispose,
  };
}
