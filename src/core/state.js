// src/core/state.js
//
// App-wide state container and event bus.
//
// What this is: a tiny singleton that holds shared state (currently
// selected country, active layers, UI mode flags) and lets any module
// subscribe to changes without depending on any other module directly.
//
// Why it exists: instead of layers and panels reading each other's
// internals, they read and write through this single channel. That keeps
// the lego-block boundaries clean — no module needs to know which other
// modules exist.
//
// In Section 1 the state is mostly empty. As we add country clicks
// (Section 2), layers (Section 5+), and timelines (Section 8), they will
// all flow through here.

/**
 * The state object. Mutate only via `setState`, which fires events.
 * Read directly via `getState`.
 */
const state = {
  // ISO 3166-1 alpha-2 code of the country whose panel is open, or null.
  // Populated in Section 2.
  selectedCountry: null,

  // Set of currently-active layer IDs. Populated in Section 5+.
  activeLayers: new Set(),

  // Whether the contested-entities toggle is on. See ARCHITECTURE.md
  // border policy.
  showContestedEntities: false,

  // Whether the AI panel reports Ollama as reachable. Populated by
  // src/ai/ollama.js when it pings the local instance.
  aiAvailable: false,
};

/** Subscriptions, keyed by event name. */
const listeners = new Map();

/**
 * Read a snapshot of current state. Treat the returned object as
 * read-only — call setState to change anything.
 *
 * @returns {object} Shallow copy of state.
 */
export function getState() {
  return { ...state };
}

/**
 * Update state and notify subscribers.
 *
 * Each top-level key changed fires an event named after that key. So
 * setState({ selectedCountry: "DE" }) fires a "selectedCountry" event.
 *
 * @param {object} patch - Keys to update on the state object.
 */
export function setState(patch) {
  for (const key of Object.keys(patch)) {
    state[key] = patch[key];
    emit(key, state[key]);
  }
}

/**
 * Subscribe to state changes. Returns an unsubscribe function.
 *
 * @param {string} event - The state key to watch (e.g. "selectedCountry").
 * @param {(value: any) => void} handler - Called with the new value.
 * @returns {() => void} Call to unsubscribe.
 */
export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

/** Internal: fire an event to all subscribers. */
function emit(event, value) {
  const set = listeners.get(event);
  if (!set) return;
  for (const handler of set) {
    try {
      handler(value);
    } catch (err) {
      // A buggy listener should not break the publisher or other listeners.
      console.error(`[state] handler for "${event}" threw:`, err);
    }
  }
}
