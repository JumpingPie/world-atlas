// src/core/bottom-panel.js
//
// Manages the content of the bottom drawer based on the current
// selection. The drawer's open/closed state is handled in
// index.html's bootstrap (handle clicks, drag-to-expand, auto-
// collapse on selection clear) — this module is concerned only
// with what's rendered *inside* the content area.
//
// For country selections: fetches the timeline (Wikipedia "History
// of [Country]" article parsed into eras), renders the timeline
// visualization. The fetch chains through the existing wikidata-
// stats fetcher to resolve the country's authoritative Wikipedia
// title, which is usually cache-warm because the stats and summary
// cards have already loaded it.
//
// For region selections: shows a placeholder. Regional timelines
// would require their own data design (a region's "history"
// composes member states' histories and shared regional events)
// and isn't a V1 feature.
//
// For null selections: the panel is collapsed entirely by the
// bootstrap script via .is-available, so this module's content
// doesn't render. We still clear the container so a stale timeline
// isn't visible if the panel is reopened later via class toggling.

import { on, getCurrentSelection } from "./state.js";
import { fetchCountryStats } from "../fetchers/wikidata-stats.js";
import { fetchTimeline } from "../fetchers/wikipedia-timeline.js";
import { createTimeline } from "./timeline.js";

/**
 * Initialize the bottom panel content manager. Call once at startup
 * with the panel's content container.
 *
 * @param {HTMLElement} container - The .bottom-panel-content div
 *     inside #bottom-panel. We replace its children on every
 *     selection change.
 */
export function initBottomPanel(container) {
  // We schedule renders through rAF so the two events fired by
  // setSelection (one for selectedCountry, one for selectedRegion)
  // collapse into a single update — same pattern panel.js uses for
  // the right panel.
  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      render(container);
    });
  }

  on("selectedCountry", schedule);
  on("selectedRegion", schedule);

  // Initial render — covers the case where state already has a
  // selection at init time (unlikely today, but cheap).
  render(container);
}

/**
 * Render the appropriate content for the current selection.
 *
 * Each branch sets the container's children synchronously (showing
 * a loading state if data needs fetching) and may update them
 * asynchronously when fetches resolve. We use isConnected on the
 * container's children to detect "user moved on while fetch was in
 * flight" and silently drop stale results.
 */
function render(container) {
  const selection = getCurrentSelection();

  if (!selection) {
    container.replaceChildren(makeStub("Select a country to see its timeline."));
    return;
  }

  if (selection.kind === "region") {
    container.replaceChildren(
      makeStub(
        "Regional timelines are not yet supported. Click a country in the region's member list to see its timeline."
      )
    );
    return;
  }

  // Country selection — fetch and render timeline.
  const country = selection.feature;
  const loading = makeLoading("Loading timeline from Wikipedia…");
  container.replaceChildren(loading);

  fetchCountryStats(country.id)
    .then((stats) => {
      // If the user moved to a different selection while we were
      // fetching, abort silently. The next render() call will have
      // already replaced our placeholder.
      if (!loading.isConnected) return null;

      if (!stats?.wikipediaTitle) {
        container.replaceChildren(
          makeEmpty(
            `No Wikipedia article linked for this country (ISO numeric ${country.id}).`
          )
        );
        return null;
      }
      return fetchTimeline(stats.wikipediaTitle);
    })
    .then((eras) => {
      if (!loading.isConnected && !container.contains(loading)) {
        // Even if loading element was already replaced, if we still
        // have a country selection and our fetched data is for it,
        // we should show the result. But the simpler check is:
        // proceed only if the user hasn't moved on. We approximate
        // that with isConnected on the loading element above.
        return;
      }
      if (eras == null) {
        // Either no Wikipedia title (handled above with explicit
        // empty state) or the timeline fetcher returned null because
        // there's no "History of X" article. Show a different
        // empty state for the latter.
        if (loading.isConnected) {
          container.replaceChildren(
            makeEmpty(
              "No detailed history article found on Wikipedia for this country."
            )
          );
        }
        return;
      }
      container.replaceChildren(createTimeline(eras));
    })
    .catch((err) => {
      console.error("[bottom-panel] timeline fetch failed:", err);
      if (loading.isConnected) {
        container.replaceChildren(
          makeError(`Failed to load timeline: ${err.message}`)
        );
      }
    });
}

/* Tiny DOM-builder helpers. Kept inline because each is a single
 * <div> with a class and some text — extracting them would just
 * mean three more imports for almost no shared logic. */

function makeStub(text) {
  const el = document.createElement("p");
  el.className = "panel-stub";
  el.textContent = text;
  return el;
}

function makeLoading(text) {
  const el = document.createElement("div");
  el.className = "card-loading";
  el.textContent = text;
  return el;
}

function makeEmpty(text) {
  const el = document.createElement("div");
  el.className = "card-empty";
  el.textContent = text;
  return el;
}

function makeError(text) {
  const el = document.createElement("div");
  el.className = "card-error";
  el.textContent = text;
  return el;
}
