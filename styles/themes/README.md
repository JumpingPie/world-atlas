# Themes

Each file in this folder defines one visual theme as a set of CSS
custom-property overrides. The default ("dark") theme lives in the
parent `main.css` file under `:root`; everything in this folder is an
alternate.

## How themes work

Theme application is a single class on the `<html>` element, set by
`src/core/theme.js`. When the class is `.theme-atlas` (for example),
all rules in `atlas.css` scoped under `.theme-atlas` win, overriding
the matching `:root` defaults from `main.css`.

This means themes are pure CSS — no JavaScript per-theme code, no
re-rendering, no SVG attribute changes. The country fills, label
colors, panel chrome, and selection highlights all switch
automatically because they reference CSS variables.

## Adding a new theme

1. Copy an existing file (e.g. `atlas.css`) to
   `styles/themes/<your-theme>.css`.
2. Replace the selector to scope under your new class
   (`.theme-<your-theme>`).
3. Override whichever tokens you want. Anything you don't override
   inherits from the dark defaults in `main.css`.
4. Link the file from `<head>` in `index.html`:
   `<link rel="stylesheet" href="styles/themes/<your-theme>.css" />`
5. Add the theme name to `AVAILABLE_THEMES` in `src/core/theme.js`.

That's it. The theme appears in the cycle, persists across reloads,
and applies before first paint via the inline bootstrap script in
`index.html`.

## Token reference

The tokens defined in `main.css :root` are the full set themes can
override. See that file for the canonical list and per-token comments.
A non-exhaustive summary:

- Surfaces: `--color-bg`, `--color-panel-bg`, `--color-panel-border`,
  `--color-card-bg`, `--color-hover-overlay`, `--color-active-overlay`
- Text: `--color-text`, `--color-text-dim`, `--color-accent`,
  `--color-error`
- Map geometry: `--color-ocean`, `--color-land`, `--color-land-hover`,
  `--color-land-stroke`, `--color-selection-stroke`
- Map labels: `--color-label-fill`, `--color-label-stroke`

If a theme needs a value that isn't in this list, add it to `:root`
in `main.css` first (with its dark-theme default), then override it
in the theme file. That way themes never silently fail because a
token doesn't exist.
