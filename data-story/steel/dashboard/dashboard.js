import {ALL, UNKNOWN, buildModel, categories} from "./capacity.mjs";
import {createMap} from "./map.js";

const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat("en",{maximumFractionDigits:3});
const percentage = new Intl.NumberFormat("en",{style:"percent",maximumFractionDigits:2});
const mt = value => number.format(value)+" Mt/yr";
function node(tag, text, className) {
  const el=document.createElement(tag);
  if (text!=null) el.textContent=text;
  if (className) el.className=className;
  return el;
}
async function read(path) {
  const response=await fetch(path);
  if (!response.ok) throw new Error("Could not load "+path);
  return response.json();
}
function addSources(card, sources) {
  if (!sources?.length) return;
  const details=node("details",null,"sources"), list=node("ul");
  details.append(node("summary","Project sources"));
  for (const source of sources) {
    const item=node("li"), link=node("a",source.label);
    link.href=source.url;item.append(link);list.append(item);
  }
  details.append(list);card.append(details);
}
function ownerRow(card, name, amount, info, chain) {
  const row=node("div",null,"owner-row"), owner=node("span",name);
  if (info) owner.append(node("span"," · "+info,"owner-country"));
  row.append(owner,node("span",amount,"share"));
  const path=chain?.map(link=>typeof link==="string"?link:link.name).filter(Boolean);
  if (path?.length) row.append(node("p",path.join(" → "),"owner-chain"));
  card.append(row);
}
function swatch(color) {
  const dot=node("i",null,"swatch");dot.style.background=color;return dot;
}
function counted(n, word) {return n+" "+word+(n===1?"":"s");}
function countryCount(n) {return n+(n===1?" country":" countries");}

