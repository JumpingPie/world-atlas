// src/layers/au.js
//
// African Union overlay.
//
// All 55 African states (54 represented here; SADR/Western Sahara
// is a full AU member but isn't a separate feature in the atlas's
// TopoJSON). Continental green tone.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "au",
  label: "AU",
  category: "intergovernmental",
  description: "African Union member states.",
  color: "#357a3a",
  dataSource: "data/orgs/au.json",
});
