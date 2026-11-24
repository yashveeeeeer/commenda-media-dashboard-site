const EPSILON = 1e-8;
export const UNKNOWN = "unknown";
export const categories = [
  {id: "indian", name: "Indian-backed", color: "var(--coral)"},
  {id: "overseas", name: "Overseas-backed", color: "var(--blue)"},
  {id: "mixed", name: "Indian and overseas", color: "var(--pink)"},
  {id: UNKNOWN, name: "Unresolved ownership", color: "var(--unknown)"},
];

export function buildModel(projects, countries) {
  const countryByCode = new Map();
  for (const country of countries) {
    if (country.iso3 && (!countryByCode.has(country.iso3) || country.adm0 === country.iso3)) {
      countryByCode.set(country.iso3, country);
    }
  }
  const unknown = {id: UNKNOWN, name: "Unknown", color: "var(--unknown)", mt: 0, parts: []};
  const allocations = new Map([[UNKNOWN, unknown]]);
  const groups = categories.map(category => ({...category, mt: 0}));
  const rows = [];
  const ids = new Set();
  let total = 0;
  for (const project of projects) {
    if (!project.id || ids.has(project.id) || !Number.isFinite(project.netMt) || project.netMt <= 0) {
      throw new Error("Each mapped project must have a unique ID and positive net capacity.");
    }
    ids.add(project.id);
    if (!Array.isArray(project.owners)) throw new Error("Missing sponsor records.");
    let disclosed = 0;
    let domestic = false;
    let overseas = false;
    const parts = [];
    for (const sponsor of project.owners) {
      if (sponsor.stake == null) continue;
      if (!Number.isFinite(sponsor.stake) || sponsor.stake < 0 || sponsor.stake > 1) throw new Error("Invalid equity share.");
      disclosed += sponsor.stake;
      if (!sponsor.stake) continue;
      const country = countryByCode.get(sponsor.country);
      const id = country ? country.iso3 : UNKNOWN;
      if (!allocations.has(id)) {
        allocations.set(id, {id, name: country.name, label: country.label, color: id === "IND" ? "var(--coral)" : "var(--blue)", mt: 0, parts: []});
      }
      if (id === "IND") domestic = true;
      else if (id !== UNKNOWN) overseas = true;
      parts.push({id, sponsor, stake: sponsor.stake, mt: project.netMt * sponsor.stake, project});
    }
    if (disclosed > 1 + EPSILON) throw new Error("Disclosed stakes exceed 100%.");
    if (disclosed < 1 - EPSILON) {
      const stake = 1 - disclosed;
      parts.push({id: UNKNOWN, sponsor: null, stake, mt: project.netMt * stake, project});
    }
    for (const part of parts) {
      const group = allocations.get(part.id);
      group.mt += part.mt;
      group.parts.push(part);
    }
    let groupId = UNKNOWN;
    if (!parts.some(part => part.id === UNKNOWN)) groupId = domestic && overseas ? "mixed" : domestic ? "indian" : "overseas";
    const group = groups.find(category => category.id === groupId);
    group.mt += project.netMt;
    rows.push({...project, group, parts});
    total += project.netMt;
  }
  const destinations = [...allocations.values()].filter(group => group.id !== UNKNOWN).sort((a,b) => b.mt - a.mt);
  destinations.push(unknown);
  const allocated = destinations.reduce((sum, group) => sum + group.mt, 0);
  if (Math.abs(total - allocated) > EPSILON * Math.max(1,total)) throw new Error("Sponsor allocations do not reconcile.");
  return {projects: rows.sort((a,b) => b.netMt - a.netMt), total, groups, destinations, countryByCode};
}