async function start() {
  const [data, geography]=await Promise.all([read("../data/world.json"),read("./countries.json")]);
  if (!data.projects?.length) throw new Error("No project records available.");
  const countries=geography.countries;
  const hostNames=new Map(data.projects.map(p=>[p.country,p.hostName]));
  for (const [code,name] of [...hostNames].sort((a,b)=>a[1].localeCompare(b[1]))) $("host").add(new Option(name,code));
  let model=buildModel(data.projects,countries), mode="plants";
  let plantId=model.projects.find(p=>p.id==="P100000120513")?.id ?? model.projects[0].id;
  let countryId=model.destinations[0].id;
  const selectedId=()=>mode==="plants"?plantId:countryId;
  const drawMap=createMap(countries, id=>select(id,true));
  function select(id,fromMap=false) {
    if (mode==="plants") plantId=id;else countryId=id;
    $("project").value=id;
    renderDetail();
    drawMap(model,mode,id);
    if (fromMap && matchMedia("(max-width:680px)").matches) {
      $("dialog-name").textContent=$("project").selectedOptions[0]?.text;
      $("dialog-content").replaceChildren(...[...$("project-card").children].map(el=>el.cloneNode(true)));
      $("map-detail").showModal();
    } else if (fromMap) {
      const panel=$("capacity");
      const offset=$("project").getBoundingClientRect().top-panel.getBoundingClientRect().top;
      if (offset+130>panel.clientHeight || offset<0) panel.scrollTop+=offset-42;
    }
  }
  function renderDetail() {
    const card=$("project-card");card.replaceChildren();
    if (mode==="owners") {
      const group=model.destinations.find(g=>g.id===countryId);
      const known=group.id!==UNKNOWN;
      card.append(node("p",mt(group.mt)+(known?" allocated to owners based in "+group.name+".":" unassigned to an owner country. This includes missing stakes or headquarters and financial owners excluded from the map."),"meta"));
      if (known && group.mt) card.append(node("p",mt(group.localMt)+" at plants in "+group.name+" · "+mt(group.mt-group.localMt)+" abroad.","meta"));
      const ordered=group.parts.slice().sort((a,b)=>b.mt-a.mt);
      if (!ordered.length) card.append(node("p","No tonnes in this selection fall into this group.","meta"));
      const more=node("details",null,"sources");
      if (ordered.length>4) more.append(node("summary","Show "+(ordered.length-4)+" more allocations"));
      ordered.forEach((part,i)=>{
        ownerRow(i<4?card:more,part.project.name,mt(part.mt),part.sponsor?.name ?? "Undisclosed allocation",
          [part.project.hostName,percentage.format(part.stake)+" of "+mt(model.measure==="gross"?part.project.grossMt:part.project.netMt)]);
      });
      if (ordered.length>4) card.append(more);
      return;
    }
    const row=model.projects.find(p=>p.id===plantId);
    if (!row) return;
    const region=[row.state,row.hostName].filter(Boolean).join(", ");
    const gross=row.grossMt==null?"Construction capacity unreported":mt(row.grossMt)+" under construction";
    const net=row.netMt==null?"net addition unresolved":mt(row.netMt)+" checked net addition";
    card.append(node("p",region+" · "+gross+" · "+net+".","meta"));
    if (row.operator) card.append(node("p","GEM-listed site company · "+row.operator,"meta"));
    for (const owner of row.owners) {
      const dest=model.countryByCode.get(owner.country ?? owner.reportedCountry);
      const hq=dest?.name ?? "HQ unresolved";
      const role=owner.role?.includes("financial") || owner.role?.includes("investment")?"financial owner":null;
      const info=owner.country?hq:[hq,role,"unassigned"].filter(Boolean).join(" · ");
      const amount=owner.stake==null?"Undisclosed":percentage.format(owner.stake)+(row.amount==null?"":" · "+mt(row.mt*owner.stake));
      ownerRow(card,owner.name,amount,info,owner.chain);
    }
    const residual=row.parts.find(p=>!p.sponsor);
    if (residual) ownerRow(card,"Unallocated equity",percentage.format(residual.stake)+(row.amount==null?"":" · "+mt(residual.mt)),"Unknown");
    if (row.ownershipBasis) {
      const detail=node("details",null,"sources");
      const gem=row.ownershipBasis.startsWith("GEM September 2026 map parent stakes");
      const basis=gem?"September 2026 parent stakes from GEM, matched to the owner’s GEM headquarters record.":row.ownershipBasis;
      detail.append(node("summary",gem?"GEM-reported ownership":"Ownership evidence"),node("p",basis));card.append(detail);
    }
    if (row.reviewNote) {
      const detail=node("details",null,"sources");
      detail.append(node("summary",row.decision || "Net-capacity check"),node("p",row.reviewNote));card.append(detail);
    }
    addSources(card,row.sources);
  }
  function countryRows() {
    const plants=mode==="plants", source=plants?model.hosts:model.destinations.filter(g=>g.id!==UNKNOWN);
    const result=source.slice(0,3);
    if (source.length>3) {
      const members=source.slice(3);
      result.push({name:"Other countries",members,mt:members.reduce((sum,row)=>sum+row.mt,0),color:plants?"var(--coral)":"var(--blue)"});
    }
    if (!plants) result.push(model.destinations.find(g=>g.id===UNKNOWN));
    return result;
  }
  function renderRanking() {
    const view=$("breakdown").value;
    const rows=view==="countries"?countryRows():view==="projects"?model.groups:model.equity;
    $("strip").replaceChildren();$("ranks").replaceChildren();
    $("strip").hidden=view==="countries";
    for (const entry of rows) {
      const ratio=model.total?entry.mt/model.total:0;
      const item=node("div",null,"rank"+(view==="countries"?" meter":""));
      item.style.setProperty("--share",100*ratio+"%");
      item.style.setProperty("--color",entry.color);
      item.append(swatch(entry.color),node("span",entry.name),node("span",number.format(entry.mt),"value"));
      if (entry.members) {
        const details=node("details",null,"rank-more"), header=node("summary"), list=node("ol");
        header.append(item);details.append(header,list);
        for (const member of entry.members) {
          const li=node("li");
          li.append(node("span",member.name),node("span",number.format(member.mt),"value"));list.append(li);
        }
        $("ranks").append(details);
      } else $("ranks").append(item);
      if (ratio>0 && view!=="countries") {
        const segment=node("span");segment.style.background=entry.color;segment.style.width=100*ratio+"%";$("strip").append(segment);
      }
    }
    $("rank-note").textContent=view==="projects"?"Whole plants, in Mt/yr. An incomplete ownership record puts the whole plant in grey.":
      view==="equity"?"Mt/yr split by equity. Domestic and overseas are relative to each plant’s country.":
      mode==="plants"?"Capacity at plant locations, in Mt/yr.":"Dots mark headquarters countries. Mt/yr split by disclosed stakes. Grey shows unallocated tonnes.";
  }
  function render(modeChanged=false) {
    const plants=mode==="plants",gross=model.measure==="gross";
    const selectedBreak=$("breakdown").value || "countries";
    $("breakdown").replaceChildren(new Option(plants?"Plant countries":"Owner countries","countries"),new Option("Project ownership","projects"),new Option("Equity by owner location","equity"));
    $("breakdown").value=selectedBreak;
    for (const key of ["plants","owners"]) $(key).setAttribute("aria-pressed",String(key===mode));
    $("map-title").textContent=plants?"Plant locations":"Owner headquarters countries";
    $("map-description").textContent=plants?"Circle area is proportional to capacity. Choose a plant country to separate nearby mills, or inspect a plant in the list.":
      "The same capacity is apportioned to owners’ headquarters countries by equity. Grey includes missing stakes, missing headquarters and shares held by financial owners.";
    $("scope").textContent=model.host===ALL?"Worldwide":hostNames.get(model.host);
    $("capacity-total").textContent=number.format(model.total);
    $("definition").textContent=gross?"Crude-steel capacity under construction, including replacements":"Checked net additions to crude-steel capacity";
    const positive=model.projects.filter(row=>row.mt>0).length;
    const pending=model.projects.filter(row=>row.amount==null);
    const missing=pending.length;
    const excluded=model.projects.filter(row=>row.amount===0).length;
    const missingNote=missing===1?"One site in "+pending[0].hostName+" has unreported capacity.":
      missing?counted(missing,"site")+" with unreported capacity.":"";
    const grossScope=positive?counted(positive,"quantified site")+(model.host===ALL?" in "+countryCount(model.hosts.length):"")+". ":"";
    $("coverage").textContent=gross?grossScope+missingNote:
      counted(positive,"site")+" with verified additions. "+excluded+" with zero addition. "+missing+" awaiting a net figure.";
    const key=$("color-key");key.replaceChildren();
    const labels=plants?["Domestic","Overseas","Mixed","Unassigned"]:["At home","Abroad","Unassigned"];
    (plants?categories:categories.filter(c=>c.id!=="mixed")).forEach((c,i)=>{
      const label=node("span");label.append(swatch(c.color),document.createTextNode(labels[i]));key.append(label);
    });
    const select=$("project");select.replaceChildren();
    document.querySelector('label[for="project"]').textContent=plants?"Inspect a plant":"Inspect an owner country";
    if (plants) {
      const byHost=new Map();
      for (const row of [...model.projects].sort((a,b)=>a.hostName.localeCompare(b.hostName)||a.name.localeCompare(b.name))) {
        if (!byHost.has(row.country)) {const group=node("optgroup");group.label=row.hostName;select.append(group);byHost.set(row.country,group);}
        byHost.get(row.country).append(new Option(row.name,row.id));
      }
    } else model.destinations.forEach(g=>select.add(new Option(g.name,g.id)));
    select.value=selectedId();
    renderRanking();renderDetail();drawMap(model,mode,selectedId(),modeChanged);
    $("status").textContent=$("scope").textContent+", "+mt(model.total)+", "+$("map-title").textContent+".";
  }
  for (const key of ["plants","owners"]) $(key).addEventListener("click",()=>{
    if (mode===key) return;
    if (key==="owners") {
      const row=model.projects.find(p=>p.id===plantId);
      const strongest=row?.parts.slice().sort((a,b)=>b.mt-a.mt)[0];
      countryId=model.destinations.some(g=>g.id===strongest?.id)?strongest.id:model.destinations[0].id;
    }
    mode=key;render(true);$("capacity").scrollTop=0;
  });
  function rescope() {
    model=buildModel(data.projects,countries,$("measure").value,$("host").value);
    if (!model.projects.some(p=>p.id===plantId)) plantId=model.projects[0]?.id;
    if (!model.destinations.some(g=>g.id===countryId)) countryId=model.destinations[0].id;
    render();$("capacity").scrollTop=0;
  }
  $("host").addEventListener("change",rescope);$("measure").addEventListener("change",rescope);
  $("project").addEventListener("change",()=>select($("project").value));
  $("breakdown").addEventListener("change",renderRanking);
  $("unmapped").addEventListener("click",()=>select(UNKNOWN,true));
  document.querySelector(".workspace").hidden=false;
  for (const id of ["plants","owners","host","measure"]) $(id).disabled=false;
  $("status").className="visually-hidden";render();
}
start().catch(error=>{
  console.error(error);
  $("status").className="loading";
  $("status").textContent="The steel project data could not be loaded. Reload to try again.";
});
