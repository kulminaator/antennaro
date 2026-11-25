/**
 * Frame loop with FPS accounting and a manual step mode.
 *
 * Layer: L3 (browser adapter). Nothing here knows about antennas or terrain; it
 * calls back once per animation frame and reports timing so the controller can
 * budget expensive work such as a coverage recompute. Whether a frame actually
 * renders is the controller's decision (dirty flag).
 */

/**
 * @param {{onFrame:(info:{deltaMs:number, elapsedMs:number})=>void, autoStart?:boolean}} options
 * @returns {{start:()=>void, stop:()=>void, isRunning:()=>boolean,
 *   step:(n?:number)=>void,
 *   stats:()=>{status:'active'|'stopped', frames:number, fps:number, lastFrameMs:number, renderCalls:number},
 *   noteRender:()=>number}}
 */
export function createFrameLoop(options) {
  const { onFrame, autoStart = true } = options;
  let handle = 0;
  let running = false;
  let frames = 0;
  let renderCalls = 0;
  let lastTime = 0;
  let startTime = 0;
  let lastFrameMs = 0;
  let fpsWindowStart = 0;
  let fpsWindowFrames = 0;
  let fps = 0;

  function tick(now) {
    if (!running) return;
    handle = requestAnimationFrame(tick);
    runOnce(now);
  }

  function runOnce(now) {
    const time = Number.isFinite(now) ? now : performance.now();
    if (startTime === 0) {
      startTime = time;
      fpsWindowStart = time;
    }
    const deltaMs = lastTime === 0 ? 0 : time - lastTime;
    lastTime = time;
    lastFrameMs = deltaMs;
    frames += 1;
    fpsWindowFrames += 1;
    if (time - fpsWindowStart >= 500) {
      fps = (1000 * fpsWindowFrames) / (time - fpsWindowStart);
      fpsWindowStart = time;
      fpsWindowFrames = 0;
    }
    onFrame({ deltaMs, elapsedMs: time - startTime });
  }

  function start() {
    if (running) return;
    running = true;
    handle = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (handle) cancelAnimationFrame(handle);
    handle = 0;
  }

  /** Advance the loop by n frames without requestAnimationFrame (tests, headless). */
  function step(n = 1) {
    for (let i = 0; i < n; i += 1) runOnce(performance.now());
  }

  function stats() {
    return { status: running ? 'active' : 'stopped', frames, fps, lastFrameMs, renderCalls };
  }

  if (autoStart) start();

  return { start, stop, step, stats, noteRender: () => (renderCalls += 1), isRunning: () => running };
}
