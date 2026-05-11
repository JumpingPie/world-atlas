// src/core/igo-sigils.js
//
// First-class IGO sigils on the map.
//
// What this is: a fixed set of intergovernmental organizations is
// drawn as small parchment-and-ink medallions ("sigils") at hand-
// curated lon/lat positions on the map — typically in international
// waters near each org's headquarters, or at a symbolic location for
// orgs without a fixed seat. Sigils are visible only at the world-
// view zoom tier and disappear at country zoom; clicking one opens a
// popover with the org's metadata (mission, founded, HQ, members,
// outbound links), reusing the same renderer as the layer panel's
// info card.
//
// What this is NOT: a generic "all organizations" layer. The 9 IGOs
// surfaced as sigils were chosen for their global weight; everything
// else stays as a layer-only entity. Adding or removing a sigil is a
// one-line change to SIGIL_IDS below (plus a `sigilPosition` field on
// the org's JSON file).
//
// Architecture notes:
//   - Sigils render into a persistent overlay group obtained from
//     mapHandle.addPersistentOverlay("map-igo-sigils") — outside the
//     regular `.map-overlays` container so the zoom-tier-1 hide rule
//     on overlays doesn't also hide the sigils. Visibility per tier is
//     handled in CSS instead.
//   - Each sigil's screen position comes from the same projection
//     other layers use; sigils ride the map's zoom transform like any
//     other map element. Sigil glyphs use vector-effect:non-scaling-
//     stroke so the outline stays crisp at any zoom.
//   - The popover is a single shared HTML element inside #map-container
//     repositioned per click. Closes on outside-click, Escape, and any
//     zoom/pan event (since pan would visually disconnect it from the
//     sigil, and zoom hides the sigils entirely).
//   - Org JSON is fetched per-sigil through the shared data-cache so
//     a sigil that's already a layer doesn't re-fetch.

import { getOrFetch } from "./data-cache.js";
import { renderInfoCard } from "./layer-controls.js";

const SIGIL_IDS = [
  "un",
  "eu",
  "five-eyes",
  "g7",
  "g20",
  "brics",
  "oic",
  "arab-league",
  "sco",
];

// Same TTL as the layer manager — these are the same JSON files; the
// cache entry is shared across systems.
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

// Visual sizing of each sigil, in viewBox units. Sigils ride the map's
// zoom transform like other map elements, so this is the on-screen
// size at zoom-tier-1 (k=1).
const SIGIL_RADIUS = 16;

let popoverEl = null;
let mapHandleRef = null;
let docClickHandler = null;
let docKeydownHandler = null;

/**
 * Initialize IGO sigils on the map. Idempotent — calling again
 * replaces the previous sigil overlay and re-binds handlers.
 *
 * @param {object} mapHandle - the map handle returned by initMap
 * @param {HTMLElement} popoverContainer - the popover DOM element
 *     (an empty div inside #map-container that we populate on click)
 */
export async function initIgoSigils(mapHandle, popoverContainer) {
  if (!mapHandle || !popoverContainer) return;
  mapHandleRef = mapHandle;
  popoverEl = popoverContainer;

  // Fetch every sigil's org data in parallel. Each fetch goes
  // through the shared data-cache, so an org whose layer is already
  // rendered has already populated its entry — these resolve
  // synchronously from cache in that case.
  const orgs = await Promise.all(
    SIGIL_IDS.map((id) =>
      getOrFetch(`layer-data:${id}`, TTL_MS, async () => {
        const res = await fetch(`data/orgs/${id}.json`);
        if (!res.ok) {
          throw new Error(`org json fetch failed for ${id}: ${res.status}`);
        }
        return res.json();
      }).catch((err) => {
        console.warn("[igo-sigils] could not load", id, err);
        return null;
      })
    )
  );

  const usable = orgs.filter(
    (o) => o && Array.isArray(o.sigilPosition) && o.sigilPosition.length === 2
  );

  drawSigils(mapHandle, usable);
  bindGlobalCloseHandlers();
}

function drawSigils(mapHandle, orgs) {
  const projection = mapHandle.getProjection();
  const group = mapHandle.addPersistentOverlay("map-igo-sigils");

  for (const org of orgs) {
    const projected = projection(org.sigilPosition);
    if (!projected || !Number.isFinite(projected[0])) continue;
    const [x, y] = projected;

    const sigil = group
      .append("g")
      .attr("class", "igo-sigil")
      .attr("data-org-id", org.id)
      .attr("transform", `translate(${x}, ${y})`);

    sigil
      .append("circle")
      .attr("class", "igo-sigil-disc")
      .attr("r", SIGIL_RADIUS);

    sigil
      .append("text")
      .attr("class", "igo-sigil-label")
      .text(org.shortName || org.id.toUpperCase());

    sigil.on("click", (event) => {
      event.stopPropagation();
      openPopover(sigil.node(), org);
    });
  }
}

function openPopover(sigilNode, org) {
  if (!popoverEl) return;

  const sigilRect = sigilNode.getBoundingClientRect();
  const parentRect = popoverEl.parentElement.getBoundingClientRect();

  // Anchor the popover just to the right of the sigil. If that would
  // overflow the map container, flip to the left side.
  const popoverWidth = 280;
  let left = sigilRect.right - parentRect.left + 10;
  if (left + popoverWidth > parentRect.width - 8) {
    left = sigilRect.left - parentRect.left - popoverWidth - 10;
  }
  const top = Math.max(8, sigilRect.top - parentRect.top - 4);

  popoverEl.style.left = `${left}px`;
  popoverEl.style.top = `${top}px`;
  popoverEl.style.width = `${popoverWidth}px`;

  // Header — org name + close button. Then the shared info card body.
  popoverEl.replaceChildren();

  const header = document.createElement("header");
  header.className = "map-igo-popover-header";

  const title = document.createElement("h3");
  title.className = "map-igo-popover-title";
  title.textContent = org.name;
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.className = "map-igo-popover-close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => closePopover());
  header.appendChild(closeBtn);

  popoverEl.appendChild(header);

  const body = document.createElement("div");
  body.className = "map-igo-popover-body";
  renderInfoCard(body, org);
  popoverEl.appendChild(body);

  popoverEl.hidden = false;
}

function closePopover() {
  if (!popoverEl) return;
  popoverEl.hidden = true;
  popoverEl.replaceChildren();
}

function bindGlobalCloseHandlers() {
  // Replace any previous handlers so a re-init doesn't stack them.
  if (docClickHandler) document.removeEventListener("click", docClickHandler);
  if (docKeydownHandler) document.removeEventListener("keydown", docKeydownHandler);

  docClickHandler = (e) => {
    if (!popoverEl || popoverEl.hidden) return;
    if (popoverEl.contains(e.target)) return;
    // Don't close when clicking another sigil — that path opens a
    // new popover via the sigil's own click handler, which fires
    // before this one due to stopPropagation.
    closePopover();
  };
  docKeydownHandler = (e) => {
    if (e.key === "Escape" && popoverEl && !popoverEl.hidden) {
      closePopover();
    }
  };
  document.addEventListener("click", docClickHandler);
  document.addEventListener("keydown", docKeydownHandler);
}

/**
 * Called by the map on every zoom/pan event so we can close the
 * popover (which would otherwise drift from its sigil). Exported so
 * the bootstrap script can subscribe it; we don't reach into the
 * map's internals from here.
 */
export function dismissIgoPopover() {
  closePopover();
}
