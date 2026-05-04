# Country panel cards

When a country is clicked on the map, a side panel opens. The panel is
composed of independent cards: a stats card, a Wikipedia summary card, a
timeline card, etc. Each card is a separate file in this folder.

Cards are auto-discovered: drop a new file in this folder, and it
appears in the country panel.

## Card contract

A card file must default-export an object with this shape:

```js
export default {
  // Unique identifier. Convention: kebab-case, matches filename.
  id: "stats",

  // Human-readable name shown as the card heading.
  label: "Country stats",

  // Display order. Lower numbers appear higher in the panel.
  // Existing values: stats=10, summary=20, timeline=30, news=40.
  order: 10,

  // Render the card for a given country. Receives the country's
  // aggregated data object (pulled from data/countries/{code}/) and
  // returns a DOM node to insert into the panel.
  //
  // Returning null skips this card for this country (e.g. if the data
  // isn't available).
  render(countryData) {
    const el = document.createElement("section");
    el.className = "panel-card";
    // ... build the card ...
    return el;
  },
};
```

## How to add a new card

1. Create `src/panels/<your-card>.js` following the contract.
2. Pick an `order` value that places it where you want in the panel.
3. Reload. The card appears for any country whose data supports it.

## Example

See `_template.js` in this folder for a minimal annotated example.
