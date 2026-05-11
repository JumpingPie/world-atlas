// src/layers/oas.js
//
// Organization of American States overlay.
//
// 35 states of the Americas. Warm rust — distinct from the various
// blues, greens, and reds elsewhere in the palette, evoking
// "continental Americas" without copying any single member's flag.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "oas",
  label: "OAS",
  category: "intergovernmental",
  description: "Organization of American States member states.",
  color: "#b85f30",
  dataSource: "data/orgs/oas.json",
});
