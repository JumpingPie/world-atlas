// src/layers/_membership-layer.js
//
// Helper for building "highlight the members of organization X" layers.
//
// Why a helper: NATO, EU, BRICS, ASEAN, AU, and any future "this is
// who's in this club" layer all do the same thing — paint a
// translucent fill in the org's signature color over its member
// countries. Without a shared builder, each layer file would
// duplicate ~25 lines of nearly-identical render/unrender logic.
//
// Shape: each membership layer file calls membershipLayer({...})
// once and exports the result. The returned object satisfies the
// layer contract from src/layers/README.md and is registered in
// src/layers/index.js.
//
// Layers with substantively different visualizations (trade-flow
// arcs, conflict markers, choropleth shading by metric) get their
// own files and don't use this helper.

/**
 * Build a layer-contract object for a membership-style overlay.
 *
 * @param {object} cfg
 * @param {string} cfg.id          - Unique layer id; matches filename.
 * @param {string} cfg.label       - Visible name in the layer panel.
 * @param {string} cfg.category    - Group heading (alliance, economic, ...).
 * @param {string} cfg.description - Tooltip text for the toggle.
 * @param {string} cfg.color       - Signature color for the fill.
 * @param {string} cfg.dataSource  - Path to the membership JSON file.
 * @param {number} [cfg.opacity=0.5] - Fill opacity for member countries.
 * @returns {object} Layer contract object.
 */
export function membershipLayer(cfg) {
  return {
    id: cfg.id,
    label: cfg.label,
    category: cfg.category,
    description: cfg.description,
    color: cfg.color,
    dataSource: cfg.dataSource,

    /**
     * Render this layer onto the map. Called by the layer manager
     * with the parsed contents of dataSource.
     *
     * Member countries are filtered from the full country list, then
     * one <path> per member is appended to the layer's overlay group
     * with the layer's signature color and a translucent fill. The
     * paths sit above the country fills but below labels (the SVG
     * group order in src/core/map.js puts overlays between countries
     * and label groups).
     *
     * pointer-events:none means clicks pass through to the country
     * paths beneath, so users can still select a country whose layer
     * highlight is currently overlapping.
     */
    render(mapHandle, data) {
      const memberSet = new Set(
        (data?.members ?? []).map((s) => String(s).padStart(3, "0"))
      );
      const memberFeatures = mapHandle
        .getCountries()
        .filter((f) => memberSet.has(String(f.id).padStart(3, "0")));

      const group = mapHandle.addOverlay(this.id);
      group
        .selectAll("path.layer-feature")
        .data(memberFeatures)
        .join("path")
        .attr("class", `layer-feature layer-feature-${this.id}`)
        .attr("d", mapHandle.getPath())
        .attr("fill", this.color)
        .attr("opacity", cfg.opacity ?? 0.5)
        .attr("pointer-events", "none");
    },

    /**
     * Remove this layer from the map. Called by the layer manager
     * when the layer is toggled off.
     */
    unrender(mapHandle) {
      mapHandle.removeOverlay(this.id);
    },
  };
}
