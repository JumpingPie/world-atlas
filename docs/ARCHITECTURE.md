# Architecture

This document explains how the project is structured and **why**, so that
future contributors — humans or AI tools — can extend it without reading
every file or re-deriving the design.

If this document and the code disagree, the code is the source of truth,
but a disagreement is a bug: please update one or the other.

## Core principle: lego blocks

Each module is **internally independent** but conforms to a **shared
contract** with other modules of the same kind. This is what makes new
features cheap to add: dropping a new file into the right folder is
usually all it takes.

The test for whether a boundary is correct: *if changing module A forces
you to also change module B, the boundary between them is wrong.* Fix the
contract before adding more modules.

## Three concerns, kept separate

The project has exactly three top-level concerns. They communicate only
through stable data formats — never by reaching into each other's
internals.

1. **Data layer** (`src/fetchers/`, `data/`)
   Pulls raw data from external sources, normalizes it to standard shapes,
   and writes it to JSON files in `data/`. Knows nothing about how data
   will be displayed.

2. **Presentation layer** (`src/core/`, `src/layers/`, `src/panels/`,
   `styles/`, `index.html`)
   Reads JSON files from `data/` and renders the map, layers, and panels.
   Knows nothing about where data came from or how it was generated.

3. **Intelligence layer** (`src/ai/`)
   Optional. Talks to a local Ollama instance to generate summaries and
   comparisons on demand. Knows nothing about the map's internal state;
   it receives plain text input and returns plain text output.

You can replace any one of these without touching the others. If we ever
swap D3 for Leaflet, only the presentation layer changes. If we add a
new data source, only the data layer changes.

## Module contracts

### Layers (`src/layers/`)

Each layer file exports a single layer definition object:

```js
export default {
  id: "nato",                    // Unique identifier
  label: "NATO membership",      // Human-readable name for the UI
  category: "alliance",          // Group it appears under in the layer panel
  description: "...",            // One-line tooltip
  dataSource: "data/orgs/nato.json",  // What JSON file feeds it
  render: (mapHandle, data) => { ... },  // Draws the layer
  unrender: (mapHandle) => { ... },      // Removes the layer cleanly
};
```

To add a new layer: drop a new file in `src/layers/`. The layer registry
auto-discovers it. **No core code changes.**

### Fetchers (`src/fetchers/`)

Each fetcher file exports:

```js
export default {
  id: "wikidata-stats",
  description: "...",
  refreshIntervalDays: 14,       // How stale before refetch
  fetch: async (countryCode) => { ... },  // Returns standardized JSON
};
```

To add a new data source: drop a new file in `src/fetchers/`. The
scheduled refresh runs every fetcher.

### Country-panel cards (`src/panels/`)

Each card file exports:

```js
export default {
  id: "stats",
  label: "Country stats",
  order: 10,                     // Lower = appears higher in panel
  render: (countryData) => HTMLElement,
};
```

To add a new card type to the country panel: drop a new file in
`src/panels/`.

## Data schemas

Every JSON file under `data/` has a `_schema` field at the top:

```json
{
  "_schema": "country/v1",
  "_generated": "2026-04-15T12:00:00Z",
  "_source": "wikidata",
  "countryCode": "DE",
  ...
}
```

Schema versions let us evolve formats safely. When a consumer sees an
unknown version, it should fail loudly rather than silently mis-render.

## Border policy

The atlas treats as a full sovereign state any entity that meets all of:

1. **De facto independent governance** — a functioning government
   exercising effective control over a defined territory.
2. **Popular legitimacy** — that government broadly reflects the will of
   the population it governs.
3. **Independence from foreign military backing** — the entity's
   independence is not principally maintained by an outside power's
   military presence.

Under this rule, full-state status is granted to: Taiwan, Kosovo,
Palestine, Somaliland (and the standard 193 UN members).

Excluded by criterion 3: Transnistria, Abkhazia, South Ossetia, Russian-
occupied Ukrainian territories, Northern Cyprus.

A `showContestedEntities` toggle in the UI surfaces excluded entities as
secondary outlines for users who want to see them.

When a new disputed entity arises, evaluate it against the three criteria
and document the decision in `data/borders/decisions.md`.

## Update cadence

Different data classes refresh at different rates:

- **Slow data** (Wikidata stats, organization memberships, treaty data) —
  every 14 days via scheduled GitHub Action.
- **Fast data** (active conflicts via ACLED, current events via GDELT) —
  more frequent or fetched live from the browser with short TTL caching.

Each fetcher declares its own `refreshIntervalDays` and the scheduler
respects it.

## AI integration

AI features call a local Ollama instance over HTTP. The browser fetches
directly from `http://localhost:11434` (or wherever the user has
configured Ollama to listen). The page never sees an API key because
there isn't one.

For AI features to work cross-origin from a deployed site (e.g.
`*.github.io`), the user must set `OLLAMA_ORIGINS` in their Ollama
environment to allow the site's origin. See `src/ai/ollama.js` for the
integration code and `docs/SETUP.md` for the user-facing setup steps.

When Ollama is unreachable, AI features degrade gracefully: the buttons
are disabled with an explanatory tooltip. The rest of the atlas remains
fully functional.

## What goes where

```
world-atlas/
├── index.html              # Single entry point
├── styles/                 # CSS
├── src/
│   ├── core/               # Map, state, app shell — the load-bearing center
│   ├── layers/             # One file per overlay (alliances, trade, etc.)
│   ├── panels/             # One file per country-panel card type
│   ├── fetchers/           # One file per external data source
│   └── ai/                 # Ollama integration
├── data/                   # JSON outputs from fetchers — committed to git
│   └── cache/              # Local-only cache, gitignored
└── docs/                   # Architecture, conventions, setup, decision log
```
