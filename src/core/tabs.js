// src/core/tabs.js
//
// Reusable tab strip + content area for use inside panel cards.
//
// What this is: a small DOM-construction helper that takes a list of
// tab definitions and returns a single element containing a clickable
// tab strip plus a content area that swaps to the active tab's
// content. Each tab declares an async `load` function called the
// first time the tab is activated; results are cached so switching
// back is instant.
//
// What this is NOT: a heavyweight UI framework. There's no virtual
// DOM, no reactive state, no router integration. Cards that want
// tabs use this; cards that don't want tabs ignore it. It deliberately
// reads as ~80 lines so the behavior is easy to audit when something
// inside it surprises you.
//
// Lifecycle of one tab:
//   - First activation: `load()` is called. Loading message shown
//     until it resolves. Result is cached.
//   - Subsequent activations: cached node swapped in instantly.
//   - load() returning null: an "empty" message is shown and cached.
//   - load() throwing: an "error" message is shown and cached.
//
// Switching tabs while one is loading is safe: when the slow load
// resolves we check whether its tab is still the active one before
// updating the content area. Stale loads silently no-op into the
// cache.

/**
 * @typedef {object} TabDefinition
 * @property {string} id - Stable identifier; used internally and as
 *     the data-tab-id attribute on the button.
 * @property {string} label - Visible button text.
 * @property {() => (HTMLElement | null | Promise<HTMLElement | null>)} load
 *     - Called the first time the tab is activated. May return a
 *       DOM node directly, a Promise of one, or null/Promise<null>
 *       to display an empty state.
 */

/**
 * Build a tabbed control.
 *
 * @param {Array<TabDefinition>} tabs - One entry per tab. Display
 *     order matches array order.
 * @param {object} [options]
 * @param {string} [options.defaultTab] - id of the tab to activate
 *     on creation. Defaults to the first tab.
 * @returns {HTMLElement} A single DOM element to insert into a card.
 */
export function createTabs(tabs, options = {}) {
  const defaultTabId = options.defaultTab ?? tabs[0]?.id;

  const root = document.createElement("div");
  root.className = "panel-card-tabs-root";

  const strip = document.createElement("div");
  strip.className = "panel-card-tabs";
  strip.setAttribute("role", "tablist");

  const content = document.createElement("div");
  content.className = "panel-card-tab-content";

  // Cache of resolved tab content, keyed by tab id. Each entry is a
  // DOM node ready to be inserted. Loading/empty/error states are
  // also cached as their own nodes so the second visit shows the
  // same outcome instantly without a re-fetch.
  const cache = new Map();

  // Build tab buttons.
  for (const tab of tabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "panel-card-tab";
    btn.dataset.tabId = tab.id;
    btn.setAttribute("role", "tab");
    btn.textContent = tab.label;
    btn.addEventListener("click", () => activate(tab.id));
    strip.appendChild(btn);
  }

  /**
   * Activate a tab by id. Updates the active class on tab buttons,
   * then swaps the content area to the tab's content (loading it
   * the first time).
   */
  function activate(tabId) {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    // Visual state on buttons.
    strip.querySelectorAll(".panel-card-tab").forEach((btn) => {
      const active = btn.dataset.tabId === tabId;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (cache.has(tabId)) {
      content.replaceChildren(cache.get(tabId));
      return;
    }

    // First activation — show loading and run the tab's load.
    const loading = document.createElement("div");
    loading.className = "card-loading";
    loading.textContent = "Loading…";
    content.replaceChildren(loading);

    const isStillActive = () =>
      strip.querySelector(
        `.panel-card-tab[data-tab-id="${tabId}"]`
      )?.classList.contains("is-active");

    Promise.resolve()
      .then(() => tab.load())
      .then((node) => {
        const result = node ?? makeEmpty(tab.label);
        cache.set(tabId, result);
        if (isStillActive()) content.replaceChildren(result);
      })
      .catch((err) => {
        console.error(`[tabs] tab "${tabId}" load failed:`, err);
        const errEl = makeError(err.message);
        cache.set(tabId, errEl);
        if (isStillActive()) content.replaceChildren(errEl);
      });
  }

  root.appendChild(strip);
  root.appendChild(content);

  if (defaultTabId) activate(defaultTabId);

  return root;
}

/** Default empty state when a tab's load resolves to null. */
function makeEmpty(label) {
  const el = document.createElement("div");
  el.className = "card-empty";
  el.textContent = `No ${label.toLowerCase()} content available.`;
  return el;
}

/** Default error state. */
function makeError(message) {
  const el = document.createElement("div");
  el.className = "card-error";
  el.textContent = `Failed to load: ${message}`;
  return el;
}
