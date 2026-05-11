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
 * { headline, sourceUrl, topicTitle, category, body } records.
 *
 * Wikipedia's portal uses a two-tier bullet pattern per day:
 *
 *   • <Topic>          ← outer <li>: a wikilink to the broader topic
 *                        ("Russian invasion of Ukraine",
 *                        "2024–25 Sudanese civil war", etc.)
 *     ◦ <Description>   ← inner <li>: a specific event today,
 *                        written in journalistic-summary prose
 *
 * The descriptions are what reads as a "headline"; the outer
 * wikilink is the most useful click-through (stable Wikipedia URL
 * for the broader topic). We pull the inner bullets as headlines and
 * attach each one to its parent bullet's wikilink — exactly the
 * pairing Ted asked for.
 *
 * Strategy:
 *
 *   1. Walk every leaf `<li>` (one with no nested list inside it).
 *      Leaves are either the inner bullets in a nested structure or
 *      flat bullets in non-nested days. Outer/topic bullets are
 *      skipped because they contain a nested `<ul>`.
 *   2. Clean the leaf's text by stripping citation superscripts,
 *      edit links, etc. Treat the first sentence of the cleaned text
 *      as the headline (`extractTitle` enforces this).
 *   3. Look up to the nearest parent `<li>` and grab its first
 *      wikilink as the topic link. If there is no parent `<li>`
 *      (flat bullet), fall back to the bullet's own first wikilink —
 *      which for a flat bullet is usually the topic it's about.
 *   4. Dedupe by headline text — Wikipedia occasionally repeats the
 *      same description in two list sections (e.g. "Armed conflicts"
 *      and "International relations") on the same day.
 */
function parseEvents(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const events = [];
  const seen = new Set();

  const allLi = doc.querySelectorAll("li");

  for (const li of allLi) {
    // Skip non-leaf bullets — those containing their own nested
    // bullet list. We want only the deepest descriptions.
    if (li.querySelector("ul, ol")) continue;

    const clone = li.cloneNode(true);
    clone
      .querySelectorAll(
        "sup, .reference, .mw-editsection, .citation, style, link"
      )
      .forEach((n) => n.remove());

    const rawText = (clone.textContent ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (!rawText) continue;

    const headline = extractTitle(rawText);
    if (!headline) continue;
    if (headline.length < 20) continue;
    if (!/\s/.test(headline)) continue;
    if (seen.has(headline)) continue;
    seen.add(headline);

    const topic = findTopicLink(li);
    const category = findCategoryFor(li);

    events.push({
      headline,
      sourceUrl: topic?.url ?? null,
      topicTitle: topic?.title ?? null,
      category,
      body: rawText,
    });
  }

  return events;
}

/**
 * Find the wikilink that names the topic this leaf bullet falls
 * under. Prefer the immediate parent `<li>`'s first wikilink (the
 * canonical "topic" link in Wikipedia's two-tier nested pattern);
 * fall back to the leaf's own first wikilink for flat bullets.
 * Returns null when neither yields a usable wikilink.
 */
function findTopicLink(li) {
  const parentLi = li.parentElement?.closest("li");
  if (parentLi) {
    const link = firstWikilinkIn(parentLi);
    if (link) return link;
  }
  return firstWikilinkIn(li);
}

/**
 * First internal Wikipedia link inside the given `<li>`, looking only
 * at the element's own direct content (nested lists stripped from the
 * clone so we don't accidentally pick up a wikilink from a sub-
 * bullet).
 */
function firstWikilinkIn(li) {
  const clone = li.cloneNode(true);
  clone.querySelectorAll("ul, ol, dl").forEach((n) => n.remove());

  const a = clone.querySelector('a[href^="/wiki/"]');
  if (!a) return null;

  const href = a.getAttribute("href");
  if (!href) return null;

  return {
    url: new URL(href, "https://en.wikipedia.org/").href,
    title: (a.textContent ?? "").trim(),
  };
}

/**
 * Reduce a Wikipedia Current Events bullet to its title — the lead
 * sentence, with trailing source attributions stripped.
 *
 * Wikipedia portal bullets are written in journalistic-summary style:
 * the first sentence is the news, and any subsequent sentences add
 * elaboration or context. Pulling just the first sentence gives us
 * something that reads as a headline rather than a paragraph.
 *
 * The sentence-boundary detector requires a period (or ! or ?) to be
 * followed by whitespace and a capital letter, which keeps
 * abbreviations like "U.S." or "Dr." from being treated as sentence
 * ends. Bullets without a clean first-sentence break (single-sentence
 * bullets, or ones containing only abbreviation periods) fall through
 * to the full cleaned text.
 *
 * Trailing parenthetical source mentions ("(Reuters)", "(BBC News)")
 * and stray citation markers ("[1]") are stripped before sentence
 * detection — Wikipedia tucks the source-link text into the bullet's
 * tail and it would otherwise pollute the headline.
 */
function extractTitle(rawText) {
  let s = rawText.trim();
  // Strip trailing parenthetical source attributions and citations.
  // Run these as a small loop so a bullet ending in "(Reuters) [1]"
  // gets both stripped without us having to enumerate orderings.
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s.replace(/\s*\([^()]{1,40}\)\s*$/, "");
    s = s.replace(/\s*\[\d+\]\s*$/, "");
    s = s.trim();
    if (s === before) break;
  }
  // First-sentence detector: minimal-match up to a sentence-ender,
  // lookahead requires whitespace + capital so abbreviation periods
  // ("U.S. announces ...") don't trigger a false split.
  const m = s.match(/^(.+?[.!?])\s+[A-Z]/);
  if (m && m[1].length >= 20) return m[1];
  return s;
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
