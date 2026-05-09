// src/panels/summary.js
//
// Wikipedia summary card with tabs.
//
// Renders for country selections only. Two tabs by default:
//
//   - Lead: lead-paragraph extract from the Wikipedia REST summary
//     endpoint (thumbnail, short description, and the article's
//     opening paragraphs).
//   - History: the article's "History" H2 section, fetched
//     separately via the Action API only when the tab is activated.
//
// Both tabs share the same Wikipedia title, resolved up-front from
// Wikidata (so we use the canonical sitelink rather than guessing
// the title from the country's display name). The first fetch
// (Wikidata stats) is usually cache-warm because the stats card
// has already loaded it.
//
// The tabs helper handles loading/empty/error states for each tab
// and caches results so re-clicking a previously-loaded tab is
// instant — only the *first* visit to a tab triggers a network call.

import { createTabs } from "../core/tabs.js";
import { fetchCountryStats } from "../fetchers/wikidata-stats.js";
import { fetchWikipediaSummary } from "../fetchers/wikipedia-summary.js";
import { fetchWikipediaSection } from "../fetchers/wikipedia-section.js";

/**
 * Build the Lead tab's content from a Wikipedia summary response.
 * Returns the assembled DOM node, or null if there's nothing to show.
 *
 * extract_html is preferred over plain extract because Wikipedia's
 * extract sometimes contains inline emphasis (italics for foreign
 * terms, scientific names, etc.) that look strange when stripped to
 * plain text. The HTML is small and well-formed and comes from a
 * trusted Wikimedia API, so injecting it via innerHTML is safe.
 */
function renderLead(data) {
  if (!data) return null;
  const div = document.createElement("div");
  div.className = "summary-lead";

  const thumb = data.thumbnail
    ? `<img class="summary-thumb" src="${data.thumbnail}" alt="" />`
    : "";

  const description =
    data.description &&
    data.description.toLowerCase() !== (data.title ?? "").toLowerCase()
      ? `<div class="summary-desc">${data.description}</div>`
      : "";

  const body = data.extractHtml
    ? `<div class="summary-extract">${data.extractHtml}</div>`
    : `<p class="summary-extract">${data.extract ?? ""}</p>`;

  const sourceLink = data.pageUrl
    ? `<div class="summary-source"><a href="${data.pageUrl}" target="_blank" rel="noopener">Read full article on Wikipedia &rarr;</a></div>`
    : "";

  div.innerHTML = `${thumb}${description}${body}${sourceLink}`;
  return div;
}

/**
 * Build the History tab's content from raw section HTML.
 *
 * Wikipedia's section HTML includes:
 *   - <p> paragraphs of body text
 *   - <h3>/<h4> headings for sub-sections
 *   - <a href="/wiki/X"> internal links — we leave the path relative
 *     and let CSS choose how they appear; clicking them navigates to
 *     Wikipedia's site only because of the absolute URL we set below.
 *   - <sup class="reference"> citation markers — left in for now;
 *     a later polish pass can strip these via CSS for cleaner reading.
 *
 * We rewrite relative `/wiki/...` and `//upload.wikimedia.org/...`
 * URLs to absolute en.wikipedia.org/upload origins so links and
 * images work outside Wikipedia's own domain.
 */
function renderHistorySection(html) {
  if (!html) return null;

  const div = document.createElement("div");
  div.className = "summary-section summary-history";
  div.innerHTML = html;

  // Rewrite relative links to absolute en.wikipedia.org URLs so
  // clicking them goes somewhere useful. Open in a new tab.
  div.querySelectorAll('a[href^="/wiki/"]').forEach((a) => {
    a.setAttribute("href", `https://en.wikipedia.org${a.getAttribute("href")}`);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
  });

  // Same for protocol-relative image URLs (Wikipedia uses these for
  // upload.wikimedia.org assets).
  div.querySelectorAll('img[src^="//"]').forEach((img) => {
    img.setAttribute("src", `https:${img.getAttribute("src")}`);
  });

  return div;
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

    // Resolve the Wikipedia title from Wikidata first. Both tabs use
    // the same title, so we do this once at card init rather than
    // duplicating the lookup in each tab's load().
    fetchCountryStats(country.id)
      .then((stats) => {
        if (!el.isConnected) return;
        if (!stats?.wikipediaTitle) {
          el.innerHTML = `
            <div class="card-empty">
              No Wikipedia article linked for this country
              (ISO numeric ${country.id}).
            </div>
          `;
          return;
        }

        const title = stats.wikipediaTitle;

        // Each tab declares its async load function. The tabs helper
        // calls these lazily on first activation and caches results.
        const tabs = [
          {
            id: "lead",
            label: "Lead",
            load: () => fetchWikipediaSummary(title).then(renderLead),
          },
          {
            id: "history",
            label: "History",
            // /^history$/i matches an exact "History" H2; falls back
            // to any section containing "history" if the article uses
            // a non-standard heading. The fetcher handles both cases.
            load: () =>
              fetchWikipediaSection(title, /^history$/i).then(
                renderHistorySection
              ),
          },
        ];

        el.innerHTML = "";
        el.appendChild(createTabs(tabs, { defaultTab: "lead" }));
      })
      .catch((err) => {
        if (!el.isConnected) return;
        console.error("[summary card] init fetch failed:", err);
        el.innerHTML = `
          <div class="card-error">
            Failed to load summary: ${err.message}
          </div>
        `;
      });

    return el;
  },
};
