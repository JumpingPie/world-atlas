// src/core/timeline.js
//
// Vertical timeline visualization with split layout.
//
// The timeline lives inside the bottom drawer and shows the
// country's eras as a vertical rail on the left, with the active
// era's description filling the right side of the panel.
//
// Why vertical: era titles are textual labels (sometimes long, like
// "Holy Roman Empire" or "Cold War period"), and rendering them
// horizontally side-by-side caused them to overlap and become
// unreadable. Vertical stacking gives each label its own row so
// they're always legible.
//
// Why windowed: showing all 8–15 eras at once (all the way from
// "Prehistory" to "Contemporary") makes the rail too dense to
// scan. Instead we center the active era and fade neighbors with
// distance, so only ~3–5 eras are clearly visible at any time and
// the user navigates with the arrow buttons or keyboard. This is
// the same opacity-decay focus model as the original horizontal
// design, just with a vertical visual stack and a scrollIntoView
// auto-centering instead of computed Bezier positions.
//
// Interactions:
//   - Click an era marker to make it active.
//   - Click the up/down arrow buttons in the rail header/footer to
//     step through eras.
//   - Press ArrowUp / ArrowDown anywhere on the page (when the
//     bottom drawer is open) — the keyboard handler in index.html
//     dispatches a "timeline-step" event on the bottom panel; we
//     listen for it here.

/**
 * Build a timeline DOM element from an array of era objects.
 *
 * @param {Array<object>} eras - Era objects from the Wikipedia
 *     timeline fetcher; ordered chronologically (oldest → newest).
 * @returns {HTMLElement} The timeline root element.
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

  // Default active era is the most recent one — that's where users
  // most often want to start ("how did this country get to today").
  // From there they can navigate backward into earlier history.
  let activeIndex = eras.length - 1;

  const rail = buildRail(eras);
  const card = document.createElement("div");
  card.className = "timeline-era-card summary-section";

  root.appendChild(rail);
  root.appendChild(card);

  function setActive(index) {
    if (index < 0 || index >= eras.length) return;
    activeIndex = index;
    updateRail(rail, activeIndex);
    updateCard(card, eras[activeIndex]);
  }

  // Click handlers on era markers.
  rail.addEventListener("click", (event) => {
    const marker = event.target.closest(".timeline-marker");
    if (!marker) return;
    const idx = Number(marker.dataset.index);
    if (Number.isFinite(idx)) setActive(idx);
  });

  // Arrow buttons at the top and bottom of the rail.
  rail
    .querySelector(".timeline-prev")
    ?.addEventListener("click", () => setActive(activeIndex - 1));
  rail
    .querySelector(".timeline-next")
    ?.addEventListener("click", () => setActive(activeIndex + 1));

  // Keyboard step events — dispatched on the bottom panel by the
  // global keydown handler in index.html when the panel is open.
  // We listen on the document because by the time this timeline is
  // rendered, the bottom panel might have been re-mounted with new
  // content; document is a stable target.
  const onTimelineStep = (event) => {
    // Only respond if this timeline is still in the DOM. Older
    // timelines that were replaced when the user clicked another
    // country shouldn't react to keyboard input.
    if (!root.isConnected) return;
    setActive(activeIndex + (event.detail?.direction ?? 0));
  };
  document.addEventListener("timeline-step", onTimelineStep);
  // The listener leaks if the element is removed without cleanup,
  // but the bottom panel manager always replaces the entire root
  // (replaceChildren), so the orphaned listener has no effect on
  // the new content. The isConnected guard above is the actual
  // safety net.

  setActive(activeIndex);
  return root;
}

/**
 * Build the rail: prev arrow at top, era list in the middle,
 * next arrow at bottom. The list contains every era; CSS plus
 * scrollIntoView control which ones are visible.
 */
