// src/core/timeline.js
//
// Curved-baseline timeline visualization.
//
// Builds an SVG showing the country's eras as markers placed along
// a gently curved baseline path, with a description card below for
// the active era. Click any marker to make it active; the focus
// shifts (opacity-encoded so adjacent eras stay readable while
// distant ones fade), and the description swaps.
//
// Why a curved baseline rather than a flat strip: visual character
// — it evokes a paper scroll being held up at the corners, fits the
// atlas-as-paper aesthetic without needing decorative scrollwork.
// The curve is subtle enough that era spacing is still scannable
// left-to-right.
//
// What this owns: only the timeline DOM construction and its
// internal active-era state. Data fetching is upstream (the bottom
// panel manager calls the Wikipedia timeline fetcher and passes the
// resulting era array in). HTML rendering for era descriptions
// reuses the .summary-section CSS class so Wikipedia citation
// suppression and link rewriting are consistent with the History
// tab in the summary card.

// SVG geometry constants. Adjust to retune the curve's pronouncement
// or marker spacing without touching the layout code.
const SVG_HEIGHT = 110; // total vertical space for the curve + labels
const PADDING_X = 36; // pixel inset from left/right edges to the curve endpoints
const ENDPOINT_Y = 38; // y of the curve at left/right endpoints
const SAG_Y = 78; // y at the curve's midpoint — higher value = more sag
const MARKER_RADIUS_ACTIVE = 7;
const MARKER_RADIUS_INACTIVE = 4;
const LABEL_OFFSET_Y = 18; // distance below marker for label baseline

/**
 * Build a timeline DOM element from an array of era objects.
 *
 * @param {Array<object>} eras - Era objects from the Wikipedia
 *     timeline fetcher; ordered chronologically (oldest → newest).
 * @returns {HTMLElement} The timeline root.
 */
export function createTimeline(eras) {
  const root = document.createElement("div");
  root.className = "timeline-root";

  if (!eras || eras.length === 0) {
    const empty = document.createElement("div");
    empty.className = "card-empty";
    empty.textContent = "No timeline available for this country.";
    root.appendChild(empty);
    return root;
  }

  // Default to the most recent era — that's where users land most
  // usefully ("how did the country get to where it is today"). They
  // can click backward to explore earlier eras.
  let activeIndex = eras.length - 1;

  const svg = buildSvg(eras);
  const eraCard = document.createElement("div");
  eraCard.className = "timeline-era-card summary-section";

  root.appendChild(svg);
  root.appendChild(eraCard);

  // Wire up click handlers on each marker. The marker datum carries
  // the era's index (set when we build the SVG), so the handler can
  // pull it from the dataset attribute without a closure-per-marker
  // setup that would scale poorly with many eras.
  svg.querySelectorAll(".timeline-marker").forEach((marker) => {
    marker.addEventListener("click", () => {
      const idx = Number(marker.dataset.index);
      if (Number.isFinite(idx)) setActive(idx);
    });
  });

  function setActive(index) {
    activeIndex = index;
    updateMarkerStyles(svg, activeIndex);
    updateEraCard(eraCard, eras[activeIndex]);
  }

  setActive(activeIndex);
  return root;
}

/**
 * Build the SVG containing the curved baseline path and one marker
 * group per era. Marker positions are computed by sampling a
 * quadratic Bezier curve at evenly-spaced parameter values.
 */
function buildSvg(eras) {
  // viewBox width is set to a nominal 1000; the actual rendered
  // width comes from CSS (100% of container). Scaling is uniform
  // so the curve looks the same at any container width.
  const W = 1000;
  const H = SVG_HEIGHT;

  // Quadratic Bezier control points for the baseline. The path goes
  // from a point on the left, sags through the middle, and rises to
  // a point on the right. SAG_Y > ENDPOINT_Y produces the sag; if
  // we ever flip it, the curve becomes a hump.
  const x0 = PADDING_X;
  const y0 = ENDPOINT_Y;
  const xc = W / 2;
  const yc = SAG_Y;
  const x1 = W - PADDING_X;
  const y1 = ENDPOINT_Y;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "timeline-svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Baseline path — drawn behind the markers.
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", "timeline-baseline");
  path.setAttribute("d", `M ${x0},${y0} Q ${xc},${yc} ${x1},${y1}`);
  path.setAttribute("fill", "none");
  svg.appendChild(path);

  // Marker positions: sample t = i/(N-1) along the Bezier. With one
  // era, t is undefined (0/0); place that single marker at the
  // curve's midpoint.
  const n = eras.length;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const [mx, my] = bezier(t, x0, y0, xc, yc, x1, y1);
    svg.appendChild(buildMarker(eras[i], i, mx, my));
  }

  return svg;
}

