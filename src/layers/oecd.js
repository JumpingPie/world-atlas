// src/layers/oecd.js
//
// OECD overlay.
//
// 38 mostly-high-income democracies. Indigo fill — distinguishable
// from NATO's brighter blue and the various greens in the palette.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "oecd",
  label: "OECD",
  category: "economic",
  description: "OECD member states.",
  color: "#6e58c0",
  dataSource: "data/orgs/oecd.json",
});
