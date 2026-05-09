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

**Sections 1 through 8 are complete.** Working features:

- Zoomable, pannable Equal Earth world map with trackpad pinch/swipe,
  on-screen +/- buttons, and pan-bounds enforcement.
- Country selection with right-side panel showing a stats card
  (Wikidata) and a tabbed summary card (Wikipedia lead + history
  section).
- 17 geopolitical regions selectable at world view via merged
  geometries, with a region-members card listing constituent
  countries that drill into individual country panels.
- Three-panel layout: left (layers), right (selection), bottom
  (timeline drawer). Bottom drawer is selection-gated, slides over
  the map without resizing it.
- Layer system with NATO, EU, BRICS membership overlays toggleable
  from the left panel. Membership-style layer authoring is one
  data file plus one ~5-line module file.
- Vertical curved-baseline timeline in the bottom drawer per-country,
  parsed from "History of [Country]" Wikipedia articles. Click or
  arrow-key navigation through eras; description in a split-card
  layout on the right.
- Theme system with a dark default and a light "Atlas" theme;
  theme persistence via localStorage.
- Robust HTTP layer: in-flight request deduplication, exponential
  backoff retry on 429/503, per-attempt 15-second timeout to
  prevent forever-spinners.

See `docs/ARCHITECTURE.md` for design rules, `docs/CONVENTIONS.md`
for code style, and `docs/IDEAS.md` for the deferred features
backlog (news bar, IGOs as entities, bilateral relations,
multi-mode atlas tabs, more themes, etc.).

**Suggested next sessions** (from IDEAS.md and prior discussion):

- **IGOs as first-class entities** with sigils on the map and a
  dedicated panel — discussed and designed but not yet built.
- **Bilateral relations card** — defense pacts, sanctions, top trade
  partners highlighted on click. Data sources: hand-curated for
  pacts, OFAC/EU lists for sanctions, UN Comtrade for trade.
- **ACLED-driven conflict layer** — automated war-map updates with
  red exclamation markers for active conflicts.
- **Region-stats card** to give region selections more substance
  beyond the member list.

The atlas is ready for everyday use as a research tool. The
architecture is lego-blocks throughout: panels, fetchers, layers,
and themes are all add-by-dropping-a-file with documented contracts.

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
