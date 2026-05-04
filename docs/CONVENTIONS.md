# Code conventions

This project is written to be read — by you, by other contributors, and by
AI tools that will help extend it later. Comments are not optional.

## Comment style

**File header.** Every source file opens with a comment block explaining
what the file is, why it exists, and what it depends on. Read the header
of `src/core/map.js` for the canonical example.

**Function docstrings.** Every non-trivial function has a JSDoc block
that documents:
- What it does (one sentence, action-oriented).
- Its inputs and outputs with types.
- Why it exists, if that's not obvious from the name.

**Inline comments.** Reserve inline comments for explaining *why* a
non-obvious choice was made — never for restating what the code already
says. Examples of good inline comments:

```js
// We chunk by H2 because Wikipedia history articles use H2 for epochs.
sections = splitOn(text, /^##\s/m);

// Equal Earth, not Mercator: Mercator distorts polar regions and
// misrepresents the relative size of countries, which matters for an
// atlas that's read analytically.
const projection = d3.geoEqualEarth();
```

Examples of bad inline comments (do not write these):

```js
// Increment i
i++;

// Loop over countries
for (const c of countries) { ... }
```

**Module READMEs.** Each subfolder under `src/` has a README explaining
its contract — what kind of module lives there and how to add a new one.

## Naming

- Files use `kebab-case.js` (e.g. `nato-membership.js`).
- Module IDs use the same kebab-case as their filename's basename.
- JS variables and functions use `camelCase`.
- Constants use `UPPER_SNAKE_CASE`.

## Module shape

All modules use ES modules (`import`/`export`). No CommonJS, no UMD.
Browsers load them natively via `<script type="module">` plus an
importmap declared in `index.html`.

There is no build step. Files are served as written. This is a deliberate
choice to keep the project debuggable and to avoid coupling deployment to
a Node toolchain.

## Public vs private

Anything exported from a module is part of its public API and other
modules may depend on it. Anything not exported is internal and may
change without notice. Don't reach into another module's internals via
hacks like reading global state or DOM-side-channels.

## Errors

Fail loudly during development. Schema mismatches, missing data, and
unreachable services should produce clear console errors, not silent
empty UI.

For end-user-facing failures (e.g. a fetcher times out), surface a brief
message in the UI and a detailed message in the console.

## Browser support

Targets: latest two stable releases of Chrome, Firefox, Safari, and Edge.
We use modern JS freely (top-level await, optional chaining, importmaps,
ES modules). No IE, no transpilation.

## Dependencies

Pulled from CDN via the importmap in `index.html`. We do not have a
`package.json` yet because we have no build step. If we add one later,
record it in this file.

Currently:
- `d3@7` — visualization and DOM manipulation.
- `topojson-client@3` — converting TopoJSON to GeoJSON.
- `world-atlas@2` — pre-built TopoJSON of country borders (Natural Earth).
