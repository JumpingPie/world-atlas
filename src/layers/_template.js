// src/layers/_template.js
//
// Annotated example layer. Copy this file, rename, and edit to add a
// new layer. The leading underscore in the filename keeps this file
// out of the layer auto-discovery scan once that's wired up.
//
// What a layer is: a toggleable overlay that visualizes some relation
// across countries — alliance membership, trade routes, active
// conflicts, etc. See src/layers/README.md for the full contract.

export default {
  id: "_template",
  label: "Template (do not enable)",
  category: "alliance",
  description:
    "A non-functional example. Use it as a starting point for new layers.",

  // Path (relative to repo root) to the JSON the layer reads. The
  // fetcher that produces this file lives in src/fetchers/. Keeping the
  // data path declared here means the loader can prefetch and cache
  // without each layer having to do its own fetching.
  dataSource: "data/orgs/_template.json",

  /**
   * Render the layer onto the map. Called when the user toggles it on.
   *
   * @param {object} mapHandle - The handle returned by initMap(). Use
   *     mapHandle.addOverlay(this.id) to get an SVG group to draw into.
   *     Never reach into the SVG via document.querySelector.
   * @param {object} data - The parsed contents of dataSource.
   */
  render(mapHandle, data) {
    const group = mapHandle.addOverlay(this.id);
    // Example: highlight member countries by ISO code.
    //
    // const memberCodes = new Set(data.members);
    // for (const feature of mapHandle.getCountries()) {
    //   if (!memberCodes.has(feature.properties.iso)) continue;
    //   group
    //     .append("path")
    //     .attr("d", mapHandle.getPath()(feature))
    //     .attr("fill", "#58a6ff")
    //     .attr("opacity", 0.4);
    // }
  },

  /**
   * Remove everything render() added. Called when the user toggles
   * the layer off.
   */
  unrender(mapHandle) {
    mapHandle.removeOverlay(this.id);
  },
};
