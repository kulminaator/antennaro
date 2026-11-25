/**
 * Minimal synchronous publish/subscribe bus.
 *
 * Layer: L1 (framework-free). Modules talk to each other through named events
 * rather than reaching into one another's internals.
 */

export function createEventBus() {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();

  function on(type, handler) {
    if (typeof handler !== 'function') throw new TypeError('event handler must be a function');
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(handler);
    return function off() {
      const set = listeners.get(type);
      if (set) set.delete(handler);
    };
  }

  function once(type, handler) {
    const wrapped = (payload) => {
      off();
      handler(payload);
    };
    const off = on(type, wrapped);
    return off;
  }

  function emit(type, payload) {
    const set = listeners.get(type);
    if (!set || set.size === 0) return 0;
    // Snapshot so handlers may unsubscribe while being notified.
    for (const handler of Array.from(set)) handler(payload);
    return set.size;
  }

  function listenerCount(type) {
    const set = listeners.get(type);
    return set ? set.size : 0;
  }

  function clear() {
    listeners.clear();
  }

  return { on, once, emit, listenerCount, clear };
}

/** Canonical event names. Add new ones here, never inline string literals. */
export const EVENTS = Object.freeze({
  STATE_CHANGED: 'state:changed',
  TERRAIN_REBUILT: 'terrain:rebuilt',
  ANTENNA_REBUILT: 'antenna:rebuilt',
  COVERAGE_READY: 'coverage:ready',
  VIEW_INVALIDATED: 'view:invalidated',
  FRAME: 'frame',
  ERROR: 'app:error',
});
