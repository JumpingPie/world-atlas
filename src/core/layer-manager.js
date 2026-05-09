// src/core/layer-manager.js
//
// Reconciles state.activeLayers with what's actually rendered on the
// map. Layers that are in activeLayers but not yet rendered get
// loaded and rendered; layers that are rendered but no longer in
// activeLayers get unrendered.
//
// What this owns:
//   - Tracking which layers are currently rendered.
//   - Fetching layer data files (through the existing data-cache).
//   - Calling each layer's render(mapHandle, data) and
//     unrender(mapHandle) at the right times.
//
// What this does NOT own:
//   - The visual content of any layer (that's in src/layers/<id>.js).
//   - The toggle UI (that's src/core/layer-controls.js).
//   - The activeLayers state itself (that's src/core/state.js).
//
// Layers communicate with the rest of the app strictly through:
//   - state.activeLayers (set/cleared by layer controls)
//   - the map handle returned by initMap (for adding overlay groups)
//
// No layer file imports from this manager, and no other module
// imports a specific layer. Adding a new layer never touches this
// file.

import { on, getState } from "./state.js";
import { getOrFetch } from "./data-cache.js";
import layers from "../layers/index.js";

// Cache TTL for layer data files. Membership lists change rarely
// (NATO accessions are years apart), so 14 days matches the slow-data
// policy in docs/ARCHITECTURE.md.
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

// Index of registered layers by id, built once at module load. The
// manifest is small (~3-20 entries) so a Map is fine; we don't need
// anything fancier.
const layerById = new Map(layers.map((l) => [l.id, l]));

// Set of layer ids currently rendered onto the map. Compared against
// state.activeLayers each sync() to figure out what to add or remove.
// Module-level rather than per-init because there's only one map.
const renderedLayerIds = new Set();

// The map handle, captured at init. Layer render/unrender require it
// but the state event handler doesn't have it in scope otherwise.
let mapHandleRef = null;

/**
 * Wire the layer manager up to state. Call once at app startup,
 * after initMap resolves.
 *
 * @param {object} mapHandle - Returned by initMap; passed to each
 *     layer's render and unrender.
 */
export function initLayerManager(mapHandle) {
  mapHandleRef = mapHandle;
  on("activeLayers", (active) => {
    // sync is async (data fetching) but we don't await — the manager
    // is fire-and-forget from the state event channel. Errors are
    // logged by sync itself, not propagated.
    sync(active);
  });
  // Initial sync covers the case where activeLayers was set before
  // this module ran (e.g. preserved from URL state in a future
  // section).
  sync(getState().activeLayers);
}

/**
 * Bring the rendered layers in line with the desired set.
 *
 * @param {Set<string>} activeIds - The desired set of active layer
 *     ids (read from state).
 */
async function sync(activeIds) {
  if (!mapHandleRef) return;

  // Render layers that should be active but aren't yet. Each layer
  // is rendered independently so a failure in one doesn't block
  // others — a misconfigured fetcher shouldn't take down the whole
  // panel.
  for (const id of activeIds) {
    if (renderedLayerIds.has(id)) continue;
    const layer = layerById.get(id);
    if (!layer) {
      console.warn(`[layer-manager] unknown layer id: "${id}"`);
      continue;
    }
    try {
      const data = await loadLayerData(layer);
      layer.render(mapHandleRef, data);
      renderedLayerIds.add(id);
    } catch (err) {
      console.error(
        `[layer-manager] failed to render layer "${id}":`,
        err
      );
    }
  }

  // Unrender layers that are rendered but no longer active. Iterate
  // a copy so deletions inside the loop don't affect iteration.
  for (const id of [...renderedLayerIds]) {
    if (activeIds.has(id)) continue;
    const layer = layerById.get(id);
    try {
      layer?.unrender?.(mapHandleRef);
    } catch (err) {
      console.error(
        `[layer-manager] failed to unrender layer "${id}":`,
        err
      );
    }
    renderedLayerIds.delete(id);
  }
}

/**
 * Fetch a layer's data file through the cache. Returns null if the
 * layer doesn't declare a dataSource (some future layers might be
 * fully self-contained without external data).
 */
async function loadLayerData(layer) {
  if (!layer.dataSource) return null;
  const key = `layer-data:${layer.id}`;
  return getOrFetch(key, TTL_MS, async () => {
    const res = await fetch(layer.dataSource);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch ${layer.dataSource}: ${res.status} ${res.statusText}`
      );
    }
    return res.json();
  });
}
