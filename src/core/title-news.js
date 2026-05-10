// src/core/title-news.js
//
// Title cartouche cycler.
//
// What this is: the runtime that drives the cartouche's inner <text>
// element through a quiet cycle of title → headline → title → next
// headline → ... while the user looks at the map. Per docs/IDEAS.md
// (and Ted's brief), the title surface doubles as a low-stakes news
// ticker so the atlas always has something current to show without
// adding a separate banner.
//
// Why fade-between instead of horizontal scrolling: the user might
// leave this app open in a window for hours. A horizontal news ticker
// is unreadable passively (you fixate on it OR ignore it). Fade-
// between gives a stable headline the user can read or not, much
// calmer in a tool people leave open. See IDEAS.md.
//
// The cartouche's <text> element is treated as the single rendering
// slot. We swap its content + style atomically inside the fade-out
// window so the user never sees a half-changed state. Long headlines
// wrap onto two lines via SVG <tspan> children, measured with
// getComputedTextLength so wrapping is exact rather than character-
// counted.
//
// V1 click behavior is read-only: a headline with a sourceUrl opens
// in a new tab. Map navigation on click ("which country does this
// headline reference?") is the deferred unlock per ROADMAP.md item #1.

import { fetchTodayEvents } from "../fetchers/wikipedia-current-events.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const TITLE_TEXT = "WORLD ATLAS";

// Cycle pacing. Constants here so future tuning is one place, not a
// scavenger hunt. Headline hold is longer than title hold because
// reading a headline takes longer than recognising the title; two-
// line headlines get a small additional grace period to read the
// second line.
const TITLE_HOLD_MS = 7000;
const HEADLINE_HOLD_MS = 9000;
const TWO_LINE_BONUS_MS = 2500;
const FADE_OUT_MS = 360;
const FADE_IN_MS = 280;

// Tablet's inner readable width, in SVG viewBox units. Tablet runs
// from x=60 to x=740 in the cartouche markup; we leave ~30 units of
// margin on each side so text doesn't visually crowd the dotted
// inner stripes or the tablet's outer stroke.
const TABLET_INNER_WIDTH = 620;

// Maximum lines we'll wrap to. Two is the visual limit before the
// cartouche feels like a paragraph rather than a banner. Anything
// that wouldn't fit in two lines gets ellipsised on the second line.
const MAX_LINES = 2;

// Hard upper bound on raw headline length, applied before wrapping
// to keep absurdly long edge cases (rare, but Wikipedia portal
// bullets occasionally include a full subordinate clause) from
// generating a six-line wrap that we then have to truncate anyway.
const MAX_HEADLINE_CHARS = 220;

// Vertical layout. The cartouche's text element has y=42 in the
// viewBox (a baseline that puts a single line visually centered in
// the y=14..56 tablet). For two lines we shift the first baseline up
// to y=33 and place the second line 16 units lower at y=49 — both
// lines together still center on the tablet. LINE_HEIGHT must be
// kept consistent with the HEADLINE_STYLE font-size (14px) and a
// little leading.
const SINGLE_LINE_BASELINE_Y = 42;
const TWO_LINE_FIRST_BASELINE_Y = 33;
const LINE_HEIGHT = 16;

// How many of the day's events we'll cycle through before looping.
// The portal typically has ~30-60 events per day; ten gives the user
// a reasonable sample without making the loop feel endless.
const EVENT_LIMIT = 10;

// SVG <text> styles for each mode. Switched atomically with the
// content swap inside the fade window. Title mode: caps + spaced +
// medium-weight, the formal cartouche feel. Headline mode: smaller,
// not letter-spaced, italic — closer to a printed-page caption,
// which reads as "story" rather than "logo."
const TITLE_STYLE = {
  fontSize: "20px",
  fontWeight: "500",
  letterSpacing: "4px",
  fontStyle: "normal",
};

const HEADLINE_STYLE = {
  fontSize: "14px",
  fontWeight: "400",
  letterSpacing: "0",
  fontStyle: "italic",
};

/**
 * Initialize the cartouche cycler against an existing SVG cartouche.
 *
 * Idempotent enough that a double-call won't double up timers (we
 * clear any previous cycle on entry), but we don't expect that — the
 * bootstrap script calls this exactly once.
 *
 * If today's events can't be fetched (network error, Wikipedia outage,
 * or the portal page hasn't been written yet for early-UTC visits),
 * the cartouche silently stays on the static title. This is the
 * graceful-degradation default; the atlas is fully usable without the
 * news layer.
 *
 * @param {SVGElement} svgEl - The cartouche <svg> element.
 */
