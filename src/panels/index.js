// src/panels/index.js
//
// Card registry — the manifest of country-panel cards.
//
// Why this file exists: native ES modules can't enumerate sibling
// files at runtime without a build step, so we maintain an explicit
// list. The trade-off is one line of bookkeeping per new card; the
// upside is no build tooling, no dynamic imports, fully transparent
// load order.
//
// To add a new card:
//   1. Create src/panels/<your-card>.js following the contract in
//      src/panels/README.md.
//   2. Import it here and add it to the array below.
//
// Cards are sorted by their declared `order` field so display order
// reflects the cards' own preferences, not the import order in this
// file. Lower order = higher in the panel.

import statsCard from "./stats.js";
import regionMembersCard from "./region-members.js";

const cards = [statsCard, regionMembersCard];

// Sort once at module load — cards' order values don't change at
// runtime, so re-sorting on every selection would be wasted work.
cards.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

export default cards;
