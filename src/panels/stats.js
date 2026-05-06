// src/panels/stats.js
//
// Country stats card.
//
// Renders a country's structured facts (capital, population, area, GDP,
// government type, head of state, currency, official languages, flag)
// pulled from Wikidata via src/fetchers/wikidata-stats.js.
//
// Lifecycle: render() returns a DOM node immediately containing a
// loading placeholder, then triggers an async fetch that updates the
// node when data arrives. If the user clicks a different country
// before the fetch completes, the node is no longer in the document
// (the panel replaced it), so we use isConnected to detect this and
// silently drop the stale result rather than mutating a detached node.

import { fetchCountryStats } from "../fetchers/wikidata-stats.js";

/**
 * Format a large integer with locale separators (e.g. 83,500,000).
 * Returns "—" for null/undefined so the UI shows a clean unknown
 * marker rather than an empty cell.
 */
function fmtInt(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

/**
 * Format a large number using compact notation (e.g. 4.07T, 357K).
 * Used for GDP where the magnitude matters more than the exact value.
 */
function fmtCompact(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Join a list with commas, returning "—" if empty/missing.
 */
function fmtList(items) {
  if (!items || items.length === 0) return "—";
  return items.join(", ");
}

/**
 * Build the populated stats card body once data is in hand.
 * Returns an HTML string (caller assigns it to innerHTML).
 *
 * Kept as a string template rather than DOM construction because the
 * structure is mostly static — just labels and values — and string
 * templates read more clearly here than dozens of createElement calls.
 */
function renderStatsBody(data) {
  // Wikidata's flag image URLs are bare File: paths in some responses.
  // The SPARQL endpoint usually returns full Commons URLs but we
  // defensively handle both forms.
  const flag =
    data.flagImage && data.flagImage.startsWith("http")
      ? `<img class="stats-flag" src="${data.flagImage}" alt="Flag of ${data.name ?? ""}" />`
      : "";

  const officialName =
    data.officialName && data.officialName !== data.name
      ? `<div class="stats-official-name">${data.officialName}</div>`
      : "";

  return `
    ${flag}
    <div class="stats-name">${data.name ?? "Unknown"}</div>
    ${officialName}
    <dl class="stats-grid">
      <dt>Capital</dt><dd>${data.capital ?? "—"}</dd>
      <dt>Continent</dt><dd>${data.continent ?? "—"}</dd>
      <dt>Population</dt><dd>${fmtInt(data.population)}</dd>
      <dt>Area</dt><dd>${data.area != null ? fmtInt(data.area) + " km²" : "—"}</dd>
      <dt>GDP (nominal)</dt><dd>${data.gdpNominal != null ? "$" + fmtCompact(data.gdpNominal) : "—"}</dd>
      <dt>Government</dt><dd>${fmtList(data.governmentTypes)}</dd>
      <dt>Head of state</dt><dd>${fmtList(data.headsOfState)}</dd>
      <dt>Head of government</dt><dd>${fmtList(data.headsOfGovernment)}</dd>
      <dt>Currency</dt><dd>${fmtList(data.currencies)}</dd>
      <dt>Official language</dt><dd>${fmtList(data.officialLanguages)}</dd>
      <dt>ISO codes</dt><dd>${[data.iso2, data.iso3, data.isoNumeric].filter(Boolean).join(" / ") || "—"}</dd>
    </dl>
    <div class="stats-source">Source: <a href="https://www.wikidata.org/wiki/${data.wikidataId ?? ""}" target="_blank" rel="noopener">Wikidata${data.wikidataId ? " " + data.wikidataId : ""}</a></div>
  `;
}

export default {
  id: "stats",
  label: "Stats",
  order: 10,

  /**
   * Render the card for a given selection.
   *
   * The card applies only to country selections. For region or null
   * selections it returns null and the panel skips it — that's how
   * cards declare their applicability under the typed-selection
   * contract documented in src/panels/README.md.
   *
   * @param {object} selection - { kind, feature } or { kind, region }.
   * @returns {HTMLElement | null}
   */
  render(selection) {
    if (selection?.kind !== "country") return null;
    const country = selection.feature;

    const el = document.createElement("section");
    el.className = "panel-card stats-card";
    el.innerHTML = `
      <div class="card-loading">Loading stats from Wikidata…</div>
    `;

    // Async data load. If the panel moves on (user clicks another
    // country) before this resolves, isConnected is false and we
    // simply drop the result.
    fetchCountryStats(country.id)
      .then((data) => {
        if (!el.isConnected) return;
        if (!data) {
          el.innerHTML = `
            <div class="card-empty">
              No Wikidata entry found for this country
              (ISO numeric ${country.id}).
            </div>
          `;
          return;
        }
        el.innerHTML = renderStatsBody(data);
      })
      .catch((err) => {
        if (!el.isConnected) return;
        console.error("[stats card] fetch failed:", err);
        el.innerHTML = `
          <div class="card-error">
            Failed to load stats: ${err.message}
          </div>
        `;
      });

    return el;
  },
};
