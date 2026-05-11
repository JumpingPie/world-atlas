// src/layers/commonwealth.js
//
// Commonwealth of Nations overlay.
//
// 56 member states — mostly former British dominions, with a small
// number of more recent non-historical accessions (Gabon, Togo,
// Rwanda, Mozambique). Burgundy fill.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "commonwealth",
  label: "Commonwealth",
  category: "intergovernmental",
  description: "Commonwealth of Nations member states.",
  color: "#722a4f",
  dataSource: "data/orgs/commonwealth.json",
});
