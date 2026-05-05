// src/core/map.js
//
// The base map renderer.
//
// What this file owns: the SVG element, the geographic projection, the
// zoom/pan behavior, the country-geometry layer, country name labels,
// and the on-screen zoom buttons. It is the only file that interacts
// with d3 selections on the map's SVG directly.
//
// What it does NOT own: layer-specific overlays (those live in
// src/layers/), country-panel rendering (src/panels/), or any data
// source code (src/fetchers/).
//
// The boundary: other modules talk to the map exclusively through the
// "map handle" object returned by initMap(). They never reach into the
// SVG via document.querySelector or by importing internal helpers from
// this file. If a layer or panel needs something the handle doesn't
// expose, extend the handle here rather than bypassing it.
//
// Projection choice: d3.geoEqualEarth is an equal-area projection — it
// preserves relative country sizes, which matters for an atlas read
// analytically. Mercator (the web default) wildly distorts the polar
// regions and is the wrong default for geopolitical analysis.
//
// Interaction model: trackpad-first.
//   - Two-finger swipe (wheel without ctrl/meta) → pan
//   - Pinch (wheel with ctrlKey, synthesized by the OS for trackpad
//     pinches on both Mac and Windows precision touchpads) → zoom
//   - Click-and-drag → pan (always available, mouse-friendly)
//   - On-screen +/− buttons → zoom (mouse-only safety net since we
//     suppressed wheel-zoom in favor of trackpad-pan)
//   - Mouse near edge of map → auto-pan in that direction (RTS-style)

import * as d3 from "d3";
import * as topojson from "topojson-client";
import { setState, on } from "./state.js";

/**
 * Path to the world country borders TopoJSON. Loaded from CDN in
 * Section 1; will be vendored to data/geo/ in a later section so the
 * site works offline and isn't subject to CDN downtime.
 */
const COUNTRIES_TOPOJSON_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

/** Base on-screen size of country labels, in pixels. The label group's
 *  font-size is counter-scaled by the inverse of the zoom transform's k
 *  so labels stay this size regardless of zoom level. */
const LABEL_BASE_SIZE = 11;

/** Distance from the SVG's edge (in pixels) at which auto-pan kicks in. */
const EDGE_PAN_THRESHOLD = 30;

/** Maximum auto-pan speed in pixels per animation frame, reached when
 *  the cursor is exactly at the edge. Speed ramps linearly from 0 at
 *  the threshold boundary to this value at the edge. */
const EDGE_PAN_MAX_SPEED = 8;

/**
 * Initialize the world map inside `container`. Call this once at app
 * startup.
 *
 * @param {HTMLElement} container - DOM element that will host the SVG.
 *                                  Must be sized via CSS (we read its
 *                                  bounding rect to size the SVG).
 * @returns {Promise<MapHandle>}    A handle other modules use to attach
 *                                  overlays and read map state.
 */
