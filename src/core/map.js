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
//
// Edge-of-screen autopan was tried and removed: with multi-panel UI
// chrome around the map, moving the mouse to reach buttons (Layers,
// Theme, the panel close X, the timeline handle) was triggering pan
// when the user was just navigating to a control. Drag-pan and
// trackpad-swipe cover the same need without that misfire.

import * as d3 from "d3";
import * as topojson from "topojson-client";
import { setSelection, on } from "./state.js";

/**
 * Path to the world country borders TopoJSON. Loaded from CDN in
 * Section 1; will be vendored to data/geo/ in a later section so the
 * site works offline and isn't subject to CDN downtime.
 */
const COUNTRIES_TOPOJSON_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

/**
 * Path to the regions data file. See data/geo/regions.json for the
 * authoritative country-to-region mapping. The file is loaded once
 * at startup; changes to it require a reload but do not require any
 * code changes.
 */
const REGIONS_DATA_URL = "data/geo/regions.json";

/** Base on-screen size of country labels, in pixels. The label group's
 *  font-size is counter-scaled by the inverse of the zoom transform's k
 *  so labels stay this size regardless of zoom level. */
const LABEL_BASE_SIZE = 11;

/** Base on-screen size of region labels, in pixels. Larger than
 *  country labels because region labels stand alone at the world
 *  view and need to read at a glance. */
