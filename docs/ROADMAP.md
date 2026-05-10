# Roadmap

This is the *active* queue: what's done, what's in flight, and what's
up next. It's the file to open first when picking the project back up
after a break.

It complements two adjacent docs:

- `README.md` carries the high-level project status.
- `IDEAS.md` is the *deferred* backlog — items considered and parked,
  not actively queued. Promoting an idea from `IDEAS.md` to this file
  means re-evaluating priority against what's already here.

If a section gets large enough to feel unwieldy, split it out into its
own design note under `docs/` and link it from the bullet here.

---

## Completed

Sections 1-8 of the original build plan, in the order they shipped:

- **Map skeleton** — Equal Earth projection, trackpad pinch/swipe
  zoom, on-screen +/- buttons, pan-bounds enforcement.
- **Country panel** — right-side panel with stats card (Wikidata) and
  tabbed summary card (Wikipedia lead + history section).
- **Regions** — 17 geopolitical regions selectable at world view via
  merged geometries, with a region-members card that drills into
  individual country panels.
- **Three-panel layout** — left (layers), right (selection), bottom
  (timeline drawer); bottom drawer slides over the map without
  resizing it.
- **Layer system + alliance overlays** — NATO, EU, BRICS membership
  layers; new membership-style layers added by dropping one data
  file plus a ~5-line module file.
- **Timeline** — vertical curved-baseline timeline per country,
  parsed from "History of [Country]" Wikipedia articles, with
  click and arrow-key navigation.
- **Theme system** — dark default and "Atlas" light theme, with
  localStorage persistence. Cycle button lives in the map's top-
  right corner.
- **Robust HTTP layer** — in-flight request deduplication,
  exponential backoff on 429/503, per-attempt 15-second timeout.

## In progress

**News banner integrated into the title.** v1 shipped: a Renaissance-
style cartouche floats centered near the top of the map area;
`src/core/title-news.js` cycles its inner SVG `<text>` between
"WORLD ATLAS" and the day's Wikipedia Current Events headlines, with
a flicker-on-out / smooth-fade-on-in transition. v1 click behavior is
read-only — clicking a headline opens its source URL in a new tab.

**Outstanding for this item:**

- Tune the pacing constants (`TITLE_HOLD_MS`, `HEADLINE_HOLD_MS`,
  `FADE_OUT_MS`, `FADE_IN_MS`) once we've watched it run for a while.
- Decide whether to add map navigation on click — the "real unlock"
  per `IDEAS.md`. Requires the fetcher to extract country ISO codes
  from each portal bullet, which it doesn't yet do.
- Optional: dynamic font sizing for headlines that don't fit at 14px
  even after the 100-char truncation. Not needed yet.

## Up next

Ordered roughly by the user's current interest, with dependency notes.
Reorder freely as priorities shift.

1. **IGOs as first-class entities.** Clickable sigils placed in
   international waters near each org's headquartered state (UN/NYC,
   NATO/Brussels, etc.). Only the major orgs (UN, NATO, BRICS+, EU,
   ASEAN, AU, OAS, …). Open questions: layer-toggleable vs. always-on
   at world view; placement rule for orgs without a single HQ
   (BRICS+). Unblocks #2.

2. **More IGOs in the layer system, with info popovers.** Major orgs
   beyond NATO/EU/BRICS as toggleable membership layers, with a small
   info button on each layer row that opens an organization detail
   card (mission, founding year, members, link out). Reuses the IGO
   entity data from #1.

3. **Bilateral interactions / "scanner."** State↔state and state↔IGO
   relations: economic partnerships, conflicts, sanctions, top trade
   partners. New panel card kind, fed by separate fetchers per
   relation type. Extends the existing card contract.

4. **Loading-time pass.** Profile and shorten state-info and timeline
   load. Likely candidates: serial Wikidata→Wikipedia→history fetches
   (parallelize), timeline parsing on the main thread (move work,
   precompute, or cache), and aggressive caching of parsed timelines
   to JSON. Independent of feature work; can run alongside.

5. **Conflict scanner.** Layer / mode that shows all ongoing
   conflicts and wars at once, with some indication of progression
   (intensifying, de-escalating, frozen). Data: ACLED for events,
   plus temporal aggregation per conflict zone for the trend signal.
   May share a fetcher with #3's conflict relation.

6. **More layer types — democracy rating and similar indices.**
   Choropleth-style layers based on per-country numeric scores
   (V-Dem, Freedom House, HDI, press freedom, etc.). Worth
   introducing a generic "choropleth layer" kind so each new index
   is a data file plus a config entry rather than bespoke code.

## Deferred

Ideas that have been considered and consciously parked live in
`docs/IDEAS.md`. Examples: tile-based realistic rendering,
Ortelius-style decorative effects, time-scrubbing across history,
country comparison view, search, mobile/touch support, subnational
divisions. Each entry there carries the rationale for why it's
deferred — read it before re-promoting one.

## Picking up after a break

1. Read this file's "In progress" and "Up next" sections.
2. Skim the most recently updated docs under `docs/` for context.
3. Glance at `IDEAS.md` only if "Up next" is empty or you're looking
   for a smaller side task.
