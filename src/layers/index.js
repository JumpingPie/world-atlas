// src/layers/index.js
//
// Layer registry — the manifest of map layers.
//
// Mirrors src/panels/index.js: native ES modules can't enumerate
// sibling files at runtime without a build step, so we maintain an
// explicit list. Cost: one new line per layer when adding one.
// Benefit: no build tooling, no dynamic imports, transparent load
// order.
//
// To add a new layer:
//   1. Create src/layers/<your-layer>.js following the contract in
//      src/layers/README.md (or use membershipLayer from
//      _membership-layer.js for "highlight org members" layers).
//   2. Import it here and add it to the array below.
//   3. If the layer needs data, add the JSON file at the path
//      declared by its dataSource field.
//
// Display order in the layer panel comes from a category-based sort
// inside src/core/layer-controls.js, not from the order of this
// array. Within a category, items appear in the order they're listed
// here.
//
// Files starting with _ (e.g. _membership-layer.js) are helpers, not
// layers themselves; they're not imported here.

import natoLayer from "./nato.js";
import euLayer from "./eu.js";
import bricsLayer from "./brics.js";

const layers = [natoLayer, euLayer, bricsLayer];

export default layers;