export async function initTitleNews(svgEl) {
  if (!svgEl) return;
  const textEl = svgEl.querySelector("text");
  if (!textEl) return;

  cancelExistingCycle(svgEl);

  // Click handler — installed once, dispatches based on a data
  // attribute that we set/clear with the fade. While the cartouche
  // is showing the title, the data attribute is absent and clicks
  // are ignored. While a headline is showing, the attribute holds
  // the source URL.
  textEl.addEventListener("click", () => {
    const url = textEl.dataset.sourceUrl;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  });

  // Pre-set the title style on first paint. The SVG markup carries
  // its own font-size etc., but we override via inline style here so
  // the cycle's atomic swap can rely on inline style as the source
  // of truth.
  applyStyle(textEl, TITLE_STYLE);
  textEl.style.transition = `opacity ${FADE_OUT_MS}ms ease`;

  let events;
  try {
    const data = await fetchTodayEvents();
    events = filterUsableEvents(data?.events ?? []).slice(0, EVENT_LIMIT);
  } catch (err) {
    console.warn(
      "[title-news] could not load current events; cartouche will stay on title",
      err
    );
    return;
  }

  if (!events || events.length === 0) {
    console.info("[title-news] no usable events today; cartouche staying on title");
    return;
  }

  console.info(`[title-news] cycling through ${events.length} events`);
  startCycle(svgEl, textEl, events);
}

/**
 * Drop events that wouldn't make sensible headlines: empty after
 * cleanup, navigation/header artifacts (very short, no spaces), etc.
 * The fetcher's parser already does most of this; one more pass here
 * keeps the cycle from showing junk like "edit" or "[1]" if anything
 * slips through.
 */
function filterUsableEvents(events) {
  return events.filter((e) => {
    if (!e?.headline) return false;
    if (e.headline.length < 20) return false;
    if (!/\s/.test(e.headline)) return false;
    return true;
  });
}

function startCycle(svgEl, textEl, events) {
  let index = 0;

  const showTitle = () => {
    delete textEl.dataset.sourceUrl;
    textEl.style.cursor = "";
    textEl.style.pointerEvents = "none";

    fadeTo(textEl, () => {
      applyStyle(textEl, TITLE_STYLE);
      setSingleLineText(textEl, TITLE_TEXT, SINGLE_LINE_BASELINE_Y);
    }).then(() => {
      schedule(svgEl, TITLE_HOLD_MS, showHeadline);
    });
  };

  const showHeadline = () => {
    const event = events[index % events.length];
    index += 1;
    const raw = truncateRaw(event.headline, MAX_HEADLINE_CHARS);

    let lineCount = 1;
    fadeTo(textEl, () => {
      applyStyle(textEl, HEADLINE_STYLE);
      lineCount = fitHeadline(textEl, raw, TABLET_INNER_WIDTH);
    }).then(() => {
      if (event.sourceUrl) {
        textEl.dataset.sourceUrl = event.sourceUrl;
        textEl.style.cursor = "pointer";
        // pointer-events:auto re-enables clicks on this element only
        // (the cartouche container is pointer-events:none so map
        // drag still works elsewhere).
        textEl.style.pointerEvents = "auto";
      }
      const hold =
        HEADLINE_HOLD_MS + (lineCount > 1 ? TWO_LINE_BONUS_MS : 0);
      schedule(svgEl, hold, showTitle);
    });
  };

  // Start with a normal title hold rather than diving straight into
  // a headline — gives the user a beat to register the title before
  // anything starts changing under them.
  schedule(svgEl, TITLE_HOLD_MS, showHeadline);
}

function schedule(svgEl, delayMs, fn) {
  const id = setTimeout(fn, delayMs);
  // Stash the timer ID on the element itself so cancelExistingCycle
  // can reach it without a module-level mutable. Avoids the foot-gun
  // where a second initTitleNews call leaves the first cycle's timer
  // running invisibly forever.
  svgEl._titleNewsTimer = id;
}

function cancelExistingCycle(svgEl) {
  if (svgEl._titleNewsTimer) {
    clearTimeout(svgEl._titleNewsTimer);
    svgEl._titleNewsTimer = null;
  }
}

/**
 * Animate textEl out, run a content/style swap, then animate back
 * in. Returns a promise that resolves when the new content is fully
 * visible.
 *
 * The fade-out includes a brief flicker (two fast opacity dips before
 * the final fade) — Ted's brief asked for "stickered flickering" on
 * the title transition, evoking an old film cut rather than a smooth
 * dissolve. The fade-in is clean so headlines don't stutter into
 * legibility.
 *
 * The applyContent callback is invoked at the swap point, after
 * opacity reaches zero and before opacity returns to one. Callers
 * use it to set both content and style atomically.
 */
