// src/layers/eu.js
//
// European Union membership overlay.
//
// Highlights the 27 member states of the EU in the union's signature
// gold (taken from the EU flag's circle of stars). See data/orgs/
// eu.json for the membership list.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "eu",
  label: "EU",
  category: "economic",
  description: "European Union member states.",
  // Gold/yellow from the EU flag stars. Distinctive against the
  // blue-tinted NATO overlay when both layers are active (member
  // countries that are in both will show as a teal blend).
  color: "#f5b800",
  dataSource: "data/orgs/eu.json",
});
