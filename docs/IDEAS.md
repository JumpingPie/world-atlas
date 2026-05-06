# Ideas backlog

Features and refinements discussed but not yet implemented. Not a
roadmap — items here have been deferred deliberately, usually
because they depend on something else, are large, or are polish to
be saved for after the core features are solid.

If you're picking up this project after a break: the active section
plan is in `README.md`'s status note. The list below is *next*-next
work, not what's in flight.

---

## News bar at the top of the screen

A thin semi-transparent grey bar above the map, displaying recent
internationally important news. Click a headline to expand a detail
view with source links.

**Data source.** Wikipedia's Current Events portal is the
recommended baseline: it publishes a daily structured page with
categorized international events, geocoded country references, and
source links. Free, no API key, served through the Wikipedia API
(CORS-friendly), already editorially curated. GDELT is a higher-
volume alternative but machine-coded and noisy — would require
significant filtering to extract "internationally important." Paid
providers exist (NewsAPI, Ground News if it ever exposes an API)
but Wikipedia is enough for a personal research atlas.

**Animation.** Push for fade-between-items rather than horizontal
ticker scroll. Cable-news-style scroll is unreadable passively —
users either fixate (defeating the background-info purpose) or
ignore (defeating the at-a-glance purpose). Fade-between gives a
stable headline the user can read or ignore at will, much calmer
in a tool people leave open.

**Map integration is the real unlock.** Most international news
references a country or region. The Wikipedia Current Events portal
is structured enough to extract those tags. Clicking a news item
should auto-select the referenced country, open the right panel
pre-loaded with the news as a new card type, and pan/zoom to the
area. Without map integration the bar is decoration; with it, it
becomes an entry point into the atlas.

**Layout.** A fourth panel zone at the top is doable but eats
vertical space alongside the header. Cleaner alternatives:
- collapse the news ticker into the right of the header (rotates
  through items in space currently held by the theme toggle), or
- float the bar over the map's top edge, auto-hide when the map
  area shrinks below some threshold or when many panels are open.

**Architecture fit.** Slots in cleanly:
- `src/fetchers/wikipedia-current-events.js` (fetcher pattern, same
  as existing Wikipedia fetchers)
- `src/core/news-bar.js` (init module that owns the bar UI)
- News-detail rendered as a new card type or a modal overlay
- Fast-data cache TTL (~1 hour) — different from the 14-day default
  but uses the same `getOrFetch` infrastructure

**Suggested timing.** After Section 8 (timeline), Section 9 (Ollama),
and probably after region-stats / comparison views land. The atlas
needs its primary value props solid before adding a second
information surface.

---

## Tile-based realistic rendering

Switch from D3 SVG to Leaflet or MapLibre with a tile provider
(OSM, Carto, Mapbox) for a Google-Maps-like base layer with real
geography (terrain, roads, satellite imagery). The current SVG
approach can never look like Google Maps no matter how much CSS we
add — that requires actual raster tiles.

**Cost.** Major refactor of `src/core/map.js`. The map handle's API
would change because layers and panels currently consume D3's
projection; in tile-land they'd consume Leaflet's mercator. The
zoom-tier system and per-country label thresholds would need to
adapt to tile zoom levels (1–18 in Leaflet vs. our 1–8 in d3-zoom).

**Worth it if** the user decides realistic visuals matter more than
the current analytical-cartography aesthetic. Worth NOT doing if
the atlas's value is in the layered geopolitical data on top of a
clean abstract base, which is the current direction.

---

## Ortelius-style "real paper" effects

Decorative scrollwork cartouche around the title, sea monsters and
ships in the oceans, hand-inked wavy coastlines, cloud illustrations
as a frame around the map. All from the Ortelius 1570 reference the
user shared.

**Why deferred.** None of these are achievable as CSS overlays on
the existing SVG. Each is a real illustration project requiring
hand-drawn SVG assets:
- Cartouche: dedicated SVG element with title text composited in
- Sea monsters: hand-positioned figurative SVG illustrations
- Inked coastlines: would require either custom geometry distortion
  or a different (rougher) base TopoJSON — the current Natural Earth
  borders are clean smooth lines
- Cloud border: large decorative SVG margin around the map area

**Scope.** Each item is a focused 1–2 day effort. Best done after
the analytical features are complete and the visual layer feels
worth investing in.

---

## Per-region color variation in the atlas theme

Currently every country in the atlas theme has the same warm yellow
fill. Real Renaissance atlases had hand-applied watercolor washes
that varied across the page — often by colonial empire, climate
zone, or simply uneven application.

**Implementation paths:**
- Per-country palette variation: hand-curate a small set of fill
  variants per country, tying loosely to climate or cultural region.
  Several days of curation work.