function fadeTo(textEl, applyContent) {
  return new Promise((resolve) => {
    runFlickerOut(textEl).then(() => {
      applyContent();
      // Force a layout flush so the opacity:0 → opacity:1 transition
      // actually animates (without this, browsers can collapse the
      // two style writes into a single paint with no transition).
      void textEl.getBoundingClientRect();
      textEl.style.transition = `opacity ${FADE_IN_MS}ms ease`;
      textEl.style.opacity = "1";
      setTimeout(resolve, FADE_IN_MS);
    });
  });
}

function runFlickerOut(textEl) {
  return new Promise((resolve) => {
    // Two short visibility blips, then the final fade-out. Total
    // duration matches FADE_OUT_MS so callers can reason about
    // pacing as a single number.
    const blipMs = 60;
    const finalFadeMs = Math.max(0, FADE_OUT_MS - blipMs * 3);
    textEl.style.transition = "opacity 30ms linear";
    textEl.style.opacity = "0.25";
    setTimeout(() => {
      textEl.style.opacity = "1";
      setTimeout(() => {
        textEl.style.opacity = "0.4";
        setTimeout(() => {
          textEl.style.transition = `opacity ${finalFadeMs}ms ease`;
          textEl.style.opacity = "0";
          setTimeout(resolve, finalFadeMs);
        }, blipMs);
      }, blipMs);
    }, blipMs);
  });
}

function applyStyle(textEl, style) {
  for (const [k, v] of Object.entries(style)) {
    textEl.style[k] = v;
  }
}

/**
 * Replace the text element's children with a single line of text at
 * a specified baseline y. Used for the title and for headlines that
 * fit on one line.
 */
function setSingleLineText(textEl, content, baselineY) {
  while (textEl.firstChild) textEl.removeChild(textEl.firstChild);
  textEl.setAttribute("y", String(baselineY));
  textEl.textContent = content;
}

/**
 * Place a headline into the text element, wrapping it onto two lines
 * if a single line would exceed maxWidth. Returns the line count
 * actually used (1 or 2) so callers can adjust hold time.
 *
 * Wrapping is measured rather than character-counted: we set the
 * candidate text and call getComputedTextLength(). This is exact for
 * the current font/size/letter-spacing, but does require that
 * applyStyle(HEADLINE_STYLE) ran first.
 */
function fitHeadline(textEl, content, maxWidth) {
  // First try fitting on a single line.
  setSingleLineText(textEl, content, SINGLE_LINE_BASELINE_Y);
  if (textEl.getComputedTextLength() <= maxWidth) return 1;

  // Wrap. Greedy line-fill: keep adding words to the current line
  // until the next word would push us past maxWidth, then start a
  // new line.
  const words = content.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    textEl.textContent = candidate;
    if (textEl.getComputedTextLength() > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === MAX_LINES) break;
    } else {
      current = candidate;
    }
  }
  if (lines.length < MAX_LINES && current) lines.push(current);

  // If the source had more words than we could fit, ellipsise the
  // last line. The unfit words live in the suffix beyond `current`,
  // so just trim the line and add an ellipsis.
  if (lines.length === MAX_LINES) {
    const consumed = lines.join(" ").split(/\s+/).length;
    if (consumed < words.length) {
      let last = lines[MAX_LINES - 1];
      // Trim trailing punctuation/space so the ellipsis sits cleanly.
      last = last.replace(/[\s.,;:!?…]+$/, "") + "…";
      // Confirm the ellipsised line still fits; if not, drop the
      // last word and try again. Two iterations is plenty here.
      textEl.textContent = last;
      while (
        textEl.getComputedTextLength() > maxWidth &&
        last.includes(" ")
      ) {
        last = last.replace(/\s+\S+(\s*…)?$/, "…");
        textEl.textContent = last;
      }
      lines[MAX_LINES - 1] = last;
    }
  }

  // Render via tspans, baseline at the two-line first-line position.
  while (textEl.firstChild) textEl.removeChild(textEl.firstChild);
  textEl.setAttribute("y", String(TWO_LINE_FIRST_BASELINE_Y));
  for (let i = 0; i < lines.length; i++) {
    const tspan = document.createElementNS(SVG_NS, "tspan");
    tspan.setAttribute("x", "400");
    if (i > 0) tspan.setAttribute("dy", String(LINE_HEIGHT));
    tspan.textContent = lines[i];
    textEl.appendChild(tspan);
  }
  return lines.length;
}

function truncateRaw(s, maxLen) {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1).trimEnd() + "…";
}
