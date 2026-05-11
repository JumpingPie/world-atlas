// src/layers/sco.js
//
// Shanghai Cooperation Organisation overlay.
//
// Ten Eurasian members spanning roughly 60% of the continent's
// landmass. Deep red-brown — distinct from BRICS's warm orange-red
// while signaling the China/Russia-led Eurasian bloc.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "sco",
  label: "SCO",
  category: "alliance",
  description: "Shanghai Cooperation Organisation members.",
  color: "#8a3a30",
  dataSource: "data/orgs/sco.json",
});