export async function initMap(container) {
  const { width, height } = container.getBoundingClientRect();

  // Equal Earth projection (Šavrič et al. 2018). Equal-area, low
  // distortion, visually familiar.
  const projection = d3.geoEqualEarth();
  const path = d3.geoPath(projection);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("class", "world-map zoom-tier-1")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // The transformed root. Everything that should pan/zoom together
  // lives inside this <g>: ocean rect, country paths, overlays, labels.
  const root = svg.append("g").attr("class", "map-root");

  // Background ocean rect — sits behind countries and absorbs clicks
  // on empty water (clears the panel selection).
  root
    .append("rect")
    .attr("class", "map-ocean")
    .attr("width", width)
    .attr("height", height);

  const countriesGroup = root.append("g").attr("class", "map-countries");
  const overlaysGroup = root.append("g").attr("class", "map-overlays");
  // Labels group is ordered last so labels paint on top of overlays.
  const labelsGroup = root
    .append("g")
    .attr("class", "map-labels")
    .attr("font-size", `${LABEL_BASE_SIZE}px`);

  // Fetch and render the country borders.
  const topology = await fetchCountriesTopology();
  const countries = topojson.feature(topology, topology.objects.countries);

  // Fit the projection to the available space using the actual
  // country geometries — centers and scales the world correctly
  // regardless of container size or aspect ratio.
  projection.fitSize([width, height], countries);

  countriesGroup
    .selectAll("path.country")
    .data(countries.features)
    .join("path")
    .attr("class", "country")
    .attr("data-iso-numeric", (d) => d.id)
    .attr("d", path)
    .on("click", (event, feature) => {
      // The map's only job on click is to publish the selection
      // through state.js. Whoever cares (the panel) listens there.
      event.stopPropagation();
      setState({ selectedCountry: feature });
    });

  // Country name labels with tiered visibility. Tier 1 (largest ~25
  // countries) shows at every zoom; tier 2 appears at 2× zoom and
  // beyond; tier 3 at 4×+. Sorting by geographic area means visual
  // size on the map roughly corresponds to label tier — labels appear
  // where there's space for them.
  const labelTiers = computeLabelTiers(countries.features);
  const labelData = countries.features
    .map((f) => {
      const [cx, cy] = path.centroid(f);
      return { feature: f, cx, cy };
    })
    // Some features (very small islands, geometry edge cases) yield
    // a NaN centroid. Filter them out rather than placing the label
    // at (0,0).
    .filter((d) => Number.isFinite(d.cx) && Number.isFinite(d.cy));

  labelsGroup
    .selectAll("text.country-label")
    .data(labelData)
    .join("text")
    .attr(
      "class",
      (d) =>
        `country-label country-label-tier-${labelTiers.get(d.feature.id) ?? 3}`
    )
    .attr("transform", (d) => `translate(${d.cx}, ${d.cy})`)
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .text((d) => d.feature.properties?.name ?? "");

  // Clicking the ocean clears the selection. Attached after country
  // handlers so country clicks (which stopPropagation) win.
  root.select("rect.map-ocean").on("click", () => {
    setState({ selectedCountry: null });
  });

  // Reflect selection visually. The map listens to state.js — the
  // panel doesn't tell it directly. Keeps data flow one-way.
  on("selectedCountry", (country) => {
    countriesGroup
      .selectAll("path.country")
      .classed("is-selected", (d) => country != null && d.id === country.id)
      .classed("is-dimmed", (d) => country != null && d.id !== country.id);
  });

  // ------------------------------------------------------------------
  // Pan/zoom behavior. Trackpad-friendly: see the file header comment.
  // ------------------------------------------------------------------

  // Tracks whether the user is mid-gesture (drag or wheel-driven pan/
  // zoom). Edge auto-pan checks this so it doesn't compound with an
  // active interaction.
  let isInteracting = false;

  const zoom = d3
    .zoom()
    .scaleExtent([1, 8])
    // Suppress d3.zoom's built-in wheel handler; we do our own below
    // so two-finger trackpad swipe pans (rather than zooming as it
    // would by default). Drag-to-pan still goes through d3.zoom.
    .filter((event) => {
      if (event.type === "wheel") return false;
      return !event.button;
    })
    .on("start", () => {
      isInteracting = true;
    })
    .on("zoom", (event) => {
      const k = event.transform.k;
      root.attr("transform", event.transform);
      // Counter-scale label font so labels stay constant on-screen
      // size regardless of zoom level.
      labelsGroup.attr("font-size", `${LABEL_BASE_SIZE / k}px`);
      // Apply zoom-tier class so CSS can show/hide tiered labels.
      const tier = k >= 4 ? 3 : k >= 2 ? 2 : 1;
      svg.attr("class", `world-map zoom-tier-${tier}`);
    })
    .on("end", () => {
      isInteracting = false;
    });

  svg.call(zoom);

  // Custom wheel handler: trackpad pinch zooms, plain wheel pans.
  setupTrackpadGestures(svg, zoom);

  // Auto-pan when the cursor is near the edge of the map area.
  setupEdgePan(svg, zoom, () => isInteracting);

  // On-screen zoom buttons. We need these because the trackpad-first
  // wheel scheme above leaves mouse-wheel users with no scroll-zoom.
  addZoomControls(container, svg, zoom);

  // ------------------------------------------------------------------
  // Public handle. Narrow on purpose — see the lego-block rationale
  // in docs/ARCHITECTURE.md.
  // ------------------------------------------------------------------
  return {
    /**
     * Add an overlay layer. Returns the SVG group the layer should
     * render into. Calling addOverlay twice with the same id replaces
     * the previous group.
     *
     * @param {string} id - Layer identifier.
     * @returns {d3.Selection}
     */
    addOverlay(id) {
      overlaysGroup.select(`g[data-overlay-id="${id}"]`).remove();
      return overlaysGroup
        .append("g")
        .attr("data-overlay-id", id)
        .attr("class", `overlay overlay-${id}`);
    },

    /** Remove an overlay by id. Safe to call if it was never added. */
    removeOverlay(id) {
      overlaysGroup.select(`g[data-overlay-id="${id}"]`).remove();
    },

    /** Active geographic projection. Layers should reuse this. */
    getProjection() {
      return projection;
    },

    /** d3 path generator. Layers rendering GeoJSON should reuse it. */
    getPath() {
      return path;
    },

    /** Country GeoJSON features. Layers/panels read this. */
    getCountries() {
      return countries.features;
    },
  };
}

