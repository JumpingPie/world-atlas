# world-atlas

An interactive research atlas for analyzing the state of the world: every
sovereign state's profile and history, the multilateral structures that
connect them (alliances, blocs, trade pacts), and the dynamics between them
(conflicts, treaties, trade flows).

This is a living research database, not a snapshot. Data refreshes on a
schedule from open sources (Wikipedia, Wikidata, GDELT, ACLED, World Bank).
Optional AI features (timeline summarization, country comparison) run
locally against a self-hosted Ollama instance — no cloud API costs, no data
leaving your machine.

## Project status

**Section 1 — project skeleton + base map.** The architecture is in place
and a zoomable world map renders. Country interactions, layers, timelines,
and data fetching are forthcoming sections.

See `docs/ARCHITECTURE.md` for the design rules and `docs/CONVENTIONS.md`
for code style.

## Running locally

This is a static site with no build step. To view it:

```
cd world-atlas
python3 -m http.server 8000
```

Then open <http://localhost:8000> in a browser. (Opening `index.html`
directly via `file://` will not work — ES modules require an HTTP origin.)

## Deployment

The site is deployed to GitHub Pages at
`https://jumpingpie.github.io/world-atlas/` from the `main` branch.

## Design principles

The project follows a strict modular architecture where each kind of
component (map layer, data fetcher, country-panel card) conforms to a
shared contract. This means new features can be added by dropping in a new
file rather than modifying existing code. See `docs/ARCHITECTURE.md`.

## Data sources

- **Wikidata** — structured country facts (population, GDP, government, etc.)
- **Wikipedia** — narrative summaries and history sections
- **GDELT** — global event database for current-affairs overlays
- **ACLED** — geocoded conflict events
- **World Bank** — economic and development indicators

All sources are open and free; no paid API keys are required.

## Border policy

The atlas treats as full sovereign states any entity with de facto
independent governance and popular legitimacy independent of foreign
military backing. This includes Taiwan, Kosovo, Palestine, and Somaliland.
A "show contested entities" toggle exposes additional partially-recognized
or disputed entities. See `docs/ARCHITECTURE.md` for the full ruleset.
