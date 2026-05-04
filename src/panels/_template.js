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
   * Render the card for a given country.
   *
   * @param {object} countryData - Aggregated country data (the object
   *     produced by merging all data/countries/{code}/*.json files).
   *     May be missing fields if some fetchers haven't run yet.
   * @returns {HTMLElement | null} A DOM node to append to the panel,
   *     or null to skip this card for this country (e.g. if the data
   *     this card needs isn't available).
   */
  render(countryData) {
    // Skip if we don't have the data this card needs.
    if (!countryData?.someExpectedField) return null;

    const el = document.createElement("section");
    el.className = "panel-card";
    el.innerHTML = `
      <h3>${this.label}</h3>
      <p>Replace this with the card's actual content.</p>
    `;
    return el;
  },
};
