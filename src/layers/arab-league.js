// src/layers/arab-league.js
//
// League of Arab States overlay.
//
// 22 Arab states across the Middle East and North Africa. Deep
// green — culturally evocative without literally lifting any one
// member's flag color.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "arab-league",
  label: "Arab League",
  category: "intergovernmental",
  description: "League of Arab States member states.",
  color: "#1a5a30",
  dataSource: "data/orgs/arab-league.json",
});
