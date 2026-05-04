// src/core/map.js
//
// The base map renderer.
//
// What this file owns: the SVG element, the geographic projection, the
// zoom/pan behavior, and the country-geometry layer rendered from
// TopoJSON. It is the only file that interacts with d3 selections on the
// map's SVG directly.
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

import * as d3 from "d3";
import * as topojson from "topojson-client";

/**
 * Path to the world country borders TopoJSON. Loaded from CDN in
 * Section 1; will be vendored to data/geo/ in a later section so the
 * site works offline and isn't subject to CDN downtime.
 *
 * The world-atlas package is the standard D3 reference world map,
 * derived from Natural Earth data at 1:110m resolution.
 */
const COUNTRIES_TOPOJSON_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

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
  // distortion, visually familiar. fitSize scales the projection so the
  // world fills the available container.
  const projection = d3.geoEqualEarth();
  const path = d3.geoPath(projection);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("class", "world-map")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // A single root <g> that the zoom transform is applied to. Every
  // overlay lives as a child of this group so zoom/pan affects all
  // layers consistently.
  const root = svg.append("g").attr("class", "map-root");

  // Background ocean rect. Sits behind countries and absorbs clicks on
  // empty water (so clicking the ocean clears any country selection in
  // Section 2 onward).
  root
    .append("rect")
    .attr("class", "map-ocean")
    .attr("width", width)
    .attr("height", height);

  // Sublayer for country geometry. This is the base layer — overlays
  // added by src/layers/ go on top via addOverlay().
  const countriesGroup = root.append("g").attr("class", "map-countries");

  // Container reserved for layers added at runtime. Each layer gets its
  // own <g> child here, keyed by layer id, so it can be cleanly removed.
  const overlaysGroup = root.append("g").attr("class", "map-overlays");

  // Fetch and render the country borders.
  const topology = await fetchCountriesTopology();
  const countries = topojson.feature(topology, topology.objects.countries);

  // Fit the projection to the available space using the actual country
  // geometries — this centers and scales the world correctly regardless
  // of container size or aspect ratio.
  projection.fitSize([width, height], countries);

  countriesGroup
    .selectAll("path.country")
    .data(countries.features)
    .join("path")
    .attr("class", "country")
    // Every country path carries its numeric ISO code as a data attr,
    // so panels and layers can target specific countries via standard
    // CSS/JS selectors without re-binding data.
    .attr("data-iso-numeric", (d) => d.id)
    .attr("d", path);

  // Zoom + pan. Scale extent allows zooming from full-world view (1×) to
  // a mid-range zoom (8×) — sufficient for region-level inspection.
  // We rebuild this in Section 3 when region nesting is added.
  const zoom = d3
    .zoom()
    .scaleExtent([1, 8])
    .on("zoom", (event) => {
      root.attr("transform", event.transform);
    });

  svg.call(zoom);

  // The map handle: the public API other modules use. Keeping this
  // narrow and explicit is what makes the lego-block boundary work.
  const handle = {
    /**
     * Add an overlay layer. Returns the SVG group the layer should
     * render into. The group is keyed by id, so calling addOverlay
     * twice with the same id replaces the previous one.
     *
     * @param {string} id - Layer identifier.
     * @returns {d3.Selection} A <g> element to render into.
     */
    addOverlay(id) {
      // Remove any existing overlay with this id, so re-toggling a
      // layer doesn't leave orphan groups behind.
      overlaysGroup.select(`g[data-overlay-id="${id}"]`).remove();
      return overlaysGroup
        .append("g")
        .attr("data-overlay-id", id)
        .attr("class", `overlay overlay-${id}`);
    },

    /**
     * Remove an overlay by id. Safe to call even if the overlay was
     * never added.
     *
     * @param {string} id
     */
    removeOverlay(id) {
      overlaysGroup.select(`g[data-overlay-id="${id}"]`).remove();
    },

    /**
     * Get the active geographic projection. Layers that need to
     * project lat/lon coordinates (e.g. trade-route arcs) should use
     * this rather than instantiating their own projection.
     */
    getProjection() {
      return projection;
    },

    /**
     * Get the d3 path generator. Layers rendering GeoJSON features
     * should reuse this.
     */
    getPath() {
      return path;
    },

    /**
     * The list of country GeoJSON features. Layers and panels read
     * this rather than fetching the topology themselves.
     */
    getCountries() {
      return countries.features;
    },
  };

  return handle;
}

/**
 * Fetch the country borders TopoJSON.
 *
 * Isolated so that swapping CDN for a vendored local file later (or
 * substituting a different border dataset to apply our liberalist
 * border policy) is a one-function change.
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
