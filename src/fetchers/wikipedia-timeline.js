// src/fetchers/wikipedia-timeline.js
//
// Fetcher: a country's history broken into eras, sourced from
// Wikipedia's "History of [Country]" article.
//
// Why a dedicated history article rather than the country article's
// History section: the dedicated articles are far more detailed and
// have a clean H2-bounded era structure that maps directly onto the
// timeline visualization. The country article's History section is
// usually summarized to a few paragraphs of prose and lacks the
// granular era breakdown we want.
//
// Strategy: fetch the full HTML of "History of [Country]" via the
// Wikipedia REST API. Parse client-side, walking the document for
// top-level <section> elements (Parsoid's HTML format wraps each
// section in <section data-mw-section-id="N">). Extract title and
// content for each. Filter out non-era sections like References,
// See also, and Bibliography.
//
// Cache: the parsed era array (not the raw HTML — the HTML is
// large and unhelpful after parsing). Keyed by country title.
//
// Coverage: most major countries have a "History of X" article;
// smaller territories often don't. When the article is missing
// (404), this fetcher returns null and the timeline UI shows
// a "no timeline available" empty state.

import { getOrFetch } from "../core/data-cache.js";

const REST_HTML = "https://en.wikipedia.org/api/rest_v1/page/html";

const USER_AGENT =
  "world-atlas/0.1 (https://github.com/JumpingPie/world-atlas) requests/browser";

// 14-day TTL — country histories don't change between sessions.
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

// Section titles to filter out. These appear at the H2 level in
// most Wikipedia history articles but aren't eras of the country's
// history; they're metadata. Match case-insensitively.
const NON_ERA_TITLE = /^\s*(see also|references|notes|external links|sources|further reading|bibliography|footnotes|citations|external sources|works cited)\s*$/i;

/**
 * Fetch the timeline (era array) for a given country's Wikipedia
 * title. Returns null if no dedicated history article exists.
 *
 * @param {string} countryTitle - The country's Wikipedia article
 *     title (with spaces, e.g. "Germany"). The history article we
 *     look up is "History of " + this title.
 * @returns {Promise<Array<object> | null>} Era objects ordered
 *     chronologically (oldest → most recent), or null on miss.
 */
export async function fetchTimeline(countryTitle) {
  if (!countryTitle) return null;
  const key = `wikipedia-timeline:${countryTitle}`;

  return getOrFetch(key, TTL_MS, async () => {
    const historyTitle = `History of ${countryTitle}`;
    const html = await fetchArticleHtml(historyTitle);
    if (!html) return null;
    const eras = parseEras(html, historyTitle);
    return eras.length > 0 ? eras : null;
  });
}

/**
 * Fetch a Wikipedia article's HTML via the REST API.
 *
 * Returns null on 404 (article doesn't exist), throws on any other
 * non-OK response so the caller can surface real failures.
 */
async function fetchArticleHtml(title) {
  // Wikipedia REST expects underscored titles in the URL path.
  // encodeURIComponent handles other special characters but leaves
  // spaces alone, so we replace spaces explicitly first.
  const slug = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `${REST_HTML}/${slug}`;
  const res = await fetch(url, {
    headers: {
      Accept: "text/html",
      "Api-User-Agent": USER_AGENT,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `Wikipedia article fetch failed: ${res.status} ${res.statusText}`
    );
  }
  return res.text();
}

/**
 * Parse the article HTML and extract era objects from top-level
 * sections.
 *
 * Wikipedia's REST API returns Parsoid HTML where each section is
 * wrapped in a <section data-mw-section-id="N"> element with an
 * H2 heading as its first child. We walk those sections, skip the
 * lead (no H2) and metadata sections (References etc.), and
 * collect each era's title and content HTML.
 *
 * @param {string} html - Full article HTML.
 * @param {string} sourceTitle - Article title (for building anchor
 *     URLs back to Wikipedia).
 * @returns {Array<object>}
 */
function parseEras(html, sourceTitle) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const eras = [];

  // Top-level <section> elements only. Parsoid nests subsections
  // inside parent sections, so a top-level query gets us H2-bounded
  // eras and not the H3/H4 sub-sections within them (which we
  // include as part of the era's content).
  const sections = doc.querySelectorAll("body > section");

  for (const section of sections) {
    // The lead section (article intro) has no H2 — skip it.
    const heading = section.querySelector(":scope > h2");
    if (!heading) continue;

    const title = (heading.textContent || "").trim();
    if (!title) continue;
    if (NON_ERA_TITLE.test(title)) continue;

    // Build the era's description: everything in the section
    // except the H2 heading itself. Cloning so we don't mutate
    // the parsed document.
    const clone = section.cloneNode(true);
    const cloneHeading = clone.querySelector(":scope > h2");
    if (cloneHeading) cloneHeading.remove();

    const descriptionHtml = clone.innerHTML.trim();
    if (!descriptionHtml) continue;

    // Anchor id for linking back to Wikipedia. Parsoid puts the
    // anchor on the heading or a sibling; we read the H2's id
    // attribute first, then fall back to the heading text slugified.
    const anchorId = heading.id || slugify(title);
    const articleSlug = encodeURIComponent(sourceTitle.replace(/ /g, "_"));
    const sourceUrl = `https://en.wikipedia.org/wiki/${articleSlug}#${anchorId}`;

    eras.push({
      id: anchorId,
      title,
      descriptionHtml,
      sourceUrl,
    });
  }

  return eras;
}

/**
 * Turn a heading title into a URL-anchor-style slug. Used as a
 * fallback when an H2 doesn't have an id attribute (rare but
 * possible).
 */
function slugify(s) {
  return s
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w\-_.~]/g, "");
}
