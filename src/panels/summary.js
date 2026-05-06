// src/panels/summary.js
//
// Wikipedia summary card.
//
// Renders for country selections only. Shows the lead paragraph(s)
// of the country's English Wikipedia article, a thumbnail image (if
// available), the article's short description as a tagline, and an
// outbound link to read the full article.
//
// Lifecycle: render() returns a DOM node immediately containing a
// loading placeholder, then chains two async fetches — first
// wikidata-stats to resolve the Wikipedia title (cached after the
// stats card has fetched it once, so usually free), then the
// summary itself. If the user clicks a different country before
// either resolves, isConnected on the node returns false and we
// drop the stale result.

import { fetchCountryStats } from "../fetchers/wikidata-stats.js";
import { fetchWikipediaSummary } from "../fetchers/wikipedia-summary.js";

/**
 * Build the populated card body once data is in hand.
 *
 * extract_html is preferred over extract because Wikipedia's
 * extract sometimes includes inline emphasis (italics for foreign
 * terms, scientific names, etc.) that look strange when stripped to
 * plain text. The extract_html is small, well-formed, and from a
 * trusted source, so injecting it as innerHTML is safe here.
 */
function renderSummaryBody(data) {
  const thumb = data.thumbnail
    ? `<img class="summary-thumb" src="${data.thumbnail}" alt="" />`
    : "";

  // The short description is one sentence. Skip if it's identical to
  // the title or empty (some entities just don't have one).
  const description =
    data.description && data.description.toLowerCase() !== data.title.toLowerCase()
      ? `<div class="summary-desc">${data.description}</div>`
      : "";

  // Use extract_html if present (preserves inline formatting); fall
  // back to extract wrapped in a <p>. Both come from the same
  // Wikimedia API response so we trust either one as safe to inline.
  const body = data.extractHtml
    ? `<div class="summary-extract">${data.extractHtml}</div>`
    : `<p class="summary-extract">${data.extract ?? ""}</p>`;

  const sourceLink = data.pageUrl
    ? `<div class="summary-source"><a href="${data.pageUrl}" target="_blank" rel="noopener">Read full article on Wikipedia &rarr;</a></div>`
    : "";

  return `${thumb}${description}${body}${sourceLink}`;
}

export default {
  id: "summary",
  label: "Summary",
  order: 20,

  /**
   * Render the card for a given selection.
   *
   * @param {object} selection - { kind, feature } or { kind, region }.
   * @returns {HTMLElement | null}
   */
  render(selection) {
    if (selection?.kind !== "country") return null;
    const country = selection.feature;

    const el = document.createElement("section");
    el.className = "panel-card summary-card";
    el.innerHTML = `
      <div class="card-loading">Loading summary from Wikipedia…</div>
    `;

    // Two-step async chain: stats → title → summary. The first step
    // is usually cache-warm because the stats card has already run
    // its fetch by the time this card renders, so in practice this
    // resolves the title instantly and only the summary GET is on
    // the wire.
    fetchCountryStats(country.id)
      .then((stats) => {
        if (!el.isConnected) return null;
        if (!stats?.wikipediaTitle) {
          el.innerHTML = `
            <div class="card-empty">
              No Wikipedia article linked for this country
              (ISO numeric ${country.id}).
            </div>
          `;
          return null;
        }
        return fetchWikipediaSummary(stats.wikipediaTitle);
      })
      .then((summary) => {
        if (!el.isConnected || !summary) return;
        el.innerHTML = renderSummaryBody(summary);
      })
      .catch((err) => {
        if (!el.isConnected) return;
        console.error("[summary card] fetch failed:", err);
        el.innerHTML = `
          <div class="card-error">
            Failed to load summary: ${err.message}
          </div>
        `;
      });

    return el;
  },
};
