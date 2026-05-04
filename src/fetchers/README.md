# Data fetchers

Each file in this folder pulls data from one external source (Wikipedia,
Wikidata, GDELT, ACLED, World Bank, etc.) and writes a normalized JSON
file under `data/`.

Fetchers are run by the scheduled refresh (a GitHub Action — to be added
in a later section) and can also be run manually for local development.

## Fetcher contract

A fetcher file must default-export an object with this shape:

```js
export default {
  // Unique identifier. Convention: kebab-case, matches filename.
  id: "wikidata-stats",

  // One-line description for logs and the contributor docs.
  description: "Country structured facts from Wikidata.",

  // How many days the produced JSON is considered fresh.
  // The scheduler skips fetchers whose output is younger than this.
  refreshIntervalDays: 14,

  // Output path (relative to repo root). The scheduler writes the
  // fetcher's return value here as JSON.
  outputPath: "data/countries/{countryCode}/stats.json",

  // Async function that produces the data. Receives the country code
  // (ISO 3166-1 alpha-2) and returns an object that will be JSON-
  // serialized to outputPath. The object MUST include _schema,
  // _generated, and _source fields per docs/ARCHITECTURE.md.
  async fetch(countryCode) {
    return {
      _schema: "country-stats/v1",
      _generated: new Date().toISOString(),
      _source: "wikidata",
      countryCode,
      // ... actual data ...
    };
  },
};
```

## How to add a new fetcher

1. Create `src/fetchers/<your-source>.js` following the contract.
2. Decide your output path. Per-country data goes under
   `data/countries/{countryCode}/`. Cross-country data (e.g. trade flows,
   organization rosters) goes under `data/orgs/` or `data/relations/`.
3. The scheduled refresh will pick it up automatically on the next run.

## Why this contract

Centralizing the freshness rule (`refreshIntervalDays`) and output shape
in the fetcher itself means the orchestrator stays simple — it just
iterates fetchers and respects their declared cadences. New sources never
require orchestrator changes.

## Example

See `_template.js` in this folder for a minimal annotated example.
