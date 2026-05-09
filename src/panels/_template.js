// src/panels/_template.js
//
// Annotated example country-panel card. Copy this file, rename, and
// edit to add a new card to the side panel. The leading underscore
// keeps this file out of the panel auto-discovery scan.
//
// What a card is: one visual section in the side panel that opens when
// a country is clicked. The stats card, Wikipedia summary, timeline,
// and recent-news widgets are all separate cards living in this folder.
// See src/panels/README.md for the full contract.

export default {
  id: "_template",
  label: "Template (do not enable)",

  // Display order in the panel. Lower = higher in the panel.
  // Stats card: 10. Summary: 20. Timeline: 30. News: 40.
  order: 999,

  /**
   * Render the card for a given selection.
   *
   * @param {{kind: "country", feature: object} |
   *         {kind: "region",  region:  object} |
   *         null} selection - Typed selection from the panel.
   * @returns {HTMLElement | null} A DOM node to append to the panel,
   *     or null to skip this card for this selection (e.g. when the
   *     selection.kind doesn't apply to this card type, or the data
   *     this card needs isn't available).
   */
  render(selection) {
    // Cards usually filter by selection.kind first.
    if (selection?.kind !== "country") return null;

    const el = document.createElement("section");
    el.className = "panel-card";
    el.innerHTML = `
      <h3>${this.label}</h3>
      <p>Replace this with the card's actual content.</p>
    `;
    return el;
  },
};
