// src/layers/brics.js
//
// BRICS membership overlay.
//
// Highlights the 10 BRICS member states (the original BRIC plus
// South Africa, the 2024 expansion to include Egypt/Ethiopia/Iran/
// UAE, and Indonesia's 2025 accession). See data/orgs/brics.json
// for the membership list and notes on disputed/declined invitations.

import { membershipLayer } from "./_membership-layer.js";

export default membershipLayer({
  id: "brics",
  label: "BRICS",
  category: "economic",
  description: "BRICS member states (Brazil, Russia, India, China, South Africa, plus 2024–2025 additions).",
  // Warm red. BRICS doesn't have an iconic flag color (the bloc's
  // visual identity uses the five founding members' flag colors
  // collectively), so we pick a distinctive warm tone that reads
  // clearly against blue (NATO) and gold (EU) overlays without
  // muddling visually when memberships overlap.
  color: "#c0492a",
  dataSource: "data/orgs/brics.json",
});
