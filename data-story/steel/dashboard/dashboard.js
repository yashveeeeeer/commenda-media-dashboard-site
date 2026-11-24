import {buildModel, UNKNOWN} from "./capacity.mjs";
import {createMap} from "./map.js";

const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat("en", {maximumFractionDigits: 3});
const percent = stake => new Intl.NumberFormat("en", {style:"percent",maximumFractionDigits:2}).format(stake);
const mt = value => number.format(value) + " Mt/yr";
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
async function read(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("Could not load " + path);
  return response.json();
}
function addSources(card, sources) {
  if (!sources?.length) return;
  const details = element("details",null,"sources");
  details.append(element("summary","Project sources"));
  const list = element("ul");
  for (const source of sources) {
    const item = element("li"), link = element("a",source.label);
    link.href = source.url; item.append(link); list.append(item);
  }
  details.append(list);card.append(details);
}
function addOwner(card, name, amount, info, chain) {
  const row = element("div",null,"owner-row");
  const owner = element("span", name);
  if (info) owner.append(element("span"," · " + info,"owner-country"));
  row.append(owner,element("span",amount,"share"));
  if (chain?.length) row.append(element("p",chain.join(" → "),"owner-chain"));
  card.append(row);
}

async function start() {
  const [data, geography] = await Promise.all([read("../data/projects.json"), read("./countries.json")]);
  const model = buildModel(data.projects, geography.countries);
  if (!model.projects.length) throw new Error("No verified project records are available.");
  let mode = "plants";
  let plantId = model.projects.find(p=>p.name.toLowerCase().includes("hazira"))?.id ?? model.projects[0].id;
  let countryId = model.destinations[0].id;
  const selectedId = () => mode === "plants" ? plantId : countryId;
  function select(id) {
    if (mode === "plants") plantId = id; else countryId = id;
    $("project").value = id;
    renderDetail();
    drawMap(mode,id);
  }
  const drawMap = createMap(geography.countries, model, id => {
    select(id);
    if (matchMedia("(max-width: 680px)").matches) {
      $("dialog-name").textContent = $("project").selectedOptions[0].text;
      $("dialog-content").replaceChildren(...[...$("project-card").children].map(node => node.cloneNode(true)));
      $("map-detail").showModal();
    } else {
      const panel = $("capacity");
      if ($("project-card").getBoundingClientRect().bottom > panel.getBoundingClientRect().bottom) {
        panel.scrollTop = $("project").getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - 44;
      }
    }
  });
  function renderDetail() {
    const card = $("project-card");
    card.replaceChildren();
    if (mode === "owners") {
      const group = model.destinations.find(g=>g.id === countryId);
      const allocation = group.id === UNKNOWN ? "with unresolved headquarters or equity" : "allocated to " + group.name;
      card.append(element("p", mt(group.mt) + " " + allocation + ".","meta"));
      for (const part of group.parts) {
        addOwner(card, part.project.name, mt(part.mt),part.sponsor?.name ?? "Undisclosed stake", [percent(part.stake)+" of "+mt(part.project.netMt)]);
      }
      if (!group.parts.length) card.append(element("p","All tonnes have a disclosed sponsor country.","meta"));
      return;
    }
    const row = model.projects.find(p => p.id === plantId);
    const state = row.state ? row.state+" · " : "";
    const locationNote = row.coordinateAccuracy === "approximate" ? " GEM gives an approximate map location." : "";
    card.append(element("p", state + mt(row.netMt) + " added. Operated by " + row.operator + "." + locationNote,"meta"));
    for (const owner of row.owners) {
      const country = model.countryByCode.get(owner.country)?.name ?? "Headquarters unknown";
      const allocation = owner.stake == null ? "Undisclosed" : percent(owner.stake) + " · " + mt(row.netMt * owner.stake);
      addOwner(card, owner.name, allocation, country, owner.chain);
    }
    const residual = row.parts.find(part=>!part.sponsor);
    if (residual) addOwner(card, "Unallocated equity", percent(residual.stake), mt(residual.mt));
    addSources(card,row.sources);
  }
  function render(modeChanged) {
    const isPlant = mode === "plants";
    for (const id of ["plants","owners"]) $(id).setAttribute("aria-pressed",String(id === mode));
    $("map-title").textContent = isPlant ? "Plant locations" : "Sponsor headquarters";
    $("map-subtitle").textContent = isPlant ? "Indian steelmaking sites" : "Capacity assigned to headquarters countries";
    $("map-description").textContent = isPlant ?
      "Dot area shows net capacity added at each Indian plant. Select a dot or choose a project to read its ownership chain." :
      "Dot area shows steel capacity attributed to the industrial sponsors in each country. Select a country for its contributing projects.";
    $("rank-heading").textContent = isPlant ? "Capacity by project ownership" : "Capacity by sponsor country";
    $("rank-note").textContent = isPlant ?
      "Incomplete stakes leave a project unresolved." :
      "Each country receives its sponsors’ disclosed equity share of each project.";
    const groups = isPlant ? model.groups : model.destinations;
    const strip = $("strip"), ranks = $("ranks");
    strip.replaceChildren();ranks.replaceChildren();
    for (const group of groups) {
      if (group.mt) {
        const segment = element("span");
        segment.style.width = percent(group.mt/model.total);
        segment.style.background = group.color;strip.append(segment);
      }
      const item = element("div",null,"rank"), swatch = element("span",null,"swatch");
      swatch.style.background = group.color;
      item.append(swatch,element("span", group.name),element("span",mt(group.mt),"value"));
      ranks.append(item);
    }
    document.querySelector("label[for=project]").textContent = isPlant ? "Inspect a project" : "Inspect a sponsor country";
    const options = isPlant ? model.projects : model.destinations;
    const chooser = $("project");
    chooser.replaceChildren(...options.map(item => new Option(item.name,item.id)));
    chooser.value = selectedId(); renderDetail();
    $("status").textContent = (isPlant ? "Plant locations" : "Owner locations") + " showing " + mt(model.total) + " in total.";
    drawMap(mode,selectedId(),modeChanged);
  }
  for (const id of ["plants","owners"]) {
    $(id).disabled = false;
    $(id).addEventListener("click",()=>{
      if (mode === id) return;
      if (id === "owners") {
        const row = model.projects.find(p => p.id === plantId);
        const largest = [...row.parts].sort((a,b)=>b.mt-a.mt)[0];
        if (largest) countryId = largest.id;
      }
      mode=id;
      $("capacity").scrollTop = 0;
      render(true);
    });
  }
  $("project").addEventListener("change", event=>select(event.target.value));
  $("capacity-total").textContent = number.format(model.total);
  $("scope").textContent = data.scopeLabel;
  const auditPhrase = "See the audit";
  const auditOffset = data.coverageNote.indexOf(auditPhrase);
  const ledgerLink = element("a",auditOffset >= 0 ? auditPhrase : "Project audit");
  ledgerLink.href = "../method/#ledger";
  if (auditOffset >= 0) {
    $("coverage").append(data.coverageNote.slice(0,auditOffset),ledgerLink,data.coverageNote.slice(auditOffset+auditPhrase.length));
  } else {
    $("coverage").append(data.coverageNote + " ",ledgerLink);
  }
  $("as-of").textContent = data.asOf ?? "";
  $("status").className = "visually-hidden";
  document.querySelector(".workspace").hidden = false;
  render(false);
}

start().catch(error => {
  $("status").textContent = "The capacity data could not be displayed. ";
  const link = element("a","Read the methodology");link.href="../method/";$("status").append(link);
  console.error(error);
});
