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
import { getOrFetch } from "./data-cache.js";
import layers from "../layers/index.js";

// Cache TTL for org info JSON when fetched on-demand from the
// popover. Same 14-day window the layer manager uses for membership
// data — the file is the same JSON, so the cache entry is shared. */
const INFO_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// Order in which layer categories appear in the panel. Categories
// not in this list fall through to alphabetical at the end. Keeping
// this list in code rather than data lets us prioritize sections by
// product judgment ("alliances first") rather than by alphabetical
// accident.
const CATEGORY_ORDER = [
  "universal",
  "alliance",
  "economic",
  "trade",
  "intergovernmental",
  "treaty",
  "conflict",
  "demographic",
];

// Display names for category headings. Internal ids are lowercase
// keywords; this maps them to title-case human-readable headings.
const CATEGORY_LABELS = {
  universal: "Universal",
  alliance: "Alliances",
  economic: "Economic blocs",
  trade: "Trade",
  intergovernmental: "Regional intergovernmental",
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
 * Build one toggle-button list item for a layer. The toggle button
 * carries a data-layer-id attribute the sync function uses to find
 * it. A sibling info button opens a collapsible card with the org's
 * mission, headquarters, founding year, member count, and outbound
 * links — lazy-loaded from the layer's dataSource JSON.
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

  // Info button — separate from the toggle so clicking one doesn't
  // accidentally fire the other. Italic lowercase "i" inside a
  // small circle, sitting flush to the right of the toggle.
  const infoBtn = document.createElement("button");
  infoBtn.type = "button";
  infoBtn.className = "layer-info-btn";
  infoBtn.setAttribute("aria-label", `Information about ${layer.label}`);
  infoBtn.setAttribute("aria-expanded", "false");
  infoBtn.textContent = "i";

  // Collapsible info card. Hidden by default; populated on first
  // open via the org's JSON dataSource.
  const card = document.createElement("div");
  card.className = "layer-info-card";
  card.hidden = true;

  infoBtn.addEventListener("click", () =>
    toggleInfoCard(layer, infoBtn, card)
  );

  li.appendChild(infoBtn);
  li.appendChild(card);

  return li;
}

/**
 * Open or close a layer's info card. Lazy-fetches the org's JSON the
 * first time the card opens; subsequent opens reuse the populated
 * DOM without refetching.
 *
 * Layers without a dataSource (none currently, but a forward-looking
 * design) get a non-functional info card that just says no metadata
 * is available — better than a silent broken button.
 */
async function toggleInfoCard(layer, btn, card) {
  if (!card.hidden) {
    card.hidden = true;
    btn.classList.remove("is-active");
    btn.setAttribute("aria-expanded", "false");
    return;
  }
  card.hidden = false;
  btn.classList.add("is-active");
  btn.setAttribute("aria-expanded", "true");

  if (card.dataset.populated === "true") return;
  card.dataset.populated = "true";

  if (!layer.dataSource) {
    renderInfoError(card, "No organization metadata available.");
    return;
  }

  renderInfoLoading(card);

  try {
    // Share the data-cache layer-manager uses, so opening the info
    // card after the layer's already been rendered is instant
    // (and toggling the layer on after opening the info card is
    // similarly instant).
    const data = await getOrFetch(
      `org-data/v2:${layer.id}`,
      INFO_TTL_MS,
      async () => {
        const res = await fetch(layer.dataSource);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }
    );
    renderInfoCard(card, data);
  } catch (err) {
    console.warn(
      `[layer-controls] info load failed for ${layer.id}:`,
      err
    );
    renderInfoError(card, "Couldn’t load organization details.");
  }
}

function renderInfoLoading(card) {
  card.replaceChildren();
  const p = document.createElement("p");
  p.className = "layer-info-loading";
  p.textContent = "Loading…";
  card.appendChild(p);
}

function renderInfoError(card, message) {
  card.replaceChildren();
  const p = document.createElement("p");
  p.className = "layer-info-error";
  p.textContent = message;
  card.appendChild(p);
}

/**
 * Populate an empty container with an org's info: mission, key
 * stats, outbound links. Exported so the IGO sigil popover can reuse
 * the same rendering against the same JSON shape. Mutates `card` in
 * place; doesn't manage open/close.
 */
export function renderInfoCard(card, data) {
  card.replaceChildren();

  if (data.mission) {
    const p = document.createElement("p");
    p.className = "layer-info-mission";
    p.textContent = data.mission;
    card.appendChild(p);
  }

  const stats = document.createElement("dl");
  stats.className = "layer-info-stats";

  const addStat = (key, value) => {
    if (value === null || value === undefined || value === "") return;
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = value;
    stats.appendChild(dt);
    stats.appendChild(dd);
  };

  addStat("Founded", data.founded);
  addStat("Headquarters", data.headquarters);
  addStat(
    "Members",
    Array.isArray(data.members) ? `${data.members.length} states` : null
  );

  if (stats.children.length > 0) card.appendChild(stats);

  const links = document.createElement("div");
  links.className = "layer-info-links";
  if (data.websiteUrl) links.appendChild(makeInfoLink(data.websiteUrl, "Official site"));
  if (data.wikipediaUrl) links.appendChild(makeInfoLink(data.wikipediaUrl, "Wikipedia"));
  if (links.children.length > 0) card.appendChild(links);
}

function makeInfoLink(href, label) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = label;
  return a;
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
