// src/fetchers/_template.js
//
// Annotated example fetcher. Copy this file, rename, and edit to add a
// new data source. The leading underscore keeps this file out of the
// fetcher auto-discovery scan once that's wired up.
//
// What a fetcher does: pulls data from one external API, normalizes it
// into a standard shape, and returns it. The scheduler (added in a
// later section) handles writing the result to disk and respecting
// refreshIntervalDays. See src/fetchers/README.md for the full
// contract.

export default {
  id: "_template",
  description: "Non-functional example fetcher. Do not enable.",

  // How fresh the produced data is considered. The scheduler skips
  // fetchers whose existing output is younger than this. Slow-moving
  // data (country stats) -> 14. Fast-moving data (active conflicts) -> 1.
  refreshIntervalDays: 14,

  // Where the scheduler will write fetch()'s return value.
  // {countryCode} is substituted by the scheduler when iterating.
  outputPath: "data/countries/{countryCode}/_template.json",

  /**
   * Pull data for one country. Called by the scheduler with each
   * country's ISO 3166-1 alpha-2 code.
   *
   * Must return an object that the scheduler can JSON.stringify and
   * which begins with the standard metadata fields (_schema,
   * _generated, _source). See docs/ARCHITECTURE.md for the schema rule.
   *
   * @param {string} countryCode - e.g. "DE", "JP", "BR"
   * @returns {Promise<object>}
   */
  async fetch(countryCode) {
    // Example skeleton (commented out so this template is inert):
    //
    // const response = await fetch(`https://api.example.com/${countryCode}`);
    // if (!response.ok) {
    //   throw new Error(`API failed for ${countryCode}: ${response.status}`);
    // }
    // const raw = await response.json();
    //
    // return {
    //   _schema: "example/v1",
    //   _generated: new Date().toISOString(),
    //   _source: "example.com",
    //   countryCode,
    //   value: raw.someField,
    // };

    return null;
  },
};
