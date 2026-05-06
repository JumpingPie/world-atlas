// src/layers/nato.js
//
// NATO membership overlay.
//
// Highlights the 32 member states of the North Atlantic Treaty
// Organization in the org's signature blue. See
// data/orgs/nato.json for the membership list and accession dates.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "nato",
  label: "NATO",
  category: "alliance",
  description: "North Atlantic Treaty Organization member states.",
  // NATO blue, slightly desaturated from the official flag color so
  // the translucent overlay reads as a tint rather than a solid block.
  color: "#3a6fb3",
  dataSource: "data/orgs/nato.json",
});
