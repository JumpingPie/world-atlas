// src/layers/five-eyes.js
//
// Five Eyes (FVEY) intelligence-sharing alliance overlay.
//
// Five members: Australia, Canada, New Zealand, UK, US. Charcoal
// fill — intelligence work isn't a flag-color affair; the neutral
// dark grey reads as "shared backchannel" rather than competing
// with NATO/AUKUS blue.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "five-eyes",
  label: "Five Eyes",
  category: "alliance",
  description: "Five Eyes signals-intelligence alliance.",
  color: "#4a4a4a",
  dataSource: "data/orgs/five-eyes.json",
});
