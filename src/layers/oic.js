// src/layers/oic.js
//
// Organisation of Islamic Cooperation overlay.
//
// 57 Muslim-majority and Muslim-population member states. Darker
// forest green, distinct from the Arab League's brighter green
// since OIC is a strict superset of Arab League membership and
// the two layers will frequently be inspected together.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "oic",
  label: "OIC",
  category: "intergovernmental",
  description: "Organisation of Islamic Cooperation member states.",
  color: "#2a4a30",
  dataSource: "data/orgs/oic.json",
});
