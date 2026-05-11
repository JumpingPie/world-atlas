// src/layers/aukus.js
//
// AUKUS trilateral security pact overlay.
//
// Three members: Australia, the United Kingdom, the United States.
// Renders in a deep navy that reads as "naval/strategic" without
// duplicating NATO's lighter alliance blue.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "aukus",
  label: "AUKUS",
  category: "alliance",
  description: "AUKUS trilateral security pact (Australia, UK, US).",
  color: "#1f3a66",
  dataSource: "data/orgs/aukus.json",
});
