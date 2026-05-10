// src/fetchers/wikipedia-current-events.js
//
// Fetcher: Wikipedia's Current Events portal for a given day.
//
// What it gets: the daily curated list of internationally significant
// events from https://en.wikipedia.org/wiki/Portal:Current_events,
// normalized into a flat array of { headline, sourceUrl, category }
// objects. Used by src/core/title-news.js to populate the cartouche's
// fading headline cycle.
//
// Why Wikipedia and not GDELT or a paid news API: per docs/IDEAS.md,
// the portal is editorially curated for international notability, free,
// CORS-friendly, and structured enough to extract headlines and
// per-event source links. GDELT is higher-volume but machine-coded and
// noisy; paid APIs are overkill for a personal research atlas.
//
// Cache TTL: 1 hour. Wikipedia editors update the portal throughout
// the day, so a multi-day cache would risk showing stale "current"
// events; meanwhile, refetching on every page interaction is wasteful.
// One hour balances freshness against politeness toward Wikimedia.

import { getOrFetch } from "../core/data-cache.js";
import { fetchWithRetry } from "../core/http.js";

const PARSE_API = "https://en.wikipedia.org/w/api.php";

// User-Agent identifies this app to the Wikimedia API. Required by
// Wikimedia API policy and used in their request logs to find us if
// we're misbehaving. Same string the other Wikipedia fetchers use.
const USER_AGENT =
  "world-atlas/0.1 (https://github.com/JumpingPie/world-atlas) requests/browser";

const TTL_MS = 60 * 60 * 1000; // 1 hour

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Format a Date as a Wikipedia Current Events page title.
 *
 * The portal stores each day at a subpage like:
 *   "Portal:Current events/2026 May 10"
 *
 * with a single space between year, English month name, and day-of-
 * month (no leading zero). UTC is used because Wikipedia's editorial
 * "today" is global, not the user's local timezone.
 */
function pageTitleForDate(date) {
  const y = date.getUTCFullYear();
  const m = MONTH_NAMES[date.getUTCMonth()];
  const d = date.getUTCDate();
  return `Portal:Current events/${y} ${m} ${d}`;
}

/**
 * Fetch the Wikipedia Current Events portal page for a given UTC date
 * and return its events normalized.
 *
 * Returns null if the page doesn't exist yet (early in a UTC day,
 * before editors have written the new subpage). Callers should treat
 * null as "try yesterday."
 *
 * @param {Date} date
 * @returns {Promise<{events: Array, date: string} | null>}
 */
export async function fetchEventsForDate(date) {
  const title = pageTitleForDate(date);
  const key = `wikipedia-current-events:${title}`;
  return getOrFetch(key, TTL_MS, async () => {
    const url =
      `${PARSE_API}?action=parse` +
      `&page=${encodeURIComponent(title)}` +
      `&format=json&prop=text&origin=*`;
    const res = await fetchWithRetry(url, {
      headers: {
        Accept: "application/json",
        "Api-User-Agent": USER_AGENT,
      },
    });
    if (!res.ok) {
      throw new Error(
        `Wikipedia parse API failed: ${res.status} ${res.statusText}`
      );
    }
    const data = await res.json();
    // The parse API returns 200 even for missing pages, encoding the
    // failure as { error: { code: "missingtitle", ... } }. Treat that
    // as a soft no-data outcome rather than throwing.
    if (data?.error) {
      if (data.error.code === "missingtitle") return null;
      throw new Error(
        `Wikipedia parse API error: ${data.error.code} – ${data.error.info}`
      );
    }
    const html = data?.parse?.text?.["*"];
    if (!html) return null;
    return {
      _schema: "wikipedia-current-events/v1",
      _generated: new Date().toISOString(),
      _source: "en.wikipedia.org",
      date: dateToISODate(date),
      events: parseEvents(html),
    };
  });
}

/**
 * Convenience: today's events, falling back to yesterday's if today's
 * page hasn't been written yet (which happens routinely for a few
 * hours each UTC morning).
 *
 * @returns {Promise<{events: Array, date: string} | null>}
 */
