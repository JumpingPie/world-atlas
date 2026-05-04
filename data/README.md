# Data

This folder holds the JSON data the atlas reads at runtime. It is
produced by the fetchers in `src/fetchers/` and committed to git so the
site works without re-running fetchers on every page load.

## Layout

```
data/
├── countries/{ISO}/        # Per-country files (stats, summary, timeline)
│   ├── stats.json
│   ├── summary.json
│   └── timeline.json
├── orgs/                   # Organization rosters (NATO, EU, ASEAN, ...)
│   ├── nato.json
│   └── ...
├── relations/              # Cross-country data (trade flows, treaties)
│   ├── trade-2024.json
│   └── ...
├── borders/                # Border decisions and contested-entity policy
│   └── decisions.md
├── geo/                    # Base map TopoJSON and region boundaries
│   └── countries-110m.json
└── cache/                  # Local-only cache, gitignored
```

## Schema versioning

Every JSON file begins with metadata fields:

```json
{
  "_schema": "country-stats/v1",
  "_generated": "2026-04-15T12:00:00Z",
  "_source": "wikidata",
  ...
}
```

When a consumer encounters an unknown `_schema`, it should fail loudly
rather than mis-render. See `docs/ARCHITECTURE.md` for the full rule.

## What's in here right now

Section 1 doesn't produce any data files yet — they arrive in Section 2
when we wire up Wikidata. The base map TopoJSON is currently loaded from
CDN and will be vendored to `data/geo/countries-110m.json` later for
offline use.