function buildRail(eras) {
  const rail = document.createElement("div");
  rail.className = "timeline-rail";

  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "timeline-nav timeline-prev";
  prev.setAttribute("aria-label", "Earlier era");
  prev.textContent = "▲";
  rail.appendChild(prev);

  // Wrapper exists so we can have overflow:hidden on the scroll
  // container while letting scrollIntoView operate inside it. The
  // <ol> itself has no overflow — it's just the content.
  const wrap = document.createElement("div");
  wrap.className = "timeline-era-list-wrap";

  const list = document.createElement("ol");
  list.className = "timeline-era-list";
  eras.forEach((era, i) => {
    const li = document.createElement("li");
    li.className = "timeline-marker";
    li.dataset.index = String(i);

    const dot = document.createElement("span");
    dot.className = "timeline-marker-dot";
    li.appendChild(dot);

    const label = document.createElement("span");
    label.className = "timeline-marker-label";
    label.textContent = era.title;
    li.appendChild(label);

    list.appendChild(li);
  });
  wrap.appendChild(list);
  rail.appendChild(wrap);

  const next = document.createElement("button");
  next.type = "button";
  next.className = "timeline-nav timeline-next";
  next.setAttribute("aria-label", "Later era");
  next.textContent = "▼";
  rail.appendChild(next);

  return rail;
}

/**
 * Update the rail's visual state for a new active era. Centers the
 * active marker in the wrapper, applies opacity decay to neighbors,
 * and disables the prev/next buttons at the edges.
 */
function updateRail(rail, activeIndex) {
  const wrap = rail.querySelector(".timeline-era-list-wrap");
  const markers = rail.querySelectorAll(".timeline-marker");

  markers.forEach((m) => {
    const i = Number(m.dataset.index);
    const distance = Math.abs(i - activeIndex);
    m.classList.toggle("is-active", i === activeIndex);
    // Gentle decay with a 0.4 floor so distant eras stay readable.
    // Earlier versions decayed all the way to 0.05, which made
    // far-away labels essentially invisible — fine for visual
    // focus but bad for orientation, since users couldn't see how
    // far back history extends without clicking through. The 0.4
    // minimum keeps the active era clearly brightest while every
    // era remains legible at a glance.
    const opacity = distance === 0 ? 1 : Math.max(0.4, 1 - distance * 0.15);
    m.style.opacity = String(opacity);
  });

  // Center the active marker in its scrollable wrapper. We use the
  // browser's native scroll-into-view rather than computing an
  // explicit transform — it adapts to actual rendered marker
  // heights without us having to assume a fixed row size.
  const activeMarker = rail.querySelector(
    `.timeline-marker[data-index="${activeIndex}"]`
  );
  if (activeMarker && wrap) {
    // scrollIntoView with block:"center" centers the element
    // vertically within its nearest scrollable ancestor, which is
    // the wrapper because we set overflow:hidden on it in CSS.
    activeMarker.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  // Edge-state arrows: at the first or last era, the corresponding
  // direction has nowhere to go. Disabling rather than hiding keeps
  // the visual layout stable.
  const prevBtn = rail.querySelector(".timeline-prev");
  const nextBtn = rail.querySelector(".timeline-next");
  if (prevBtn) prevBtn.disabled = activeIndex === 0;
  if (nextBtn) nextBtn.disabled = activeIndex === markers.length - 1;
}

/**
 * Render the active era's title and description into the right-
 * side card. We reuse the .summary-section class on the parent so
 * the same Wikipedia-HTML cleanup CSS used by the summary card's
 * History tab also applies here — citation suppression, paragraph
 * spacing, link styling are all shared.
 */
function updateCard(card, era) {
  card.replaceChildren();

  const heading = document.createElement("h3");
  heading.className = "timeline-era-title";
  heading.textContent = era.title;
  card.appendChild(heading);

  const body = document.createElement("div");
  body.className = "timeline-era-body";
  body.innerHTML = era.descriptionHtml;

  // Same outbound-link normalization as the summary card uses for
  // its History tab: rewrite relative /wiki/ links to absolute
  // Wikipedia URLs and ensure they open in a new tab.
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
    source.innerHTML = `<a href="${era.sourceUrl}" target="_blank" rel="noopener">Read this section on Wikipedia &rarr;</a>`;
    card.appendChild(source);
  }
}
