// src/layers/opec.js
//
// OPEC overlay.
//
// Major oil-producing states. Dark petroleum-brown — reads as the
// commodity the cartel is built around.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "opec",
  label: "OPEC",
  category: "economic",
  description: "OPEC oil-producing member states.",
  color: "#6e4d2e",
  dataSource: "data/orgs/opec.json",
});
