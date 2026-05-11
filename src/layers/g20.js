// src/layers/g20.js
//
// G20 overlay.
//
// Nineteen nation-state members (plus EU and AU as non-state members,
// which aren't represented here at the state level).

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "g20",
  label: "G20",
  category: "economic",
  description: "Group of Twenty major economies.",
  color: "#7d4d8c",
  dataSource: "data/orgs/g20.json",
});
