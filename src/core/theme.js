// src/core/theme.js
//
// Theme controller.
//
// What this is: a tiny module that tracks which visual theme is
// active, persists the choice to localStorage, and applies the
// matching theme-* class to <html> so all CSS overrides take effect.
//
// Why a class on <html> rather than <body>: applying the theme class
// before <body> is parsed avoids a flash of the default theme on
// page load. The bootstrap script in index.html runs the apply step
// from <head>, so the user never sees the wrong theme.
//
// How themes are added (lego-blocks):
//   1. Drop a CSS file under styles/themes/ scoped under .theme-<name>.
//      See styles/themes/atlas.css as a template.
//   2. Link it from index.html.
//   3. Add the theme name to AVAILABLE_THEMES below.
//
// No other module imports from this one — themes are pure CSS, which
// means SVG fills, stroke colors, panel chrome, etc. all swap
// automatically when the class flips.

const STORAGE_KEY = "atlas.theme";

/**
 * Themes the user can cycle through. Order matters: the cycle
 * advances in this order, so put commonly-used themes first.
 */
const AVAILABLE_THEMES = ["dark", "atlas"];

/** Theme to use when nothing is saved yet. */
const DEFAULT_THEME = "dark";

/**
 * Read the user's currently active theme. Falls back to the default
 * if no choice has been persisted or if the saved value isn't a known
 * theme (which can happen if a theme was removed in a later release).
 *
 * @returns {string} A theme name guaranteed to be in AVAILABLE_THEMES.
 */
export function getTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return AVAILABLE_THEMES.includes(saved) ? saved : DEFAULT_THEME;
}

/**
 * Set the active theme. Updates localStorage and applies the
 * matching class to <html>. Silently ignores unknown theme names.
 *
 * @param {string} theme
 */
export function setTheme(theme) {
  if (!AVAILABLE_THEMES.includes(theme)) return;
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

/**
 * Cycle through the available themes once. Returns the new theme so
 * the caller can update UI labels without re-reading state.
 *
 * @returns {string} The newly active theme.
 */
export function cycleTheme() {
  const current = getTheme();
  const idx = AVAILABLE_THEMES.indexOf(current);
  const next = AVAILABLE_THEMES[(idx + 1) % AVAILABLE_THEMES.length];
  setTheme(next);
  return next;
}

/**
 * Apply a theme class to <html>. Idempotent — calling repeatedly
 * with the same theme is a no-op. Removes any prior theme-* class
 * first so the classes don't accumulate across calls.
 *
 * Exported separately from setTheme so the bootstrap script can apply
 * the persisted theme during the page's first paint without writing
 * back to localStorage.
 *
 * @param {string} theme
 */
export function applyTheme(theme) {
  const html = document.documentElement;
  // Strip any existing theme-* classes so themes don't compound.
  for (const cls of [...html.classList]) {
    if (cls.startsWith("theme-")) html.classList.remove(cls);
  }
  html.classList.add(`theme-${theme}`);
}

/**
 * List of theme names available to UI components like a theme picker.
 */
export function listThemes() {
  return [...AVAILABLE_THEMES];
}