/**
 * Compute (x, y) on a quadratic Bezier at parameter t in [0, 1].
 * Inlined here rather than imported because it's a four-line
 * formula and adding a math utility module for one use is overkill.
 */
function bezier(t, x0, y0, xc, yc, x1, y1) {
  const u = 1 - t;
  const x = u * u * x0 + 2 * u * t * xc + t * t * x1;
  const y = u * u * y0 + 2 * u * t * yc + t * t * y1;
  return [x, y];
}

/**
 * Build one marker group containing a circle, a label, and a
 * data-index attribute used by the click handler.
 */
function buildMarker(era, index, x, y) {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", "timeline-marker");
  g.setAttribute("transform", `translate(${x}, ${y})`);
  g.dataset.index = String(index);

  const circle = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle"
  );
  circle.setAttribute("class", "timeline-marker-dot");
  circle.setAttribute("r", String(MARKER_RADIUS_INACTIVE));
  g.appendChild(circle);

  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("class", "timeline-marker-label");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("y", String(LABEL_OFFSET_Y));
  text.textContent = era.title;
  g.appendChild(text);

  return g;
}

/**
 * Apply the active/dim styling to markers based on distance from the
 * active index. Mutates the existing SVG without re-building it so
 * transitions can interpolate cleanly.
 *
 * Opacity decay: the active marker is fully opaque, each step away
 * loses 0.18, clamped at 0.18 minimum so very-distant eras remain
 * visible. The active marker also grows in radius (set as an attr
 * directly so CSS transitions can animate it).
 */
function updateMarkerStyles(svg, activeIndex) {
  svg.querySelectorAll(".timeline-marker").forEach((marker) => {
    const i = Number(marker.dataset.index);
    const distance = Math.abs(i - activeIndex);
    const opacity = Math.max(0.18, 1 - distance * 0.18);
    marker.style.opacity = String(opacity);
    marker.classList.toggle("is-active", i === activeIndex);

    const dot = marker.querySelector(".timeline-marker-dot");
    if (dot) {
      dot.setAttribute(
        "r",
        String(i === activeIndex ? MARKER_RADIUS_ACTIVE : MARKER_RADIUS_INACTIVE)
      );
    }
  });
}

/**
 * Render the active era's description into the card area below the
 * curve. We reuse the .summary-section class on the parent so the
 * shared Wikipedia-HTML cleanup CSS (citation suppression, link
 * styling, paragraph spacing) applies without duplication.
 *
 * Internal links are rewritten to absolute Wikipedia URLs and set to
 * open in a new tab — same approach as the summary card's History
 * tab.
 */
function updateEraCard(card, era) {
  card.replaceChildren();

  const heading = document.createElement("h3");
  heading.className = "timeline-era-title";
  heading.textContent = era.title;
  card.appendChild(heading);

  const body = document.createElement("div");
  body.className = "timeline-era-body";
  body.innerHTML = era.descriptionHtml;

  // Same outbound-link normalization as the summary card.
  body.querySelectorAll('a[href^="/wiki/"]').forEach((a) => {
    a.setAttribute(
      "href",
      `https://en.wikipedia.org${a.getAttribute("href")}`
    );
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
  });
  body.querySelectorAll('img[src^="//"]').forEach((img) => {
    img.setAttribute("src", `https:${img.getAttribute("src")}`);
  });

  card.appendChild(body);

  if (era.sourceUrl) {
    const source = document.createElement("div");
    source.className = "timeline-era-source";
    source.innerHTML = `<a href="${era.sourceUrl}" target="_blank" rel="noopener">Read on Wikipedia &rarr;</a>`;
    card.appendChild(source);
  }
}