const REGION_BASE_SIZE = 18;

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

  // Graticule: latitude/longitude grid lines. Always rendered; its
  // visibility is controlled by the --color-graticule CSS variable,
  // which is transparent in the default theme and opaque in the
  // atlas theme. This keeps theming purely a CSS concern — no JS
  // branches on theme state.
  const graticuleGroup = root.append("g").attr("class", "map-graticule");

  const countriesGroup = root.append("g").attr("class", "map-countries");
  // Region polygons (merged country geometries grouped by region).
  // Ordered above countries so when zoom-tier-1 is active the region
  // fills paint on top, hiding individual country borders. CSS
  // hides this group at zoom-tier-2+ so countries become visible.
  const regionsGroup = root.append("g").attr("class", "map-regions");
  const overlaysGroup = root.append("g").attr("class", "map-overlays");
  // Country labels: ordered above overlays so they paint on top.
  const labelsGroup = root
    .append("g")
    .attr("class", "map-labels")
    .attr("font-size", `${LABEL_BASE_SIZE}px`);
  // Region labels: separate group, only visible at zoom-tier-1.
  // Ordered last so they paint above country labels (relevant if
  // both groups are ever simultaneously visible during a transition).
  const regionLabelsGroup = root
    .append("g")
    .attr("class", "map-region-labels")
    .attr("font-size", `${REGION_BASE_SIZE}px`);

  // Fetch country topology and regions data in parallel — neither
  // depends on the other and both need to resolve before geometry
  // can render.
  const [topology, regionsData] = await Promise.all([
    fetchCountriesTopology(),
    fetchRegionsData(),
  ]);
  const countries = topojson.feature(topology, topology.objects.countries);

  // Build region features by merging the country geometries listed
  // for each region. Each region gets one merged GeoJSON Feature
  // with a MultiPolygon geometry covering the union of its members.
  // We retain the region metadata (label position, country list) on
  // the feature's properties so click and label code can read it
  // directly from the d3 datum without extra lookups.
  const regions = buildRegionFeatures(topology, regionsData);

  // Fit the projection to the available space using the actual
  // country geometries — centers and scales the world correctly
  // regardless of container size or aspect ratio.
  projection.fitSize([width, height], countries);

  // d3.geoGraticule10() returns a single MultiLineString covering the
  // world at 10° spacing — fine enough to read as a real graticule
  // without overwhelming the world view. Rendered as one path for
  // efficiency.
  graticuleGroup
    .append("path")
    .attr("class", "graticule")
    .attr("d", path(d3.geoGraticule10()))
    .attr("fill", "none");

  countriesGroup
    .selectAll("path.country")
    .data(countries.features)
    .join("path")
    .attr("class", "country")
    .attr("data-iso-numeric", (d) => d.id)
    .attr("d", path)
    .on("click", (event, feature) => {
      // The map's only job on click is to publish the selection.
      // setSelection enforces the country/region mutual exclusion
      // so we don't have to remember to clear selectedRegion here.
      event.stopPropagation();
      setSelection("country", feature);
    });

  // Region polygons. One path per region; click selects the whole
  // region. Visibility is controlled by CSS based on the SVG's
  // zoom-tier class — at zoom-tier-1 these are visible and clickable;
  // at zoom-tier-2+ they're hidden and country clicks take over.
  regionsGroup
    .selectAll("path.region")
    .data(regions)
    .join("path")
    .attr("class", "region")
    .attr("data-region-name", (d) => d.properties.name)
    .attr("d", path)
    .on("click", (event, region) => {
      event.stopPropagation();
      setSelection("region", region);
    });

  // Country name labels with per-country zoom thresholds.
  //
  // Why per-country instead of a global tier system: a country's label
  // is only useful when the country is rendered wide enough for the
  // text to fit. A rank-based tier (top 25 / next 50 / rest) ignores
  // name length entirely — Bosnia and Herzegovina is geographically
  // medium-sized but its name is so long that the label still won't
  // fit at the same zoom as Brazil. Computing the threshold from
  // (label width) / (country bbox width) gets every country to appear
  // exactly when there's room for it.
  //
  // requiredK is clamped to [2, 8]:
  //   2 → minimum zoom at which any country labels show; below this
  //       we're showing continent labels instead.
  //   8 → maximum zoom in our scaleExtent. Tiny countries with long
  //       names (Vatican City, Liechtenstein) get clamped here so
  //       they're still labeled at max zoom even if cramped — better
  //       than never being labeled.
  //
  // The 0.55 multiplier on name.length is a rough sans-serif average
  // glyph width relative to font size. Wide enough not to clip
  // genuinely long names, narrow enough that wide-set labels (mostly
  // capitals) still resolve correctly.
  const labelData = countries.features
    .map((f) => {
      // For multi-polygon features (countries with disparate
      // territories like France's Guiana/Réunion or Norway's
      // Svalbard), compute centroid and bounds on the LARGEST
      // polygon only — using the whole feature would area-weight
      // the centroid into the ocean. See pickLabelPolygon for the
      // rationale and pickLargestPolygon for the geometry math.
      const labelFeature = pickLabelPolygon(f);
      const [cx, cy] = path.centroid(labelFeature);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
      const bounds = path.bounds(labelFeature);
      const bboxWidth = Math.max(1, bounds[1][0] - bounds[0][0]);
      const name = f.properties?.name ?? "";
      const labelWidth = name.length * 0.55 * LABEL_BASE_SIZE;
      const requiredK = Math.max(
        2,
        Math.min(8, labelWidth / bboxWidth)
      );
      // We retain the feature (full geometry) for click hits but
      // also retain labelFeature (mainland-only) for refit() to
      // recompute against on resize without redoing the largest-
      // polygon search.
      return { feature: f, labelFeature, cx, cy, requiredK, name };
    })
    .filter((d) => d != null);

  labelsGroup
    .selectAll("text.country-label")
    .data(labelData)
    .join("text")
    .attr("class", "country-label")
    .attr("transform", (d) => `translate(${d.cx}, ${d.cy})`)
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .text((d) => d.name);

  // Region labels for zoom-tier-1. Each region's labelAt comes from
  // regions.json, hand-positioned at the region's visual center.
  // We retain the original [lon, lat] in the bound datum (rather
  // than just storing the projected x/y) so the resize handler can
  // re-project on container resize without a separate lookup.
  const regionLabelData = regions
    .map((region) => {
      const projected = projection(region.properties.labelAt);
      if (!projected || !Number.isFinite(projected[0])) return null;
      return {
        name: region.properties.name,
        coords: region.properties.labelAt,
        x: projected[0],
        y: projected[1],
      };
    })
    .filter((d) => d != null);

  regionLabelsGroup
    .selectAll("text.region-label")
    .data(regionLabelData)
    .join("text")
    .attr("class", "region-label")
    .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .text((d) => d.name);

  // Clicking the ocean clears any selection. Attached after country
  // and region handlers so element clicks (which stopPropagation)
  // win when present.
  root.select("rect.map-ocean").on("click", () => {
    setSelection(null);
  });

  // Reflect country selection visually. The map listens to state.js
  // — the panel doesn't tell it directly. Keeps data flow one-way.
  on("selectedCountry", (country) => {
    countriesGroup
      .selectAll("path.country")
      .classed("is-selected", (d) => country != null && d.id === country.id)
      .classed("is-dimmed", (d) => country != null && d.id !== country.id);
  });

  // Same treatment for region selection — highlight the selected
  // region's merged polygon and dim the others.
  on("selectedRegion", (region) => {
    regionsGroup
      .selectAll("path.region")
      .classed(
        "is-selected",
        (d) => region != null && d.properties.name === region.properties.name
      )
      .classed(
        "is-dimmed",
        (d) => region != null && d.properties.name !== region.properties.name
      );
  });

  // ------------------------------------------------------------------
  // Pan/zoom behavior. Trackpad-friendly: see the file header comment.
  // ------------------------------------------------------------------

  const zoom = d3
    .zoom()
    .scaleExtent([1, 8])
    // Constrain panning to the SVG bounds. At k=1 (world view) the
    // viewport already fills these bounds, so no panning is possible
    // — clicking-and-dragging won't do anything, which is correct
    // because there's nowhere to pan to. At higher zoom the viewport
    // is smaller in world coordinates and panning is allowed within
    // the bounds. Without this, users can drag the map entirely off
    // screen and end up looking at a black void.
    .translateExtent([
      [0, 0],
      [width, height],
    ])
    // Suppress d3.zoom's built-in wheel handler; we do our own below
    // so two-finger trackpad swipe pans (rather than zooming as it
    // would by default). Drag-to-pan still goes through d3.zoom.
    .filter((event) => {
      if (event.type === "wheel") return false;
      return !event.button;
    })
    .on("zoom", (event) => {
      const k = event.transform.k;
      root.attr("transform", event.transform);
      // Counter-scale label fonts so labels stay constant on-screen
      // size regardless of zoom level. Both label groups get the
      // same treatment because both live inside the transformed root.
      labelsGroup.attr("font-size", `${LABEL_BASE_SIZE / k}px`);
      regionLabelsGroup.attr("font-size", `${REGION_BASE_SIZE / k}px`);
      // Per-label visibility: a country label only shows once the
      // country is wide enough on screen for its name to fit.
      // requiredK was precomputed from each country's bbox width and
      // its name length.
      labelsGroup
        .selectAll("text.country-label")
        .style("opacity", (d) => (k >= d.requiredK ? null : 0));
      // Apply zoom-tier class so CSS can swap continent labels in/out
      // and fade country borders at the lowest zoom.
      const tier = k >= 4 ? 3 : k >= 2 ? 2 : 1;
      svg.attr("class", `world-map zoom-tier-${tier}`);
    });

  svg.call(zoom);

  // Custom wheel handler: trackpad pinch zooms, plain wheel pans.
  setupTrackpadGestures(svg, zoom);

  // On-screen zoom buttons. We need these because the trackpad-first
  // wheel scheme above leaves mouse-wheel users with no scroll-zoom.
  addZoomControls(container, svg, zoom);

  // Resize handling. When the map container size changes (most
  // commonly because the user toggled a side or bottom panel), we
  // refit the projection to the new dimensions and re-render the
  // geometry. Without this the SVG just letterboxes via
  // preserveAspectRatio, which works visually but wastes available
  // space and makes the map awkwardly small when panels are open.
  //
  // The user's current zoom transform is preserved across resizes
  // (we don't reset to identity), so opening a panel doesn't snap
  // them out of a region they were inspecting.
  function refit() {
    const rect = container.getBoundingClientRect();
    const newW = rect.width;
    const newH = rect.height;
    // Skip degenerate sizes — happens briefly when the page is
    // initializing or hidden behind a 0-width animation frame.
    if (newW < 10 || newH < 10) return;

    svg.attr("viewBox", `0 0 ${newW} ${newH}`);
    root
      .select("rect.map-ocean")
      .attr("width", newW)
      .attr("height", newH);

    // Refit projection to new container dimensions, then re-render
    // every path with the same path generator (it picks up the
    // updated projection automatically).
    projection.fitSize([newW, newH], countries);
    countriesGroup.selectAll("path.country").attr("d", path);
    regionsGroup.selectAll("path.region").attr("d", path);
    graticuleGroup
      .select("path.graticule")
      .attr("d", path(d3.geoGraticule10()));

    // Country labels: recompute centroid and requiredK in place.
    // We use d.labelFeature (the largest polygon, picked at init)
    // rather than d.feature so multi-territory countries don't have
    // their centroids pulled into the ocean by overseas islands.
    // The bound datum is mutated, so the next zoom-handler tick
    // will see the new requiredK without rebinding.
    labelsGroup.selectAll("text.country-label").attr("transform", function (d) {
      const [cx, cy] = path.centroid(d.labelFeature);
      if (!Number.isFinite(cx)) return null;
      d.cx = cx;
      d.cy = cy;
      const bounds = path.bounds(d.labelFeature);
      const bboxWidth = Math.max(1, bounds[1][0] - bounds[0][0]);
      const labelWidth = d.name.length * 0.55 * LABEL_BASE_SIZE;
      d.requiredK = Math.max(2, Math.min(8, labelWidth / bboxWidth));
      return `translate(${cx}, ${cy})`;
    });

    // Region labels: re-project the original [lon, lat] (which we
    // kept on the datum as `coords`) to new screen coordinates.
    regionLabelsGroup
      .selectAll("text.region-label")
      .attr("transform", function (d) {
        const projected = projection(d.coords);
        if (!projected || !Number.isFinite(projected[0])) return null;
        d.x = projected[0];
        d.y = projected[1];
        return `translate(${projected[0]}, ${projected[1]})`;
      });

    // Update the zoom translateExtent to the new bounds. We then
    // re-apply the current transform so d3 re-clamps it within the
    // new extent (pan position may now be out of bounds if the
    // container shrank). Reapplying the same transform is a no-op
    // when in-bounds and a clamp when not.
    zoom.translateExtent([
      [0, 0],
      [newW, newH],
    ]);
    const current = d3.zoomTransform(svg.node());
    svg.call(zoom.transform, current);
  }

  // ResizeObserver fires repeatedly during the panel transition
  // (220ms). Refitting every frame is cheap enough — d3 update of
  // ~250 paths is well within budget — so we don't debounce; the
  // map smoothly tracks the panel animation rather than snapping
  // at the end.
  const resizeObserver = new ResizeObserver(() => refit());
  resizeObserver.observe(container);

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
 * Pick a substitute Feature for label positioning when a country
 * has disparate territories.
 *
 * Why: d3.geoPath().centroid() and .bounds() compute on the WHOLE
 * geometry of the feature. For a Feature whose territories span
 * thousands of kilometers (France's mainland + French Guiana +
 * Réunion + La Polynésie, USA's mainland + Alaska + Hawaii, Norway
 * + Svalbard, etc.), the area-weighted centroid lands somewhere
 * unhelpful — often the ocean — and the bounding box covers an
 * implausibly wide span which makes requiredK far too low.
 *
 * Fix: for MultiPolygon features, return a synthetic Feature
 * containing only the largest polygon by spherical area. Single-
 * polygon features pass through unchanged. The original feature is
 * still used for hit testing and full-geometry rendering — we only
 * substitute for label-position calculations.
 *
 * The synthetic Feature retains the original's properties, which
 * is what callers use to read country name, ISO code, etc.
 */
