// src/core/panel.js
//
// The country side panel.
//
// What this owns: the panel chrome (header, close button, scroll area)
// and the lifecycle of cards inside it. When a country is selected,
// this module asks each registered card to render itself for that
// country and stacks the results in display order.
//
// What it does NOT own: the cards themselves. Each card lives under
// src/panels/ and is responsible for its own data fetching, layout,
// and updates. The panel only orchestrates.
//
// The boundary: cards receive a country GeoJSON feature and return a
// DOM node. They do not import from this module. Adding a new card
// type is a matter of dropping a file in src/panels/ and registering
// it in src/panels/index.js — no panel.js changes required.

import { on, setState } from "./state.js";
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
      <h2 class="panel-title">No country selected</h2>
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
    setState({ selectedCountry: null });
  });

  // React to selection changes. The map publishes; the panel reacts.
  // No direct coupling between them.
  on("selectedCountry", (country) => {
    if (!country) {
      container.classList.remove("is-open");
      cardsEl.replaceChildren();
      titleEl.textContent = "No country selected";
      return;
    }

    titleEl.textContent =
      country.properties?.name ?? `Country ${country.id ?? "?"}`;
    container.classList.add("is-open");

    // Render every card. Cards return a DOM node immediately (with a
    // loading state if they need to fetch data) and update themselves
    // when their data arrives. Returning null skips the card for this
    // country.
    const nodes = [];
    for (const card of cards) {
      try {
        const node = card.render(country);
        if (node) nodes.push(node);
      } catch (err) {
        // A buggy card should not break the whole panel. Log it,
        // surface a brief notice in the panel, and continue with the
        // remaining cards.
        console.error(`[panel] card "${card.id}" threw on render:`, err);
        const errEl = document.createElement("section");
        errEl.className = "panel-card panel-card-error";
        errEl.textContent = `Card "${card.id}" failed to render. See console.`;
        nodes.push(errEl);
      }
    }
    cardsEl.replaceChildren(...nodes);
  });
}
