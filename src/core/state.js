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
 *
 * Selection invariant: at most one of selectedCountry and
 * selectedRegion is non-null at any given time. Setting one through
 * setSelection() automatically clears the other; setting them
 * directly via setState() is allowed but the caller is responsible
 * for maintaining the invariant. Panels and cards should always read
 * the unified selection via getCurrentSelection() rather than peeking
 * at the two fields directly.
 */
const state = {
  // The GeoJSON feature for the country whose panel is open, or null.
  selectedCountry: null,

  // The selected region object (one entry from regions.json plus the
  // merged geometry produced by map.js), or null.
  selectedRegion: null,

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
 * Updates ALL fields first, then emits ALL events, so handlers
 * always see a consistent state snapshot. Without this two-phase
 * approach, code that updates multiple fields in one call (e.g.
 * setSelection swapping country↔region) would briefly expose a
 * mid-update state to the first handler in the loop.
 *
 * @param {object} patch - Keys to update on the state object.
 */
export function setState(patch) {
  const keys = Object.keys(patch);
  for (const key of keys) {
    state[key] = patch[key];
  }
  for (const key of keys) {
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

/**
 * Set the active selection (country or region) while maintaining the
 * mutual-exclusion invariant. Setting a country clears any selected
 * region; setting a region clears any selected country; setting null
 * clears both.
 *
 * Centralizing this in one helper keeps every caller from having to
 * remember to clear the other field — the invariant is mechanical
 * here rather than enforced by convention everywhere.
 *
 * @param {"country" | "region" | null} kind - What's being selected.
 *     null clears the selection entirely.
 * @param {*} value - The country feature or region object. Ignored
 *     when kind is null.
 */
export function setSelection(kind, value = null) {
  if (kind === "country") {
    setState({ selectedCountry: value, selectedRegion: null });
  } else if (kind === "region") {
    setState({ selectedRegion: value, selectedCountry: null });
  } else {
    setState({ selectedCountry: null, selectedRegion: null });
  }
}

/**
 * Read the current selection in unified, type-tagged form.
 *
 * Panels and cards consume this rather than poking at selectedCountry
 * or selectedRegion directly, so a card's render logic can dispatch
 * cleanly on `selection.kind`.
 *
 * @returns {{kind: "country", feature: object} |
 *           {kind: "region", region: object} |
 *           null}
 */
export function getCurrentSelection() {
  if (state.selectedCountry) {
    return { kind: "country", feature: state.selectedCountry };
  }
  if (state.selectedRegion) {
    return { kind: "region", region: state.selectedRegion };
  }
  return null;
}
