// src/layers/mercosur.js
//
// Mercosur overlay.
//
// South American customs union — full members only (associate
// members like Chile and Peru are excluded). Lime green keeps it
// distinct from ASEAN's teal-green and from APEC's cyan.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "mercosur",
  label: "Mercosur",
  category: "economic",
  description: "Mercosur full member states.",
  color: "#8ab33a",
  dataSource: "data/orgs/mercosur.json",
});
