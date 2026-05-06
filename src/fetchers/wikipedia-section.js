// src/fetchers/wikipedia-section.js
//
// Fetcher: HTML for one named section of a Wikipedia article.
//
// Why a section-level fetch and not the whole article: an article
// like "Germany" has many H2 sections (History, Geography, Economy,
// Politics, Demographics, etc.). Pulling just the one we want means
// (a) faster transfers, (b) cleaner output without unrelated
// sections, (c) we don't have to client-side-parse a multi-MB HTML
// blob to find the slice we want.
//
// Why the Action API and not the REST API: Wikipedia's REST API
// (`/api/rest_v1/page/...`) doesn't expose per-section HTML
// directly. The older Action API (`/w/api.php?action=parse`) does:
// first call returns a list of section indices, second call returns
// the HTML for one of them. Two requests, but each is small.
//
// CORS: the Action API requires `origin=*` in the query string for
// cross-origin browser requests. Without it the browser refuses
// the response.

import { getOrFetch } from "../core/data-cache.js";

const ACTION_API = "https://en.wikipedia.org/w/api.php";

const USER_AGENT =
  "world-atlas/0.1 (https://github.com/JumpingPie/world-atlas) requests/browser";

const TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Fetch the HTML of the first section in `title`'s article whose
 * heading matches `sectionMatcher`.
 *
 * @param {string} title - Wikipedia article title (human-readable
 *     form with spaces; encodeURIComponent is applied internally).
 * @param {string | RegExp} sectionMatcher - Either a string (matched
 *     case-insensitively for exact equality) or a regex (tested
 *     against each section heading). Top-level sections (toclevel 1)
 *     are preferred over sub-sections when both match.
 * @returns {Promise<string|null>} HTML string, or null if no match.
 */
export async function fetchWikipediaSection(title, sectionMatcher) {
  if (!title) return null;

  // Cache key includes the matcher so different sections of the
  // same article cache independently. A regex is serialized to its
  // string form (toString) which is stable per-source.
  const matcherKey =
    sectionMatcher instanceof RegExp
      ? sectionMatcher.toString()
      : String(sectionMatcher);
  const key = `wikipedia-section:${title}:${matcherKey}`;

  return getOrFetch(key, TTL_MS, async () => {
    const sections = await fetchSectionList(title);
    if (sections.length === 0) return null;

    const matches = (line) => {
      if (typeof sectionMatcher === "string") {
        return line.toLowerCase() === sectionMatcher.toLowerCase();
      }
      return sectionMatcher.test(line);
    };

    // Prefer level-1 sections (the H2 in Wikipedia, the article's
    // main top-level breakdowns) over deeper subsections. Many
    // country articles have an H2 "History" plus several H3
    // sub-sections; we want the umbrella H2.
    const level1 = sections.find((s) => s.toclevel === 1 && matches(s.line));
    const anyLevel = sections.find((s) => matches(s.line));
    const match = level1 ?? anyLevel;
    if (!match) return null;

    const html = await fetchSectionHtml(title, match.index);
    return html;
  });
}

/**
 * Fetch the article's list of sections — for each section we get
 * its index (used to refer to it in subsequent calls), heading
 * line, anchor, and table-of-contents level.
 */
async function fetchSectionList(title) {
  const params = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "sections",
    format: "json",
    formatversion: "2",
    origin: "*",
  });
  const res = await fetch(`${ACTION_API}?${params}`, {
    headers: {
      Accept: "application/json",
      "Api-User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(
      `Wikipedia sections lookup failed: ${res.status} ${res.statusText}`
    );
  }
  const json = await res.json();
  return json.parse?.sections ?? [];
}

/**
 * Fetch the HTML for one section identified by its index in the
 * article's section list. The Action API's `prop=text` returns the
 * full inline HTML for that section including any subsections
 * underneath it.
 */
async function fetchSectionHtml(title, sectionIndex) {
  const params = new URLSearchParams({
    action: "parse",
    page: title,
    section: String(sectionIndex),
    prop: "text",
    format: "json",
    formatversion: "2",
    origin: "*",
  });
  const res = await fetch(`${ACTION_API}?${params}`, {
    headers: {
      Accept: "application/json",
      "Api-User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(
      `Wikipedia section text fetch failed: ${res.status} ${res.statusText}`
    );
  }
  const json = await res.json();
  return json.parse?.text ?? null;
}
