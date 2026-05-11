// src/layers/apec.js
//
// APEC overlay.
//
// 21 Pacific Rim economies. Cyan fill — reads as "Pacific" and
// stays clearly distinct from ASEAN's teal-green and from BRICS's
// warm red.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "apec",
  label: "APEC",
  category: "economic",
  description: "APEC Pacific Rim member economies.",
  color: "#1c8a8e",
  dataSource: "data/orgs/apec.json",
});
