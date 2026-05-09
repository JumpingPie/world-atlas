# Panel cards

When a country or region is clicked on the map, the side panel opens
and is composed of independent cards: a stats card, a Wikipedia
summary card, a region members card, etc. Each card is a separate
file in this folder.

Cards are registered via `src/panels/index.js`: drop a file in this
folder, add it to the manifest array, and the panel picks it up.

## Card contract

A card file must default-export an object with this shape:

```js
export default {
  // Unique identifier. Convention: kebab-case, matches filename.
  id: "stats",

  // Human-readable name (currently used as the card heading).
  label: "Country stats",

  // Display order. Lower numbers appear higher in the panel.
  // Existing values: stats=10, summary=20, timeline=30, news=40,
  // region-members=10.
  order: 10,

  // Render the card for a given selection.
  //
  // Receives a Selection object (see below). Returns either a DOM
  // node to insert into the panel, or null to skip this card for
  // this selection. Cards self-determine whether they apply by
  // checking selection.kind.
  render(selection) {
    if (selection.kind !== "country") return null;
    const el = document.createElement("section");
    el.className = "panel-card";
    // ... build the card based on selection.feature ...
    return el;
  },
};
```

## Selection types

The panel passes one of these shapes to every card's render:

```js
// Country selection — the user clicked a country at zoom-tier-2+.
{ kind: "country", feature: <GeoJSON country feature> }

// Region selection — the user clicked a region at zoom-tier-1.
{ kind: "region", region: <GeoJSON merged region feature> }
```

A card may handle one kind, the other, or both — entirely its choice.
Returning null for a kind the card doesn't handle is the standard
pattern; the panel filters those out.

## How to add a new card

1. Create `src/panels/<your-card>.js` following the contract above.
2. Pick an `order` value that places it where you want in the panel.
3. Import it and add it to the `cards` array in
   `src/panels/index.js`.

Reload the page — the card appears for any selection it handles.

## Example

See `_template.js` in this folder for a minimal annotated example.