// --------------------------------------------------------------------
// Helpers — kept module-private. None of these are part of the public
// map handle. If a layer or panel needs something below, expose it on
// the handle rather than importing the helper directly.
// --------------------------------------------------------------------

/**
 * Compute a label-visibility tier for each country, ordered by the
 * country's geographic area (in steradians, via d3.geoArea). The 25
 * largest countries get tier 1, the next 50 get tier 2, the rest get
 * tier 3. CSS hides higher tiers until the map is sufficiently zoomed.
 *
 * @param {Array<object>} features - GeoJSON country features.
 * @returns {Map<string|number, 1|2|3>}
 */
function computeLabelTiers(features) {
  const sorted = features
    .map((f) => ({ id: f.id, area: d3.geoArea(f) }))
    .sort((a, b) => b.area - a.area);
  const tiers = new Map();
  sorted.forEach((entry, i) => {
    tiers.set(entry.id, i < 25 ? 1 : i < 75 ? 2 : 3);
  });
  return tiers;
}

/**
 * Wire up the custom wheel handler that gives us trackpad two-finger
 * pan distinct from pinch zoom.
 *
 * Browsers (both Chrome and Safari) expose trackpad pinches as wheel
 * events with ctrlKey synthesized by the OS, even when the user isn't
 * actually holding Ctrl. So `event.ctrlKey` cleanly distinguishes
 * pinch from swipe on every modern desktop browser.
 */
function setupTrackpadGestures(svg, zoom) {
  svg.on("wheel", function (event) {
    // Without preventDefault the page would scroll (or browser-zoom
    // on ctrl+wheel). We've already chosen to handle this gesture
    // ourselves.
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      // Pinch-to-zoom. Anchor the zoom on the cursor so the point
      // under the user's fingers stays put — standard map UX.
      const factor = 1 - event.deltaY * 0.01;
      const point = d3.pointer(event, svg.node());
      svg.call(zoom.scaleBy, factor, point);
    } else {
      // Two-finger swipe (or vertical mouse-wheel scroll) → pan.
      // Negate deltas because translateBy moves content in the same
      // direction as the delta, but UX expectation is that the
      // viewport moves in the opposite direction (content "scrolls
      // away" from the gesture).
      svg.call(zoom.translateBy, -event.deltaX, -event.deltaY);
    }
  });
}