export async function fetchTodayEvents() {
  const today = new Date();
  const todayResult = await fetchEventsForDate(today);
  if (todayResult && todayResult.events.length > 0) return todayResult;

  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  return fetchEventsForDate(yesterday);
}

function dateToISODate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Parse the HTML of a Current Events daily page into a flat list of
 * { headline, sourceUrl, category } records.
 *
 * Strategy: walk every plausible event-bullet container — `<li>` and
 * `<dd>` — at any nesting level. For each container:
 *
 *   1. Clone it and strip nested sub-lists from the clone, so the
 *      headline text reflects the bullet itself rather than its
 *      sub-bullets. (We don't skip nested bullets entirely, because
 *      Wikipedia's portal often nests the actual events under
 *      topical wrapper bullets — e.g. a parent "Israel-Hamas war"
 *      <li> with the day's specific events as nested <li> children.
 *      Those nested children are exactly what we want as headlines.)
 *   2. Strip Wikipedia's citation superscripts and edit-section
 *      links — they're noise without the rendered references.
 *   3. The first external link inside the bullet is the source URL
 *      (the wikilink to the topic's Wikipedia page is also there,
 *      but for "open the source on click" we want the news outlet,
 *      not Wikipedia).
 *   4. Drop bullets that are too short to be event headlines.
 *   5. Dedupe by headline text — sub-bullet structure can produce
 *      the same string showing up at multiple list levels.
 */
function parseEvents(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const candidates = doc.querySelectorAll("li, dd");
  const events = [];
  const seen = new Set();

  for (const el of candidates) {
    const clone = el.cloneNode(true);

    // Remove nested lists from the clone so a parent bullet's text
    // is just its own text, not a concatenation of all its
    // descendants' text. Without this, a parent bullet for a topic
    // would render as the topic name immediately followed by every
    // sub-bullet's text mashed together.
    clone
      .querySelectorAll("ul, ol, dl, sup, .reference, .mw-editsection, .citation, style, link")
      .forEach((n) => n.remove());

    const headline = (clone.textContent ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (!headline) continue;
    if (headline.length < 20) continue;
    if (!/\s/.test(headline)) continue;
    if (seen.has(headline)) continue;
    seen.add(headline);

    const sourceUrl = firstExternalLink(clone);
    const category = findCategoryFor(el);

    events.push({ headline, sourceUrl, category });
  }

  return events;
}

function firstExternalLink(scope) {
  // Wikipedia's parser annotates external links with class="external".
  // Our parsed HTML preserves these classes.
  const a = scope.querySelector('a[class*="external"]');
  if (a && a.href) return a.href;
  // Fallback: any <a> whose href is not a Wikipedia internal link.
  for (const link of scope.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href") ?? "";
    if (/^https?:\/\//.test(href) && !/wikipedia\.org\/wiki\//.test(href)) {
      return link.href;
    }
  }
  return null;
}

function findCategoryFor(el) {
  // Walk up through ancestors. At each level, scan the element's
  // *previous* siblings for the most recent heading. The first match
  // wins. This handles both flat structures (h3 followed by ul) and
  // section-wrapped structures (h3 inside a section, ul inside a
  // sibling section) without special-casing either.
  let node = el;
  while (node && node !== document.documentElement) {
    let prev = node.previousElementSibling;
    while (prev) {
      if (/^H[1-6]$/.test(prev.tagName)) {
        return prev.textContent.replace(/\[edit\]/i, "").trim();
      }
      // Headings can also be nested inside the previous sibling
      // (e.g. inside a wrapper div). Look one level deep.
      const inner = prev.querySelector("h1, h2, h3, h4, h5, h6");
      if (inner) {
        return inner.textContent.replace(/\[edit\]/i, "").trim();
      }
      prev = prev.previousElementSibling;
    }
    node = node.parentElement;
  }
  return null;
}
