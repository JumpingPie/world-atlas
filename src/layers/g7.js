// src/layers/g7.js
//
// G7 overlay.
//
// Seven major advanced economies. Forest green — distinct from
// other economic-category overlays in the palette.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "g7",
  label: "G7",
  category: "economic",
  description: "Group of Seven major advanced economies.",
  color: "#2e7d4d",
  dataSource: "data/orgs/g7.json",
});
