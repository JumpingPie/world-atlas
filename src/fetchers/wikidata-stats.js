// src/fetchers/wikidata-stats.js
//
// Fetcher: country structured facts from Wikidata via SPARQL.
//
// What it gets: ISO codes, capital, government type, population, area,
// nominal GDP, currency, continent, head of state, head of government,
// official languages, and the flag image URL. These populate the
// country-stats card in the side panel.
//
// Why Wikidata and not Wikipedia infoboxes: Wikipedia infoboxes are
// scraped from Wikidata anyway, so we're going to the source. Wikidata
// returns typed structured data (numbers as numbers, dates as ISO
// dates, references as Q-IDs we can resolve to labels), which is
// dramatically cleaner to work with than HTML scraping.
//
// CORS: Wikidata's SPARQL endpoint serves CORS headers, so calling it
// from the browser is fine. No proxy needed.
//
// Multi-value handling: many of these properties (currency, official
// language, head of government in some unusual cases) can have
// multiple current values. We use GROUP_CONCAT in SPARQL to collapse
// them into a single pipe-separated string per country, then split
// back into arrays on the JS side. For values that should be single
// (population, area), we use SAMPLE — Wikidata exposes a "truthy"
// statement which is typically the most recent or preferred value.
//
// Limitations to revisit later:
//   - SAMPLE for population/GDP returns *some* value, not guaranteed
//     latest. A later refinement should query qualifiers (P585 point
//     in time) and select the most recent.
//   - We don't track citation/reference info yet — Wikidata exposes
//     this via the `prov:wasDerivedFrom` graph, useful for a research
//     atlas, but adds complexity. Section 8+.

import { getOrFetch } from "../core/data-cache.js";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

// User-Agent is required by Wikimedia API policy. Identifies our app
// in their request logs and lets them contact us if we're causing
// problems. The repo URL is the canonical contact channel.
const USER_AGENT =
  "world-atlas/0.1 (https://github.com/JumpingPie/world-atlas) requests/browser";

// Cache TTL for browser-side Wikidata results. Lines up with the
// 14-day refresh cadence in docs/ARCHITECTURE.md for slow data — no
// point hammering Wikidata for facts that change on a scale of months
// even when no scheduled refresh exists yet.
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Build the SPARQL query for a given ISO 3166-1 numeric code.
 *
 * The query pattern:
 *   1. Find the Wikidata item whose P299 (ISO 3166-1 numeric) matches.
 *   2. OPTIONAL-fetch each property of interest. OPTIONAL means missing
 *      properties don't fail the whole query — important because not
 *      every entity has every property (Vatican has no GDP, etc.).
 *   3. Resolve Q-ID references to English labels via the Wikibase
 *      label service.
 *   4. GROUP_CONCAT multi-valued properties so we get one row per country.
 */
function buildQuery(isoNumeric) {
  // Pad to 3 digits to match Wikidata's stored format (e.g. "276", "008").
  const padded = String(isoNumeric).padStart(3, "0");
  return `
SELECT
  ?country ?countryLabel ?officialName
  ?iso2 ?iso3
  (SAMPLE(?population_) AS ?population)
  (SAMPLE(?area_) AS ?area)
  (SAMPLE(?gdpNominal_) AS ?gdpNominal)
  (SAMPLE(?capitalLabel_) AS ?capitalLabel)
  (SAMPLE(?continentLabel_) AS ?continentLabel)
  (SAMPLE(?flagImage_) AS ?flagImage)
  (GROUP_CONCAT(DISTINCT ?governmentLabel_; separator="|") AS ?governmentLabels)
  (GROUP_CONCAT(DISTINCT ?currencyLabel_; separator="|") AS ?currencyLabels)
  (GROUP_CONCAT(DISTINCT ?headOfStateLabel_; separator="|") AS ?headOfStateLabels)
  (GROUP_CONCAT(DISTINCT ?headOfGovernmentLabel_; separator="|") AS ?headOfGovernmentLabels)
  (GROUP_CONCAT(DISTINCT ?officialLanguageLabel_; separator="|") AS ?officialLanguageLabels)
  (SAMPLE(?wpArticle_) AS ?wpArticle)
WHERE {
  ?country wdt:P299 "${padded}" .
  OPTIONAL { ?country wdt:P1448 ?officialName . FILTER(LANG(?officialName) = "en") }
  # English Wikipedia sitelink. Used downstream by the wikipedia-summary
  # fetcher so we resolve titles from Wikidata's authoritative mapping
  # rather than guessing from country names (which fails for cases like
  # Georgia-the-country vs. Georgia-the-state).
  OPTIONAL {
    ?wpArticle_ schema:about ?country ;
                schema:isPartOf <https://en.wikipedia.org/> .
  }
  OPTIONAL { ?country wdt:P297 ?iso2 . }
  OPTIONAL { ?country wdt:P298 ?iso3 . }
  OPTIONAL { ?country wdt:P1082 ?population_ . }
  OPTIONAL { ?country wdt:P2046 ?area_ . }
  OPTIONAL { ?country wdt:P2131 ?gdpNominal_ . }
  OPTIONAL {
    ?country wdt:P36 ?capital_ .
    ?capital_ rdfs:label ?capitalLabel_ . FILTER(LANG(?capitalLabel_) = "en")
  }
  OPTIONAL {
    ?country wdt:P122 ?government_ .
    ?government_ rdfs:label ?governmentLabel_ . FILTER(LANG(?governmentLabel_) = "en")
  }
  OPTIONAL {
    ?country wdt:P38 ?currency_ .
    ?currency_ rdfs:label ?currencyLabel_ . FILTER(LANG(?currencyLabel_) = "en")
  }
  OPTIONAL {
    ?country wdt:P30 ?continent_ .
    ?continent_ rdfs:label ?continentLabel_ . FILTER(LANG(?continentLabel_) = "en")
  }
  OPTIONAL {
    ?country wdt:P35 ?headOfState_ .
    ?headOfState_ rdfs:label ?headOfStateLabel_ . FILTER(LANG(?headOfStateLabel_) = "en")
  }
  OPTIONAL {
    ?country wdt:P6 ?headOfGovernment_ .
    ?headOfGovernment_ rdfs:label ?headOfGovernmentLabel_ . FILTER(LANG(?headOfGovernmentLabel_) = "en")
  }
  OPTIONAL {
    ?country wdt:P37 ?officialLanguage_ .
    ?officialLanguage_ rdfs:label ?officialLanguageLabel_ . FILTER(LANG(?officialLanguageLabel_) = "en")
  }
  OPTIONAL { ?country wdt:P41 ?flagImage_ . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?country ?countryLabel ?officialName ?iso2 ?iso3
LIMIT 1
  `.trim();
}

