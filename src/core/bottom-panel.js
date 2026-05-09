// src/core/bottom-panel.js
//
// Manages the content of the bottom drawer based on the current
// selection. The drawer's open/closed state is handled in
// index.html's bootstrap; this module is concerned only with what's
// rendered *inside* the content area.
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
  let pending = false;
  let renderToken = 0;

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      renderToken += 1;
      render(container, renderToken, () => renderToken);
    });
  }

  on("selectedCountry", schedule);
  on("selectedRegion", schedule);

  renderToken += 1;
  render(container, renderToken, () => renderToken);
}

/**
 * Render the appropriate content for the current selection.
 *
 * The token function prevents stale Wikipedia requests from replacing
 * the content after the user has already clicked another country.
 */
function render(container, token, getToken) {
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

  const country = selection.feature;
  const loading = makeLoading("Loading timeline from Wikipedia…");
  container.replaceChildren(loading);

  fetchCountryStats(country.id)
    .then((stats) => {
      if (token !== getToken()) return null;

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
      if (token !== getToken()) return;

      if (eras == null) {
        container.replaceChildren(
          makeEmpty("No detailed history article found on Wikipedia for this country.")
        );
        return;
      }

      container.replaceChildren(createTimeline(eras));
    })
    .catch((err) => {
      console.error("[bottom-panel] timeline fetch failed:", err);
      if (token === getToken()) {
        container.replaceChildren(
          makeError(`Failed to load timeline: ${err.message}`)
        );
      }
    });
}

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
