# Map layers

Each file in this folder defines one map layer — an overlay that
visualizes some relation between countries (alliance membership, trade
flows, active conflicts, etc.).

Layers are auto-discovered: drop a new file in this folder, and it
appears in the layer panel. There is no central registry to update.

## Layer contract

A layer file must default-export an object with this shape:

```js
export default {
  // Unique identifier. Used in URLs and persisted UI state.
  // Convention: kebab-case, matches the filename basename.
  id: "nato",

  // Human-readable name shown in the layer panel.
  label: "NATO membership",

  // Group heading the layer appears under in the panel.
  // Existing categories: "alliance", "economic", "trade", "conflict",
  // "treaty", "demographic". Add a new category by inventing one.
  category: "alliance",

  // One-line description shown as a tooltip in the layer panel.
  description: "Highlights NATO member states.",

  // Path (relative to repo root) to the JSON file feeding this layer.
  // The data fetcher that produces this file lives in src/fetchers/.
  dataSource: "data/orgs/nato.json",

  // Called when the layer is toggled on. Receives the map handle exposed
  // by src/core/map.js and the loaded data. Should attach DOM nodes via
  // the map handle's API — never reach into the SVG directly.
  render(mapHandle, data) {
    // ...
  },

  // Called when the layer is toggled off. Must remove everything
  // render() added.
  unrender(mapHandle) {
    // ...
  },
};
```

## How to add a new layer

1. Create `src/layers/<your-layer>.js` following the contract above.
2. If your layer needs data not already produced by an existing fetcher,
   add a fetcher under `src/fetchers/` that produces it.
3. Reload the page. The layer appears under its category.

That's it. No imports to update anywhere else.

## Example

See `_template.js` in this folder for a minimal annotated example.