function pickLabelPolygon(feature) {
  if (feature.geometry?.type !== "MultiPolygon") return feature;

  let biggestArea = -Infinity;
  let biggestCoords = null;
  for (const polyCoords of feature.geometry.coordinates) {
    const polyFeature = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: polyCoords },
    };
    // d3.geoArea returns spherical area in steradians — invariant
    // under projection, so this works regardless of which projection
    // is currently active.
    const area = d3.geoArea(polyFeature);
    if (area > biggestArea) {
      biggestArea = area;
      biggestCoords = polyCoords;
    }
  }

  if (!biggestCoords) return feature;

  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: biggestCoords },
    properties: feature.properties,
    id: feature.id,
  };
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

/**
 * Fetch the regions data file (country-to-region mapping plus label
 * positions). See data/geo/regions.json for the file's authoritative
 * contents and notes on choices made.
 */
async function fetchRegionsData() {
  const res = await fetch(REGIONS_DATA_URL);
  if (!res.ok) {
    throw new Error(
      `Failed to load regions data: ${res.status} ${res.statusText}`
    );
  }
  return res.json();
}

/**
 * Build region GeoJSON Features by merging country geometries.
 *
 * For each region in the data file, finds the matching country
 * geometries in the topology (by ISO numeric code), merges them with
 * topojson.merge, and produces a Feature whose properties carry the
 * region's name, label position, and member country IDs. These
 * properties survive into the d3 datum so click handlers and label
 * code can read them directly without separate lookups.
 *
 * @param {object} topology - Loaded TopoJSON.
 * @param {object} regionsData - Parsed contents of regions.json.
 * @returns {Array<object>} GeoJSON Features, one per region.
 */
function buildRegionFeatures(topology, regionsData) {
  const allGeoms = topology.objects.countries.geometries;
  const result = [];
  for (const [name, info] of Object.entries(regionsData.regions)) {
    // ISO codes in the topology may be numbers, strings, or zero-
    // padded strings depending on the dataset. Normalize both sides
    // to three-digit zero-padded strings before comparing.
    const wanted = new Set(info.iso.map((s) => String(s).padStart(3, "0")));
    const geoms = allGeoms.filter((g) =>
      wanted.has(String(g.id).padStart(3, "0"))
    );
    if (geoms.length === 0) {
      // A region with no resolvable members — likely a typo in the
      // ISO list or a country missing from the 110m TopoJSON. Log
      // and continue rather than throwing, so the rest of the world
      // still renders.
      console.warn(
        `[map] region "${name}" has no member geometries in the topology`
      );
      continue;
    }
    const merged = topojson.merge(topology, geoms);
    result.push({
      type: "Feature",
      geometry: merged,
      properties: {
        name,
        labelAt: info.labelAt,
        countryIds: info.iso,
      },
    });
  }
  return result;
}
