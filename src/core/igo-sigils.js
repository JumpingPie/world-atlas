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
  //
  // Cache key includes a schema-version suffix so older cached
  // entries (from before sigilPosition existed on the org JSON
  // shape) get bypassed on the next load instead of feeding a
  // stale, sigilPosition-less object into the filter below.
  const orgs = await Promise.all(
    SIGIL_IDS.map((id) =>
      getOrFetch(`org-data/v2:${id}`, TTL_MS, async () => {
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

  console.info(
    `[igo-sigils] loaded ${usable.length}/${SIGIL_IDS.length} orgs with sigilPosition`
  );
  if (usable.length === 0) {
    console.warn(
      "[igo-sigils] no orgs had a usable sigilPosition; rendering nothing"
    );
    return;
  }

  drawSigils(mapHandle, usable);
  bindGlobalCloseHandlers();
}

function drawSigils(mapHandle, orgs) {
  const projection = mapHandle.getProjection();
  const group = mapHandle.addPersistentOverlay("map-igo-sigils");
  let drawn = 0;

  for (const org of orgs) {
    const projected = projection(org.sigilPosition);
    if (!projected || !Number.isFinite(projected[0])) {
      console.warn(
        `[igo-sigils] could not project ${org.id} @ ${org.sigilPosition}`
      );
      continue;
    }
    const [x, y] = projected;

    const sigil = group
      .append("g")
      .attr("class", "igo-sigil")
      .attr("data-org-id", org.id)
      .attr("transform", `translate(${x}, ${y})`);
    drawn += 1;

    sigil
      .append("circle")
      .attr("class", "igo-sigil-disc")
      .attr("r", SIGIL_RADIUS);

    // Per-org symbolic glyph inside the disc. Drawn in the same
    // dark-brown ink as the rest of the map so the sigils read as
    // engraved marks rather than pasted-on logos. See appendIcon
    // for the per-org shapes.
    appendIcon(sigil, org.id);

    sigil.on("click", (event) => {
      event.stopPropagation();
      openPopover(sigil.node(), org);
    });
  }

  console.info(`[igo-sigils] drew ${drawn} sigils into the map`);
}

/**
 * Append a per-org symbolic glyph inside the sigil disc. Each glyph
 * is a tiny, low-detail mark chosen to read at the 16-radius disc
 * size without descending into illegible logo-miniaturization. The
 * design intent is "ink mark on a parchment map," not "company
 * logo," so everything stays in the same dark-brown stroke as the
 * map's country borders.
 *
 * For orgs whose visual identity *is* a letter mark (G7, G20),
 * typography is the right answer; everything else gets a glyph.
 *
 * Adding a new org's icon: extend the switch with another case.
 */
function appendIcon(sigil, orgId) {
  const ink = "#3d2f20";

  switch (orgId) {
    case "un": {
      // Olive wreath: two curved arcs framing the disc, with small
      // leaf-dots along each. Evokes the UN flag without trying to
      // render its polar-projection globe at 30px.
      sigil
        .append("path")
        .attr("d", "M-9,-2 Q-11,-7 -7,-9 Q-3,-10 0,-8")
        .attr("stroke-width", 1.2)
        .attr("stroke-linecap", "round")
        .attr("fill", "none")
        .attr("stroke", ink);
      sigil
        .append("path")
        .attr("d", "M9,-2 Q11,-7 7,-9 Q3,-10 0,-8")
        .attr("stroke-width", 1.2)
        .attr("stroke-linecap", "round")
        .attr("fill", "none")
        .attr("stroke", ink);
      sigil
        .append("path")
        .attr("d", "M-6,4 Q0,10 6,4")
        .attr("stroke-width", 1)
        .attr("stroke-linecap", "round")
        .attr("fill", "none")
        .attr("stroke", ink);
      for (const [cx, cy] of [
        [-7, -5], [-3, -7.5], [3, -7.5], [7, -5],
        [-3, 5], [3, 5],
      ]) {
        sigil
          .append("circle")
          .attr("cx", cx)
          .attr("cy", cy)
          .attr("r", 0.8)
          .attr("fill", ink);
      }
      return;
    }

    case "eu": {
      // Ring of 12 small stars (well — small dots) at the points
      // of a clock face, mirroring the EU flag's 12-star ring.
      for (let i = 0; i < 12; i++) {
        const angle = (i * 30 - 90) * (Math.PI / 180);
        const r = 8.5;
        sigil
          .append("circle")
          .attr("cx", Math.cos(angle) * r)
          .attr("cy", Math.sin(angle) * r)
          .attr("r", 1.3)
          .attr("fill", ink);
      }
      return;
    }

    case "five-eyes": {
      // A single eye: almond outline with a filled pupil.
      sigil
        .append("path")
        .attr("d", "M-10,0 Q0,-6 10,0 Q0,6 -10,0 Z")
        .attr("stroke-width", 1.2)
        .attr("stroke-linejoin", "round")
        .attr("fill", "none")
        .attr("stroke", ink);
      sigil
        .append("circle")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", 2.4)
        .attr("fill", ink);
      return;
    }

    case "g7": {
      sigil
        .append("text")
        .attr("class", "igo-sigil-glyph")
        .attr("font-size", "18px")
        .text("7");
      return;
    }

    case "g20": {
      sigil
        .append("text")
        .attr("class", "igo-sigil-glyph")
        .attr("font-size", "14px")
        .text("20");
      return;
    }

    case "brics": {
      // Filled 5-pointed star. Path is a single moveto + 10 linetos
      // for the alternating outer/inner star vertices.
      sigil
        .append("path")
        .attr(
          "d",
          starPath(0, 0, 9, 3.7, 5)
        )
        .attr("fill", ink);
      return;
    }

    case "oic": {
      // Crescent. Outer circle minus inner offset circle, drawn as
      // a single path with two arc commands.
      sigil
        .append("path")
        .attr(
          "d",
          "M3,-8 A8,8 0 1,0 3,8 A6,6 0 1,1 3,-8 Z"
        )
        .attr("fill", ink);
      return;
    }

    case "arab-league": {
      // Crescent (slimmer than OIC's) plus a small 5-point star to
      // the right — distinguishes from OIC at a glance while staying
      // visually consistent with Arab-world flag iconography.
      sigil
        .append("path")
        .attr(
          "d",
          "M1,-7 A7,7 0 1,0 1,7 A5.5,5.5 0 1,1 1,-7 Z"
        )
        .attr("fill", ink);
      sigil
        .append("path")
        .attr("d", starPath(7, 0, 2.4, 1, 5))
        .attr("fill", ink);
      return;
    }

    case "sco": {
      // Globe with vertical meridians — distinct from UN's olive-
      // wreath glyph and signaling the org's Eurasian span.
      sigil
        .append("circle")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", 7)
        .attr("stroke-width", 1.2)
        .attr("fill", "none")
        .attr("stroke", ink);
      sigil
        .append("line")
        .attr("x1", 0).attr("y1", -7)
        .attr("x2", 0).attr("y2", 7)
        .attr("stroke", ink)
        .attr("stroke-width", 0.8);
      sigil
        .append("path")
        .attr("d", "M-5,-5 Q0,-7 5,-5")
        .attr("stroke-width", 0.7)
        .attr("fill", "none")
        .attr("stroke", ink);
      sigil
        .append("path")
        .attr("d", "M-5,5 Q0,7 5,5")
        .attr("stroke-width", 0.7)
        .attr("fill", "none")
        .attr("stroke", ink);
      sigil
        .append("path")
        .attr("d", "M-7,0 Q-5,-3 -5,0 Q-5,3 -7,0")
        .attr("stroke-width", 0.7)
        .attr("fill", "none")
        .attr("stroke", ink);
      sigil
        .append("path")
        .attr("d", "M7,0 Q5,-3 5,0 Q5,3 7,0")
        .attr("stroke-width", 0.7)
        .attr("fill", "none")
        .attr("stroke", ink);
      return;
    }

    default: {
      // Fallback for any org that doesn't have a glyph yet — use
      // the short name as text. Same typography as G7/G20 so the
      // sigil still reads as a unified element.
      sigil
        .append("text")
        .attr("class", "igo-sigil-glyph")
        .attr("font-size", "11px")
        .text(orgId.toUpperCase().slice(0, 3));
    }
  }
}

/**
 * SVG path data for an n-pointed star centered at (cx, cy) with
 * given outer and inner radii. Used for BRICS (filled 5-pointed)
 * and the small companion star in the Arab League glyph.
 */
function starPath(cx, cy, outerR, innerR, points) {
  const step = Math.PI / points;
  let path = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    path += (i === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2);
  }
  return path + "Z";
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
