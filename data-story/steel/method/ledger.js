(() => {
  const ledger = document.querySelector("#ledger");
  const controls = ledger.querySelector(".ledger-controls");
  const query = controls.querySelector("#ledger-query");
  const outcome = controls.querySelector("#ledger-outcome");
  const review = controls.querySelector("#ledger-review");
  const count = controls.querySelector(".ledger-count");
  const clear = controls.querySelector(".ledger-clear");
  const countryNav = ledger.querySelector(".host-nav");

  function normalize(text) {
    return text.toLowerCase().normalize("NFD")
      .replace(/\p{M}/gu, "").replace(/['’‘]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }

  const groups = Array.from(ledger.querySelectorAll(".ledger-country"), element => {
    const heading = element.querySelector("h3");
    const jump = countryNav.querySelector(`a[href="#${heading.id}"]`);
    const sites = Array.from(element.querySelectorAll("details"), site => ({
      site, text: normalize(site.dataset.search)
    }));
    return {element, jump, sites};
  });
  const total = groups.reduce((sum, group) => sum + group.sites.length, 0);
  const reviewStates = new Set(groups.flatMap(group => group.sites.map(({site}) => site.dataset.review)));
  if (reviewStates.size < 2) {
    review.parentElement.hidden = true;
    controls.classList.add("single-review-state");
  }

  function filterLedger() {
    const words = normalize(query.value).split(" ").filter(Boolean);
    let matches = 0;
    for (const {element, jump, sites} of groups) {
      let countryMatches = 0;
      for (const {site, text} of sites) {
        const visible = (!outcome.value || outcome.value === site.dataset.outcome)
          && (!review.value || review.value === site.dataset.review)
          && words.every(word => text.includes(word));
        site.hidden = !visible;
        if (visible) countryMatches++;
      }
      element.hidden = jump.hidden = countryMatches === 0;
      matches += countryMatches;
    }
    countryNav.hidden = matches === 0;
    clear.disabled = !query.value && !outcome.value && !review.value;
    count.textContent = matches
      ? `Showing ${matches} of ${total} projects`
      : `No matching projects out of ${total}. Change your search or clear the filters.`;
  }

  function clearFilters() {
    controls.reset();
    filterLedger();
  }

  function revealAnchor() {
    const target = document.getElementById(location.hash.slice(1));
    if (!target || !target.closest(".ledger-country")) return;
    if (target.hidden || target.closest(".ledger-country").hidden) clearFilters();
    let focusTarget = target;
    if (target.tagName === "DETAILS") {
      target.open = true;
      focusTarget = target.querySelector("summary");
    }
    focusTarget.focus({preventScroll: true});
    target.scrollIntoView({block: "start"});
  }

  controls.addEventListener("submit", event => event.preventDefault());
  query.addEventListener("input", filterLedger);
  outcome.addEventListener("change", filterLedger);
  review.addEventListener("change", filterLedger);
  clear.addEventListener("click", () => {
    clearFilters();
    query.focus();
  });
  window.addEventListener("hashchange", revealAnchor);
  filterLedger();
  controls.hidden = false;
  revealAnchor();
})();
