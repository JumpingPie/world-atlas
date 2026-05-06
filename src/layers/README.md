# Map layers

Each file in this folder defines one map layer — an overlay that
visualizes some relation across countries (alliance membership,
economic blocs, trade flows, conflicts, etc.).

Layers are registered in `index.js` (the manifest). The layer
manager (`src/core/layer-manager.js`) watches `state.activeLayers`
and calls each layer's `render` or `unrender` as toggles flip in
the left panel. Layer files don't import from each other or from
the manager — they're self-contained units.

## Layer contract

A layer file must default-export an object with this shape:

```js
export default {
  // Unique identifier. Convention: kebab-case, matches filename.
  id: "nato",

  // Human-readable name shown on the toggle in the layer panel.
  label: "NATO",

  // Group heading the layer appears under. Existing categories:
  // alliance, economic, trade, treaty, conflict, demographic.
  // New categories are valid — define a display name in
  // CATEGORY_LABELS in src/core/layer-controls.js.
  category: "alliance",

  // One-line tooltip shown on the toggle button.
  description: "North Atlantic Treaty Organization member states.",

  // Signature color used for both the panel swatch and the on-map
  // overlay fill. Pick something distinctive against other layers
  // that may be active simultaneously.
  color: "#3a6fb3",

  // Path (relative to repo root) to the JSON file feeding this
  // layer. The layer manager fetches and caches this; render()
  // receives the parsed data as its second argument.
  dataSource: "data/orgs/nato.json",

  // Called when the layer is toggled on. Receives the map handle
  // exposed by initMap and the loaded data. Should attach DOM
  // nodes via the map handle's API (addOverlay) rather than
  // reaching into the SVG directly.
  render(mapHandle, data) {
    // ...
  },

  // Called when the layer is toggled off. Must remove everything
  // render() added.
  unrender(mapHandle) {
    mapHandle.removeOverlay(this.id);
  },
};
```

## How to add a new "highlight org members" layer

If your layer fits the pattern of "highlight the members of
organization X in color Y" (NATO, EU, BRICS, ASEAN, AU, OPEC, etc.),
use the `membershipLayer` helper — it produces a contract-compliant
object from a small config:

```js
// src/layers/asean.js
import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "asean",
  label: "ASEAN",
  category: "economic",
  description: "Association of Southeast Asian Nations.",
  color: "#1a8048",
  dataSource: "data/orgs/asean.json",
});
```

Then add the membership data file at the path you declared:

```json
{
  "_schema": "org-membership/v1",
  "_generated": "2026-05-04T00:00:00Z",
  "_source": "hand-curated",
  "id": "asean",
  "name": "Association of Southeast Asian Nations",
  "shortName": "ASEAN",
  "founded": "1967",
  "members": ["096", "104", "116", ...]
}
```

And register it in `src/layers/index.js`:

```js
import aseanLayer from "./asean.js";
const layers = [natoLayer, euLayer, bricsLayer, aseanLayer];
```

That's it — reload the page, the layer appears in the left panel
under its category, toggling it highlights the members.

## How to add a custom layer

Layers with substantively different visualizations (trade-flow arcs,
conflict markers, choropleth shading, hatched regions) write their
own render/unrender directly without the membership helper.

1. Create `src/layers/<your-layer>.js` exporting a contract object.
2. Implement render to draw whatever you want into the overlay
   group returned by `mapHandle.addOverlay(this.id)`.
3. Implement unrender to call `mapHandle.removeOverlay(this.id)`,
   which removes everything render added.
4. Add data file(s) at the dataSource path.
5. Import and register in `index.js`.

## Examples

Real, populated layer files in this folder:

- `nato.js` — NATO membership (32 states), signature blue.
- `eu.js` — European Union (27 states), signature gold.
- `brics.js` — BRICS (10 states post-2025 expansion), warm red.

All three use the `membershipLayer` helper.

`_template.js` is a minimal annotated example for a custom layer.
`_membership-layer.js` is the shared helper for org-membership-style
layers — files starting with `_` are not auto-discovered as real
layers; they're helpers and templates.

## Why layers are hidden at zoom-tier-1

The world view (zoom-tier-1) shows merged region polygons that cover
individual country geometry. Layer overlays would either visually
conflict with regions or paint inconsistently across them. CSS in
`styles/main.css` hides the `.map-overlays` group at `zoom-tier-1`
so layers fade in only at zoom-tier-2 when countries become visible.

If you build a layer that should be visible at world view (a future
trade-routes layer, for example), override the hiding rule with a
more-specific CSS selector targeting your layer's class.
