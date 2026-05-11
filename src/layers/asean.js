// src/layers/asean.js
//
// ASEAN overlay.
//
// Ten Southeast Asian states. Teal-green fill that reads as
// "Southeast Asia" while staying distinguishable from other
// regional-economic overlays.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "asean",
  label: "ASEAN",
  category: "economic",
  description: "ASEAN member states.",
  color: "#3aa68f",
  dataSource: "data/orgs/asean.json",
});