- Procedural variation: hash the ISO code to a slight hue/saturation
  jitter from the base color. Easy, less authentic.
- Climate zone variation: import a Köppen climate map and color
  countries accordingly. Most authentic to old atlases (which often
  did this) but requires the climate dataset.

---

## Mobile / touch support

The whole app currently assumes desktop with mouse + trackpad.
Specifically missing:
- Touch handlers on the bottom drawer (only mouse drag works)
- Pinch-to-zoom on the map (we use trackpad ctrl+wheel; touch pinch
  generates different events)
- Larger hit targets for layer toggles, country selection
- Panel layout breakpoints — currently panels can claim too much of
  a phone screen

**Scope.** A focused mobile pass, not an incremental fix. Save for
when the user tries to use this on phone and decides it matters.

---

## Auto-zoom on drill-down

When the user clicks a country in the region-members card, the
panel switches to country mode but the map stays at world view, so
the visual selection isn't apparent (regions cover the country
geometry at zoom-tier-1). A small UX refinement: animate a
zoom-to-country when this drill happens.

**Scope.** Small. Maybe an hour. Not yet annoying enough for the
user to request.

---

## Subnational divisions

Drill below countries into states/provinces (US states, Indian
states, Brazilian states, etc.). The user explicitly chose against
this in initial design discussions to keep scope manageable, but
it's a natural extension if the project keeps growing.

**Scope.** Significant — additional TopoJSON datasets for the ~20
countries with meaningful subnational politics, plus a third zoom
tier in the rendering, plus the data layer for whatever the
subnational unit displays (state-level GDP, etc.).

---

## Historical entities

Ottoman Empire, USSR, Yugoslavia, etc. as first-class clickable
entities with their own panels and timelines. Currently the atlas
shows only present-day states. The user explicitly decided against
historical entities at the design stage, but the timeline work in
Section 8 may surface places where a "what was here in 1860?" view
would help.

**Implementation.** Would require historical TopoJSON datasets
(several exist for major eras) plus a time slider that switches
which set is rendered. Conceptually similar to the layer system
but switching the base geometry, not adding overlays.

---

## Time-scrubbing

A slider that changes the historical state of the entire map —
borders, regimes, alliances, conflicts — to a chosen year. The
ultimate version of the "current state vs. history" axis the
project is built around.

**Why expensive.** Requires year-tagged everything: borders, member
state lists, head-of-state data, etc. The current data model
mostly stores latest values. Significant data and architecture work
to retrofit.

---

## Country comparisons

Pin two countries side-by-side and see their stats / timelines /
relations laid out in parallel. Common analytical pattern not yet
served.

**Architecture fit.** Could be another panel kind (the right panel,
when in compare mode, becomes a two-column layout) or a dedicated
"compare view" that takes over the screen. The card system already
handles per-country data; comparison is mostly a layout problem.

---

## Search

Type a country or region name to select it without panning around
the map. Trivial to implement once we decide where it goes (header?
left panel?).

---

## More themes

The atlas theme demonstrates the theme system. Future candidates:
- Satellite / terrain (paired with tile-based rendering above)
- Clean modern (light, minimal, less analytical-feeling than dark)
- High-contrast / accessibility variant
- Matrix / cyberpunk (purely for fun)

Each new theme is mechanical: one CSS file under `styles/themes/`
plus a `<link>` and an entry in the theme controller's list.

---

## Better Wikidata population/GDP queries

The SPARQL fetcher uses `SAMPLE` for population, area, and GDP,
which returns "some value" rather than guaranteed-most-recent. For a
research atlas this is a quality issue. Better:
- Query the qualifier `P585` (point in time) on each statement
- Sort statements by date and pick the most recent
- Surface the data's effective date in the stats card so users can
  see how current it is

Mentioned in `src/fetchers/wikidata-stats.js` as a known limitation.

---

## Wikidata citation/reference tracking

Wikidata exposes `prov:wasDerivedFrom` graphs showing which source
each statement came from. For a research atlas this is high-value:
users could click a population number and see the underlying source.
Adds significant query complexity. Worth doing once the value of the
basic stats is established.

---

## Frayed edges in atlas theme

True irregular boundary fade at the edges of the map area, not just
the current vignette. Requires an SVG mask with `feTurbulence`-
generated noise applied to the container's edge. Possible but
distinctly more code than the current vignette achieves on its own.

---

## When to come back to this list

Treat the list as raw material, not a queue. When picking the next
section, look at what's actually limiting the atlas's value right
now and choose accordingly. Items here have all been considered
and consciously deferred, so re-promoting one means re-evaluating
the priority calculation.
