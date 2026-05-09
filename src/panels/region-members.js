// src/panels/region-members.js
//
// Region members card.
//
// Renders for region selections only. Lists the region's member
// countries as a clickable list; clicking a member country sets
// selectedCountry (which automatically clears selectedRegion via
// state.setSelection's mutual-exclusion rule), causing the panel
// to re-render in country mode.
//
// This card is the V1 region experience. Later sections may add a
// region-stats card (population sum, GDP sum, list of organizations
// the region's members participate in, etc.) alongside this one.
// That work belongs in a separate card file rather than here, to
// keep this card focused on the navigational drill-down role.

import { setSelection } from "../core/state.js";

export default {
  id: "region-members",
  label: "Member countries",
  order: 10,

  /**
   * Render the card for a given selection.
   *
   * @param {{kind, ...}} selection - Typed selection from the panel.
   * @returns {HTMLElement | null}
   */
  render(selection) {
    if (selection?.kind !== "region") return null;

    const region = selection.region;
    const props = region.properties ?? {};
    const memberIds = props.countryIds ?? [];

    // Resolve each member ISO numeric to a country feature so we can
    // display a real name and pass the feature into setSelection. We
    // read this from the global map handle exposed at startup. The
    // dependency on window.__atlas is a known temporary — once we
    // have a proper app shell (planned for a later section) the
    // panel will receive the country lookup via dependency injection.
    const allCountries = window.__atlas?.mapHandle?.getCountries?.() ?? [];
    const byNumericId = new Map(
      allCountries.map((f) => [String(f.id).padStart(3, "0"), f])
    );

    const members = memberIds
      .map((iso) => {
        const code = String(iso).padStart(3, "0");
        return byNumericId.get(code) ?? null;
      })
      .filter((f) => f != null)
      .sort((a, b) =>
        (a.properties?.name ?? "").localeCompare(b.properties?.name ?? "")
      );

    const el = document.createElement("section");
    el.className = "panel-card region-members-card";

    if (members.length === 0) {
      el.innerHTML = `
        <div class="card-empty">
          No member countries resolved for this region. Check the
          ISO list in data/geo/regions.json.
        </div>
      `;
      return el;
    }

    // Header line above the list — explains how to use it without
    // requiring a separate help affordance.
    const header = document.createElement("p");
    header.className = "region-members-header";
    header.textContent = `${members.length} member${members.length === 1 ? "" : "s"}. Click any to view its details.`;
    el.appendChild(header);

    const list = document.createElement("ul");
    list.className = "region-members-list";

    for (const country of members) {
      const li = document.createElement("li");
      li.className = "region-member";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "region-member-btn";
      btn.textContent = country.properties?.name ?? `Country ${country.id}`;
      btn.addEventListener("click", () => {
        // Setting a country selection clears the region selection
        // via setSelection's mutual-exclusion rule, which causes
        // the panel to re-render in country mode automatically.
        setSelection("country", country);
      });

      li.appendChild(btn);
      list.appendChild(li);
    }

    el.appendChild(list);
    return el;
  },
};
