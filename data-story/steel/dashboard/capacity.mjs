const EPSILON = 1e-8;
export const UNKNOWN = "unknown";
export const ALL = "all";
export const categories = [
  {id:"domestic", name:"Domestic owners", color:"var(--coral)"},
  {id:"overseas", name:"Overseas owners", color:"var(--blue)"},
  {id:"mixed", name:"Domestic and overseas", color:"var(--pink)"},
  {id:UNKNOWN, name:"Unassigned ownership", color:"var(--unknown)"},
];

export function buildModel(projects, countries, measure = "gross", host = ALL) {
  const countryByCode = new Map();
  for (const country of countries) {
    if (country.iso3 && (!countryByCode.has(country.iso3) || country.adm0 === country.iso3)) {
      countryByCode.set(country.iso3, country);
    }
  }
  const scope = projects.filter(p => host === ALL || p.country === host);
  const allocations = new Map();
  const hosts = new Map();
  const groups = categories.map(c => ({...c, mt:0}));
  const equity = categories.filter(c => c.id !== "mixed").map(c => ({...c, mt:0}));
  const unknown = {id:UNKNOWN,name:"Unknown / unassigned",color:"var(--unknown)",parts:[],mt:0,localMt:0};
  allocations.set(UNKNOWN, unknown);
  const rows = [];
  let total = 0;
  for (const project of scope) {
    const amount = measure === "gross" ? project.grossMt : project.netMt;
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) throw new Error("Invalid project capacity.");
    const mt = amount ?? 0;
    const parts = [];
    let disclosed = 0;
    function addPart(sponsor, stake, destination) {
      const id = destination?.iso3 ?? UNKNOWN;
      const local = id !== UNKNOWN && id === project.country;
      if (!allocations.has(id)) allocations.set(id, {
        id, name:destination.name, label:destination.label, color:"var(--blue)", mt:0, localMt:0, parts:[]
      });
      const part = {id, sponsor, stake, local, mt:mt*stake, project};
      const group = allocations.get(id);
      group.mt += part.mt;
      if (local) group.localMt += part.mt;
      if (mt > 0) group.parts.push(part);
      const kind = id === UNKNOWN ? UNKNOWN : local ? "domestic" : "overseas";
      equity.find(c => c.id === kind).mt += part.mt;
      parts.push(part);
    }
    for (const owner of project.owners) {
      if (owner.stake == null || owner.stake === 0) continue;
      if (!Number.isFinite(owner.stake) || owner.stake < 0 || owner.stake > 1) throw new Error("Invalid equity share.");
      disclosed += owner.stake;
      addPart(owner,owner.stake,countryByCode.get(owner.country));
    }
    if (disclosed > 1 + EPSILON) throw new Error("Disclosed shares exceed 100% for " + project.id);
    if (disclosed < 1 - EPSILON) addPart(null,1-disclosed,null);
    const hasUnknown = parts.some(p => p.id === UNKNOWN);
    const hasDomestic = parts.some(p => p.local);
    const hasOverseas = parts.some(p => p.id !== UNKNOWN && !p.local);
    const category = hasUnknown ? UNKNOWN : hasDomestic && hasOverseas ? "mixed" : hasDomestic ? "domestic" : "overseas";
    const group = groups.find(g => g.id === category);
    group.mt += mt;
    const hostGroup = hosts.get(project.country) ?? {id:project.country, name:project.hostName, color:"var(--coral)", mt:0};
    hostGroup.mt += mt;
    hosts.set(project.country,hostGroup);
    rows.push({...project, amount, mt, parts, group});
    total += mt;
  }
  const ranked = values => [...values].filter(g => g.mt > 0).sort((a,b) => b.mt-a.mt || a.name.localeCompare(b.name));
  const destinations = ranked(allocations.values()).filter(g => g.id !== UNKNOWN);
  destinations.push(unknown);
  const allocated = destinations.reduce((a,g) => a+g.mt,0);
  if (Math.abs(total-allocated) > EPSILON*Math.max(total,1)) throw new Error("Owner-country allocations do not conserve capacity.");
  return {projects:rows.sort((a,b) => b.mt-a.mt || a.name.localeCompare(b.name)), total, groups, equity,
    hosts:ranked(hosts.values()), destinations, countryByCode, measure, host};
}
