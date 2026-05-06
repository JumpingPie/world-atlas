// src/core/panel.js
//
// The selection side panel.
//
// What this owns: the panel chrome (header, close button, scroll area)
// and the lifecycle of cards inside it. When a country or a region is
// selected, this module asks each registered card to render itself
// for that selection and stacks the results in display order.
//
// What it does NOT own: the cards themselves. Each card lives under
// src/panels/ and is responsible for its own data fetching, layout,
// and updates. The panel only orchestrates.
//
// The boundary: cards receive a typed Selection object and return a
// DOM node (or null to skip themselves for that selection type). They
// do not import from this module. Adding a new card type is a matter
// of dropping a file in src/panels/ and registering it in
// src/panels/index.js — no panel.js changes required.
//
// Selection shape (see src/core/state.js for the source of truth):
//
//   { kind: "country", feature: <GeoJSON country feature> }
//   { kind: "region",  region:  <GeoJSON merged region feature> }
//   null  (no selection)

import { on, setSelection, getCurrentSelection } from "./state.js";
import cards from "../panels/index.js";

/**
 * Initialize the side panel inside the given container.
 *
 * @param {HTMLElement} container - The DOM node that will hold the
 *     panel. Expected to be sized via CSS (we don't compute layout).
 */
export function initPanel(container) {
  // Build the panel chrome once. Card content gets re-rendered on
  // each selection change; the chrome stays.
  container.innerHTML = `
    <header class="panel-header">
      <h2 class="panel-title">No selection</h2>
      <button class="panel-close" aria-label="Close panel">&times;</button>
    </header>
    <div class="panel-cards"></div>
  `;

  const titleEl = container.querySelector(".panel-title");
  const cardsEl = container.querySelector(".panel-cards");
  const closeBtn = container.querySelector(".panel-close");

  // Close button clears the selection — same channel as ocean clicks
  // in src/core/map.js, so behavior stays consistent regardless of
  // how the user dismisses the panel.
  closeBtn.addEventListener("click", () => {
    setSelection(null);
  });

  // React to either kind of selection change. We subscribe to both
  // events but the actual rendering goes through getCurrentSelection
  // so we always render based on the unified, type-tagged shape.
  //
  // setSelection updates two fields and fires two events; we coalesce
  // them through a single rAF so the panel renders once per frame
  // rather than twice per swap. The flag is reset inside the rAF
  // callback so subsequent unrelated changes still queue cleanly.
  let renderPending = false;
  function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
      renderPending = false;
      render();
    });
  }
  on("selectedCountry", scheduleRender);
  on("selectedRegion", scheduleRender);

  function render() {
    const selection = getCurrentSelection();

    if (!selection) {
      container.classList.remove("is-open");
      cardsEl.replaceChildren();
      titleEl.textContent = "No selection";
      return;
    }

    titleEl.textContent = titleFor(selection);
    container.classList.add("is-open");

    // Render every registered card. Cards return a DOM node
    // immediately (with a loading state if they need to fetch data)
    // and update themselves when their data arrives. Cards that
    // don't apply to this selection.kind return null and we skip
    // them. A single card module is therefore free to handle one
    // selection kind, the other, or both — entirely its choice.
    const nodes = [];
    for (const card of cards) {
      try {
        const node = card.render(selection);
        if (node) nodes.push(node);
      } catch (err) {
        // A buggy card should not break the whole panel. Log it,
        // surface a brief notice in the panel, and continue.
        console.error(`[panel] card "${card.id}" threw on render:`, err);
        const errEl = document.createElement("section");
        errEl.className = "panel-card panel-card-error";
        errEl.textContent = `Card "${card.id}" failed to render. See console.`;
        nodes.push(errEl);
      }
    }
    cardsEl.replaceChildren(...nodes);
  }
}

/**
 * Compute the panel title for a given selection. Centralized so the
 * fallback shape ("Country 123" if a feature is somehow missing its
 * name) is consistent regardless of selection kind.
 */
function titleFor(selection) {
  if (selection.kind === "country") {
    const f = selection.feature;
    return f.properties?.name ?? `Country ${f.id ?? "?"}`;
  }
  if (selection.kind === "region") {
    return selection.region.properties?.name ?? "Region";
  }
  return "Selection";
}