/**
 * Auto-pan the map when the cursor enters a band near the edge.
 *
 * Why a band rather than only the exact edge: an exact-edge trigger
 * is fiddly to hit and provides no smooth ramp-up. A band gives the
 * user analog control — closer to the edge means faster pan.
 *
 * @param {d3.Selection} svg
 * @param {d3.ZoomBehavior} zoom
 * @param {() => boolean} isInteracting - Predicate that returns true
 *     while the user is mid-drag/wheel. Edge-pan suspends itself in
 *     that case so it doesn't compound with explicit input.
 */
function setupEdgePan(svg, zoom, isInteracting) {
  let mouseInside = false;
  let mouseX = 0;
  let mouseY = 0;
  let raf = null;
  const node = svg.node();

  node.addEventListener("mousemove", (event) => {
    const rect = node.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseInside = true;
    // Schedule one tick if not already scheduled. The tick re-arms
    // itself only while we're still in an edge zone, so a cursor
    // resting in the middle of the map costs zero per-frame work.
    if (raf == null) raf = requestAnimationFrame(tick);
  });

  node.addEventListener("mouseleave", () => {
    mouseInside = false;
  });

  function tick() {
    raf = null;
    if (!mouseInside || isInteracting()) return;

    const rect = node.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    let dx = 0;
    let dy = 0;

    if (mouseX < EDGE_PAN_THRESHOLD) {
      dx = EDGE_PAN_MAX_SPEED * (1 - mouseX / EDGE_PAN_THRESHOLD);
    } else if (mouseX > w - EDGE_PAN_THRESHOLD) {
      dx =
        -EDGE_PAN_MAX_SPEED *
        (1 - (w - mouseX) / EDGE_PAN_THRESHOLD);
    }

    if (mouseY < EDGE_PAN_THRESHOLD) {
      dy = EDGE_PAN_MAX_SPEED * (1 - mouseY / EDGE_PAN_THRESHOLD);
    } else if (mouseY > h - EDGE_PAN_THRESHOLD) {
      dy =
        -EDGE_PAN_MAX_SPEED *
        (1 - (h - mouseY) / EDGE_PAN_THRESHOLD);
    }

    if (dx !== 0 || dy !== 0) {
      svg.call(zoom.translateBy, dx, dy);
      // Still in edge zone → keep ticking.
      raf = requestAnimationFrame(tick);
    }
    // If dx and dy are both 0 the cursor is in the middle; we don't
    // re-schedule. The next mousemove will start a new tick if/when
    // the cursor re-enters the edge band.
  }
}

/**
 * Add small +/− zoom buttons to the corner of the map container.
 *
 * Why on-screen buttons in a touchpad-first UI: we suppressed wheel-
 * zoom in favor of wheel-pan, so users on a plain mouse with no pinch
 * gesture would otherwise have no zoom affordance. Drag-pan still
 * works for those users, but zoom needs an explicit button.
 *
 * @param {HTMLElement} container - The map container; the buttons
 *     are appended here so they overlay the SVG.
 */
function addZoomControls(container, svg, zoom) {
  const controls = document.createElement("div");
  controls.className = "map-controls";
  controls.innerHTML = `
    <button class="map-control-btn" data-action="zoom-in" aria-label="Zoom in" title="Zoom in">+</button>
    <button class="map-control-btn" data-action="zoom-out" aria-label="Zoom out" title="Zoom out">&#8722;</button>
  `;
  container.appendChild(controls);

  controls.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (action === "zoom-in") {
      svg.transition().duration(180).call(zoom.scaleBy, 1.5);
    } else if (action === "zoom-out") {
      svg.transition().duration(180).call(zoom.scaleBy, 1 / 1.5);
    }
  });
}

/**
 * Fetch the country borders TopoJSON.
 *
 * Isolated so swapping CDN for a vendored local file (or substituting
 * a different border dataset to apply our liberalist border policy)
 * is a one-function change.
 */
async function fetchCountriesTopology() {
  const res = await fetch(COUNTRIES_TOPOJSON_URL);
  if (!res.ok) {
    throw new Error(
      `Failed to load country borders: ${res.status} ${res.statusText}`
    );
  }
  return res.json();
}
