import {UNKNOWN} from "./capacity.mjs";

const NS = "http://www.w3.org/2000/svg";
const RADIANS = Math.PI / 180;
const number = new Intl.NumberFormat("en", {maximumFractionDigits: 3});
export function svg(tag, attributes = {}, value) {
  const node = document.createElementNS(NS, tag);
  for (const [key, attribute] of Object.entries(attributes)) node.setAttribute(key, attribute);
  if (value != null) node.textContent = value;
  return node;
}
function project(lon, lat) {
  return [lon, -Math.asinh(Math.tan(Math.max(-84, Math.min(84, lat)) * RADIANS)) / RADIANS];
}
function locate(projectRow) {
  return Number.isFinite(projectRow.lat) && Number.isFinite(projectRow.lon) ? project(projectRow.lon, projectRow.lat) : null;
}
const places = [
  ["PAKISTAN", 68, 29], ["CHINA", 94, 33], ["NEPAL", 83.7, 28.5], ["SRI LANKA", 81, 7],
  ["INDIA", 78.4, 24.6], ["Arabian Sea", 68.8, 15], ["Bay of Bengal", 87.2, 14.5],
];

export function createMap(countries, model, selectMark) {
  const map = document.getElementById("map");
  const base = document.getElementById("geography");
  const marks = document.getElementById("marks");
  const labels = document.getElementById("labels");
  const context = document.getElementById("map-context");
  const paths = new Map();
  let frame = 0;
  let lastMode = "plants";
  let currentSelection;
  let width, height, camera, sizeScale;

  for (const country of countries) {
    const path = svg("path", {d: country.d, class: "country", "fill-rule": "evenodd"});
    paths.set(country.adm0,path);
    base.append(path);
  }
  for (let lon = -180; lon <= 180; lon += 10) base.append(svg("path", {class: "grid-line", d: "M" + lon + ",-175v335"}));
  for (let lat = -70; lat <= 80; lat += 10) base.append(svg("path", {class:"grid-line", d: "M-180," + project(0,lat)[1] + "h360"}));
  function getCamera(mode) {
    let northWest = project(67, 36);
    let southEast = project(98, 7.1);
    if (mode === "owners") {
      const centers = model.destinations.filter(g => g.label).map(g => project(...g.label));
      if (centers.length) {
        const xs = centers.map(p => p[0]), ys = centers.map(p => p[1]);
        const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
        const dx = Math.max(25, right-left), dy = Math.max(17, bottom-top);
        northWest = [(left+right-dx)/2, (top+bottom-dy)/2];
        southEast = [(left+right+dx)/2, (top+bottom+dy)/2];
      }
    }
    const pad = width < 500 ? 28 : 55;
    const top = 69, bottom = 53;
    const scale = Math.min((width-2*pad)/(southEast[0]-northWest[0]),(height-top-bottom)/(southEast[1]-northWest[1]));
    return {scale, x: width/2-scale*(northWest[0]+southEast[0])/2, y: (height+top-bottom)/2-scale*(northWest[1]+southEast[1])/2};
  }
  function screen(point, cam) {return [cam.x+point[0]*cam.scale, cam.y+point[1]*cam.scale];}
  function moveCamera(cam) {base.setAttribute("transform", "translate(" + cam.x + " " + cam.y + ") scale(" + cam.scale + ")");}
  function radius(mt) {return Math.sqrt(mt)*sizeScale;}
  function drawLegend(largest) {
    const key = document.getElementById("size-key");
    const step = 10**Math.floor(Math.log10(largest));
    const values = largest < step*2 ? [step*.2,step] : [step,step*2];
    key.replaceChildren(document.createTextNode("Dot area"));
    for (const [index,value] of values.entries()) {
      const scale = document.createElement("span"), disk = document.createElement("i");
      scale.className = "scale-example";
      disk.style.width = disk.style.height = 2*radius(value)+"px";
      disk.setAttribute("aria-hidden","true");
      scale.append(disk,document.createTextNode(number.format(value)+(index === 1 ? " Mt/yr" : "")));
      key.append(scale);
    }
  }
  function markRecords(mode) {
    if (mode === "plants") {
      return model.projects.map(row => ({id: row.id, name: row.name, mt: row.netMt, color: row.group.color, point: locate(row)}));
    }
    return model.destinations.map(group => ({...group,point: group.label && project(...group.label)}));
  }
  function updateHighlights(mode) {
    for (const [code,path] of paths) {
      const active = mode === "plants" ? code === "IND" : model.destinations.some(group => group.id === code && group.mt > 0);
      path.classList.toggle("active-country", active);
    }
  }
  function drawSettled(mode) {
    marks.replaceChildren(); labels.replaceChildren(); context.replaceChildren();
    moveCamera(camera); updateHighlights(mode);
    const items = markRecords(mode).filter(item => item.point && item.mt > 0);
    const nodes = [];
    for (const item of items) {
      const [x,y] = screen(item.point,camera), r = radius(item.mt);
      const text = item.name + ", " + number.format(item.mt) + " Mt/yr";
      const group = svg("g", {class: "mark" + (item.id === currentSelection ? " selected" : ""), transform:"translate("+x+" "+y+")", role:"button",tabindex:"0","aria-label":"Inspect "+text, "aria-pressed":String(item.id === currentSelection), "data-id":item.id});
      group.append(svg("title",{},text), svg("circle",{r:Math.max(r+3,14),fill:"transparent"}), svg("circle",{class:"bubble",r,fill:item.color}), svg("circle",{class:"ring",r:r+3}));
      group.addEventListener("click",() => selectMark(item.id));
      group.addEventListener("keydown",event => {
        if (event.key === "Enter" || event.key === " ") {event.preventDefault(); selectMark(item.id); marks.querySelector(".selected")?.focus();}
      });
      marks.append(group);
      nodes.push({...item,x,y,r});
    }
    const occupied = nodes.map(n => [n.x-n.r-2,n.y-n.r-2,n.x+n.r+2,n.y+n.r+2]);
    const selectedBox = nodes.find(n => n.id === currentSelection);
    const ordered = selectedBox ? [selectedBox,...nodes.filter(n => n !== selectedBox)] : nodes;
    for (const n of ordered) {
      const name = n.name;
      const text = svg("text",{class:"map-label"},name);
      labels.append(text);
      const len = text.getComputedTextLength();
      const near = n.r + 7;
      const offsets = [[near,4],[-len-near,4],[-len/2,-near],[-len/2,near+8],[near,near+9],[-len-near,-near-2],[near,-near-2]];
      let labelPosition;
      for (const [dx,dy] of offsets) {
        const x = Math.min(width-len-7,Math.max(7,n.x+dx)), y = n.y+dy;
        const box = [x-2,y-10,x+len+2,y+4];
        if (y < 59 || y > height-34 || occupied.some(b => box[0]<b[2] && box[2]>b[0] && box[1]<b[3] && box[3]>b[1])) continue;
        labelPosition = [x,y]; occupied.push(box); break;
      }
      if (!labelPosition && n.id === currentSelection) labelPosition = [Math.min(width-len-7,Math.max(7,n.x-len/2)), Math.max(64,n.y-near-3)];
      if (!labelPosition) {text.remove();continue;}
      text.setAttribute("x",labelPosition[0]); text.setAttribute("y",labelPosition[1]);
    }
    if (mode === "plants") for (const [name,lon,lat] of places) {
      const [x,y] = screen(project(lon,lat),camera);
      const textWidth = name.length*7;
      if (x < textWidth/2+10 || x > width-textWidth/2-10 || y < 65 || y > height-34) continue;
      if (occupied.some(b => x-textWidth/2 < b[2] && x+textWidth/2 > b[0] && y-12 < b[3] && y+3 > b[1])) continue;
      context.append(svg("text",{class:name === name.toUpperCase()?"place-label":"sea-label",x,y},name));
    }
    const missing = mode === "plants" ? model.projects.filter(p => !locate(p)).reduce((a,p) => a+p.netMt,0) : model.destinations.find(g=>g.id===UNKNOWN).mt;
    const note = document.getElementById("unmapped");
    note.hidden = missing <= 0;
    note.textContent = missing > 0 ? number.format(missing) + " Mt/yr without a " + (mode === "plants" ? "plant coordinate" : "known country") : "";
  }
  function animate(to, oldCam, newCam) {
    marks.replaceChildren(); labels.replaceChildren(); context.replaceChildren();
    const pieces = [];
    for (const row of model.projects) for (const part of row.parts) {
      const destination = model.destinations.find(g=>g.id===part.id);
      const origin = locate(row);
      if (!destination?.label || !origin) continue;
      const hq = project(...destination.label);
      const circle = svg("circle",{r:radius(part.mt),fill:destination.color,stroke:"var(--water)","stroke-width":1});
      marks.append(circle);pieces.push({circle,origin,hq});
    }
    const start = performance.now();
    function step(now) {
      const t = Math.min(1,(now-start)/530), k = t*t*(3-2*t);
      const cam = Object.fromEntries(["x","y","scale"].map(key=>[key,oldCam[key]+(newCam[key]-oldCam[key])*k]));
      moveCamera(cam);
      const progress = to === "owners" ? k : 1-k;
      for (const {circle,origin,hq} of pieces) {
        const pos = screen(origin.map((v,i)=>v+(hq[i]-v)*progress),cam);
        circle.setAttribute("cx",pos[0]);circle.setAttribute("cy",pos[1]);
      }
      if (t < 1) frame=requestAnimationFrame(step);
      else {frame=0;drawSettled(to);}
    }
    updateHighlights(to);frame=requestAnimationFrame(step);
  }
  function render(mode, selected, motion = false) {
    cancelAnimationFrame(frame);
    width = map.clientWidth; height = map.clientHeight;
    if (!width || !height) return;
    map.setAttribute("viewBox","0 0 "+width+" "+height);
    const largest = Math.max(1,...model.projects.map(p=>p.netMt),...model.destinations.map(g=>g.mt));
    sizeScale = Math.min(26,Math.max(15,width*.035))/Math.sqrt(largest);
    drawLegend(largest);
    currentSelection = selected;
    const next = getCamera(mode), previous = camera;
    camera = next;
    if (motion && mode !== lastMode && previous && !matchMedia("(prefers-reduced-motion: reduce)").matches) animate(mode, previous, next);
    else drawSettled(mode);
    lastMode = mode;
  }
  new ResizeObserver(()=>render(lastMode,currentSelection)).observe(map);
  return render;
}
