// src/fetchers/wikipedia-summary.js
//
// Fetcher: lead-paragraph article summary from the Wikipedia REST API.
//
// What it gets: the article's title, short description, plain-text
// extract (one or two paragraphs), thumbnail image URL, and the
// canonical page URL. Used by the summary panel card to render
// readable prose alongside the structured Wikidata stats.
//
// Why Wikipedia REST and not the Wikidata description: Wikidata's
// description is one short sentence ("country in Western Europe");
// Wikipedia's extract is a real lede with context. We use both —
// description as a tagline above the extract.
//
// CORS: en.wikipedia.org's REST API returns CORS headers, so calling
// it from the browser is fine. No proxy needed.
//
// Title resolution: this fetcher takes a Wikipedia title, not a
// country code. Title-by-country comes from the existing wikidata-
// stats fetcher (which now also returns wikipediaTitle from the
// Wikidata sitelink). The default-export wraps that resolution
// internally so the scheduled refresh (which iterates per country
// code) can use the same uniform contract as every other fetcher.

import { getOrFetch } from "../core/data-cache.js";
import { fetchCountryStats } from "./wikidata-stats.js";

const REST_API = "https://en.wikipedia.org/api/rest_v1/page/summary";

// User-Agent identifies our app to the Wikimedia REST API. Same
// reasoning as the SPARQL fetcher — required by Wikimedia API policy
// and used in their request logs to find us if we're misbehaving.
const USER_AGENT =
  "world-atlas/0.1 (https://github.com/JumpingPie/world-atlas) requests/browser";

// Cache TTL for browser-side summaries. Wikipedia leads change on
// roughly the same cadence as Wikidata facts (which is to say,
// rarely), so 14 days matches docs/ARCHITECTURE.md slow-data policy.
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Fetch the Wikipedia summary for a given article title.
 *
 * Returns null if Wikipedia has no article at this title (404). All
 * other non-OK responses throw — those are real failures the caller
 * should surface, not "the article doesn't exist."
 *
 * @param {string} title - Wikipedia article title (the human-readable
 *     form, with spaces). encodeURIComponent is applied internally.
 * @returns {Promise<object|null>}
 */
export async function fetchWikipediaSummary(title) {
  if (!title) return null;
  const key = `wikipedia-summary:${title}`;
  return getOrFetch(key, TTL_MS, async () => {
    const url = `${REST_API}/${encodeURIComponent(title)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Api-User-Agent": USER_AGENT,
      },
    });
    // 404 means "no such article." That's a legitimate result for
    // some entities (very small or new states whose Wikipedia
    // coverage is thin), not an error to throw.
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(
        `Wikipedia summary failed: ${res.status} ${res.statusText}`
      );
    }
    const data = await res.json();
    return normalizeSummary(data);
  });
}

/**
 * Convert the REST API response into our normalized output shape.
 * We pick the fields the summary card needs and drop everything
 * else; the card never sees the raw API response so we can change
 * it freely later without rippling through callers.
 */
function normalizeSummary(data) {
  return {
    _schema: "wikipedia-summary/v1",
    _generated: new Date().toISOString(),
    _source: "en.wikipedia.org",

    title: data.title ?? null,
    // displaytitle may include HTML for italics or special characters
    // (e.g. "<i>Côte d'Ivoire</i>"). We keep it because the card
    // renders it as innerHTML for proper italic display of titles
    // like book/album/scientific names.
    displayTitle: data.displaytitle ?? data.title ?? null,
    description: data.description ?? null,
    extract: data.extract ?? null,
    extractHtml: data.extract_html ?? null,
    thumbnail: data.thumbnail?.source ?? null,
    pageUrl: data.content_urls?.desktop?.page ?? null,
  };
}

// Default export follows the fetcher contract from
// src/fetchers/README.md. Per-country call: looks up the country's
// Wikipedia title via wikidata-stats, then chains to the helper
// above. Returning null when there's no resolvable title keeps the
// scheduled refresh from writing empty files.
export default {
  id: "wikipedia-summary",
  description: "Lead-paragraph summary from the Wikipedia REST API.",
  refreshIntervalDays: 14,
  outputPath: "data/countries/{countryCode}/summary.json",

  async fetch(countryCode) {
    const stats = await fetchCountryStats(countryCode);
    if (!stats?.wikipediaTitle) return null;
    return fetchWikipediaSummary(stats.wikipediaTitle);
  },
};