/**
 * Run the SPARQL query and return the first (and only) row's bindings,
 * or null if the country has no Wikidata entry by this ISO code.
 */
async function runQuery(isoNumeric) {
  const url = new URL(SPARQL_ENDPOINT);
  url.searchParams.set("query", buildQuery(isoNumeric));
  url.searchParams.set("format", "json");

  const res = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      // The Wikimedia query service requires a User-Agent; setting it
      // from the browser via fetch headers is allowed for SPARQL.
      "Api-User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`Wikidata query failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json.results.bindings[0] ?? null;
}

/**
 * Convert one SPARQL row's bindings into our normalized output shape.
 * Each binding is `{ type, value }`; we extract the .value.
 */
function normalizeRow(row, isoNumeric) {
  const v = (key) => row[key]?.value;
  const splitMulti = (key) =>
    v(key)
      ?.split("|")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const numOrNull = (key) => {
    const raw = v(key);
    if (raw === undefined) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  return {
    _schema: "country-stats/v1",
    _generated: new Date().toISOString(),
    _source: "wikidata",

    // Identity
    isoNumeric: String(isoNumeric).padStart(3, "0"),
    iso2: v("iso2") ?? null,
    iso3: v("iso3") ?? null,
    wikidataId: v("country")?.split("/").pop() ?? null,
    name: v("countryLabel") ?? null,
    officialName: v("officialName") ?? null,

    // Geography & demography
    capital: v("capitalLabel") ?? null,
    continent: v("continentLabel") ?? null,
    population: numOrNull("population"),
    area: numOrNull("area"),

    // Economy
    gdpNominal: numOrNull("gdpNominal"),
    currencies: splitMulti("currencyLabels"),

    // Government
    governmentTypes: splitMulti("governmentLabels"),
    headsOfState: splitMulti("headOfStateLabels"),
    headsOfGovernment: splitMulti("headOfGovernmentLabels"),

    // Culture
    officialLanguages: splitMulti("officialLanguageLabels"),

    // Media
    flagImage: v("flagImage") ?? null,

    // Wikipedia article title, derived from the en.wikipedia.org
    // sitelink URL. Null if the country has no English Wikipedia
    // entry (rare; mostly historical or reserved ISO codes).
    wikipediaTitle: extractWikipediaTitle(v("wpArticle")),
  };
}

/**
 * Extract a Wikipedia page title from an en.wikipedia.org article URL.
 * Wikipedia titles in URLs use underscores for spaces and percent-
 * encoding for non-ASCII; we decode both so the result is the
 * human-readable title (which the REST API also accepts).
 *
 * @param {string|undefined} url - e.g. "https://en.wikipedia.org/wiki/Bosnia_and_Herzegovina"
 * @returns {string|null}        - e.g. "Bosnia and Herzegovina"
 */
function extractWikipediaTitle(url) {
  if (!url) return null;
  const match = url.match(/\/wiki\/(.+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).replace(/_/g, " ");
  } catch {
    // Malformed percent-encoding — return the raw string with
    // underscores converted, which is still a valid Wikipedia title.
    return match[1].replace(/_/g, " ");
  }
}

/**
 * Fetch (or read from cache) the stats for one country.
 *
 * @param {string|number} isoNumeric - ISO 3166-1 numeric code from
 *     the TopoJSON feature.id.
 * @returns {Promise<object|null>} Normalized stats object, or null if
 *     Wikidata has no matching entity (rare; mostly the reserved or
 *     historical numeric codes).
 */
export async function fetchCountryStats(isoNumeric) {
  const key = `wikidata-stats:${String(isoNumeric).padStart(3, "0")}`;
  return getOrFetch(key, TTL_MS, async () => {
    const row = await runQuery(isoNumeric);
    if (!row) return null;
    return normalizeRow(row, isoNumeric);
  });
}

// Default export follows the fetcher contract from
// src/fetchers/README.md, so when the scheduled refresh is added later
// it can iterate this module the same way as every other fetcher.
export default {
  id: "wikidata-stats",
  description: "Country structured facts from Wikidata via SPARQL.",
  refreshIntervalDays: 14,
  outputPath: "data/countries/{countryCode}/stats.json",
  fetch: fetchCountryStats,
};
