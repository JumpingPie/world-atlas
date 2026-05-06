// src/core/layer-controls.js
//
// Populates the left panel with toggle controls for the registered
// layers. One section per category, one toggle per layer.
//
// What this owns:
//   - Reading the layer manifest.
//   - Rendering toggle buttons (with colored swatches and labels).
//   - Wiring clicks to flip state.activeLayers.
//   - Keeping the visual state of buttons in sync with state.
//
// What this does NOT own:
//   - The actual map rendering of layers (layer-manager + layer
//     modules handle that).
//   - The left panel's chrome (header, close button) — that's
//     declared in index.html and shared with the right panel.
//
// Single source of truth for whether a layer is on: state.activeLayers.
// This module both writes to that field (on click) and reads from it
// (on every state event). The map renders or unrenders accordingly
// via the layer manager.

import { setState, getState, on } from "./state.js";
import layers from "../layers/index.js";

// Order in which layer categories appear in the panel. Categories
// not in this list fall through to alphabetical at the end. Keeping
// this list in code rather than data lets us prioritize sections by
// product judgment ("alliances first") rather than by alphabetical
// accident.
const CATEGORY_ORDER = [
  "alliance",
  "economic",
  "trade",
  "treaty",
  "conflict",
  "demographic",
];

// Display names for category headings. Internal ids are lowercase
// keywords; this maps them to title-case human-readable headings.
const CATEGORY_LABELS = {
  alliance: "Alliances",
  economic: "Economic blocs",
  trade: "Trade",
  treaty: "Treaties",
  conflict: "Conflicts",
  demographic: "Demographics",
};

/**
 * Populate the given container with layer toggles. Call once at
 * startup, passing the panel-cards div from inside the left panel.
 *
 * @param {HTMLElement} container
 */
export function initLayerControls(container) {
  // Group layers by their declared category so we can render section
  // headings. Layers without a category fall into "other".
  const byCategory = new Map();
  for (const layer of layers) {
    const cat = layer.category ?? "other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(layer);
  }

  // Sort categories: known categories in CATEGORY_ORDER first (in
  // that order), unknown categories alphabetically after.
  const sortedCategories = [...byCategory.keys()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  // Replace existing content (the placeholder card from index.html).
  container.replaceChildren();

  for (const category of sortedCategories) {
    container.appendChild(makeCategoryCard(category, byCategory.get(category)));
  }

  // Subscribe so the visual state of toggles tracks programmatic
  // changes to activeLayers. Not strictly necessary today (only
  // these buttons mutate it) but cheap insurance for future code
  // paths that might toggle layers without going through the panel.
  on("activeLayers", () => syncToggleStates(container));
  syncToggleStates(container);
}

/**
 * Build one category section: a panel-card containing a heading and
 * a list of toggles for the layers in that category.
 */
function makeCategoryCard(category, layersInCategory) {
  const card = document.createElement("section");
  card.className = "panel-card layer-category";

  const heading = document.createElement("h3");
  heading.className = "layer-category-name";
  heading.textContent = CATEGORY_LABELS[category] ?? category;
  card.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "layer-list";
  for (const layer of layersInCategory) {
    list.appendChild(makeLayerItem(layer));
  }
  card.appendChild(list);

  return card;
}

/**
 * Build one toggle-button list item for a layer. The button carries
 * a data-layer-id attribute the sync function uses to find it.
 */
function makeLayerItem(layer) {
  const li = document.createElement("li");
  li.className = "layer-item";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "layer-toggle";
  btn.dataset.layerId = layer.id;
  if (layer.description) btn.title = layer.description;

  const swatch = document.createElement("span");
  swatch.className = "layer-swatch";
  // The swatch reads the layer's signature color so the panel
  // legend matches what the user will see on the map. Falls back to
  // a neutral border color for layers that don't declare one (would
  // be unusual, but defensive).
  if (layer.color) swatch.style.backgroundColor = layer.color;

  const label = document.createElement("span");
  label.className = "layer-label";
  label.textContent = layer.label;

  btn.appendChild(swatch);
  btn.appendChild(label);
  btn.addEventListener("click", () => toggleLayer(layer.id));

  li.appendChild(btn);
  return li;
}

/**
 * Flip a layer's active state. Reads the current set, builds a new
 * set with the change, and dispatches it through setState. Always
 * passing a NEW Set ensures the equality check in setState's emit
 * loop fires the event — mutating an existing Set wouldn't.
 */
function toggleLayer(id) {
  const active = new Set(getState().activeLayers);
  if (active.has(id)) {
    active.delete(id);
  } else {
    active.add(id);
  }
  setState({ activeLayers: active });
}

/**
 * Apply the .is-active class to toggle buttons whose layer is
 * currently in state.activeLayers. Called on every activeLayers
 * change.
 */
function syncToggleStates(container) {
  const active = getState().activeLayers;
  container.querySelectorAll(".layer-toggle").forEach((btn) => {
    btn.classList.toggle("is-active", active.has(btn.dataset.layerId));
  });
}
