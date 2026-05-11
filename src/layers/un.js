// src/layers/un.js
//
// United Nations membership overlay.
//
// Highlights the 193 UN member states in a pale UN blue. Because
// nearly every country on Earth is a member, this layer ships at a
// lower opacity than other membership layers — its job is to read as
// a baseline context ("which countries are part of the formal
// international system?") rather than as a competing color overlay.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "un",
  label: "UN",
  category: "universal",
  description: "United Nations member states (193).",
  color: "#5b92cb",
  dataSource: "data/orgs/un.json",
  opacity: 0.22,
});
