import {ALL, UNKNOWN} from "./capacity.mjs";

const NS = "http://www.w3.org/2000/svg";
const number = new Intl.NumberFormat("en",{maximumFractionDigits:3});
const radians = Math.PI/180;

function svg(tag, attrs = {}, content) {
  const node = document.createElementNS(NS,tag);
  for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
  if (content != null) node.textContent = content;
  return node;
}
function project(lon,lat) {
  return [lon, -Math.asinh(Math.tan(Math.max(-84,Math.min(84,lat))*radians))/radians];
}
function locate(row) {
  return Number.isFinite(row.lat) && Number.isFinite(row.lon) ? project(row.lon,row.lat) : null;
}
function fit(points, width, height, worldwide) {
  let left = -174, right = 175, top = project(0,72)[1], bottom = project(0,-55)[1];
  if (!worldwide && points.length) {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
    const xpad = Math.max(3,(xmax-xmin)*.15), ypad = Math.max(3,(ymax-ymin)*.15);
    left=xmin-xpad; right=xmax+xpad; top=ymin-ypad; bottom=ymax+ypad;
  }
  const xpad=width < 500 ? 15 : 28, ytop=64, ybottom=width < 470 ? 102 : 88;
  const scale=Math.min((width-2*xpad)/(right-left),(height-ytop-ybottom)/(bottom-top));
  return {scale,x:width/2-scale*(left+right)/2,y:(height+ytop-ybottom)/2-scale*(top+bottom)/2};
}
function screen(point,camera) {return [camera.x+point[0]*camera.scale,camera.y+point[1]*camera.scale];}

// An owner country can back domestic and foreign sites in the same view.
function bubble(group, item, radius) {
  const mixed = item.localMt > 0 && item.localMt < item.mt - 1e-7;
  const color = item.localMt >= item.mt - 1e-7 ? "var(--coral)" : item.color;
  group.append(svg("circle",{class:"bubble",r:radius,fill:color}));
  if (mixed) {
    const theta = 2*Math.PI*item.localMt/item.mt, endX = radius*Math.sin(theta), endY = -radius*Math.cos(theta);
    const d = "M0 0 L0 " + -radius + " A" + radius + " " + radius + " 0 " + (theta>Math.PI?1:0) + " 1 " + endX + " " + endY + " Z";
    group.append(svg("path",{d,fill:"var(--coral)","pointer-events":"none"}));
    group.append(svg("circle",{class:"outline",r:radius,fill:"none"}));
  }
}

export function createMap(countries, selectMark) {
  const map=document.getElementById("map"), base=document.getElementById("geography");
  const marks=document.getElementById("marks"), labels=document.getElementById("labels");
  const paths=[];
  let previous,model,mode,selected,frame=0;
  for (const country of countries) {
    const path=svg("path",{d:country.d,class:"country","fill-rule":"evenodd"});
    paths.push([country.iso3,path]);base.append(path);
  }
  for (let lon=-180;lon<=180;lon+=30) base.append(svg("path",{class:"grid-line",d:"M"+lon+",-175v335"}));
  for (let lat=-60;lat<=80;lat+=30) base.append(svg("path",{class:"grid-line",d:"M-180,"+project(0,lat)[1]+"h360"}));
  function draw(modelNext,modeNext,selectedNext,motion=false) {
    cancelAnimationFrame(frame);
    model=modelNext;mode=modeNext;selected=selectedNext;
    const width=map.clientWidth,height=map.clientHeight;
    if (!width || !height) return;
    const plants=mode==="plants";
    const items=(plants ? model.projects.map(p=>({id:p.id,name:p.name,mt:p.mt,point:locate(p),color:p.group.color})) :
      model.destinations.map(g=>({...g,point:g.label && project(...g.label)}))).filter(item=>item.mt>0 && item.point);
    const points=items.map(item=>item.point);
    const hostCountry=model.countryByCode.get(model.host);
    if (!points.length && hostCountry?.label) points.push(project(...hostCountry.label));
    const camera=fit(points,width,height,model.host===ALL);
    const largest=Math.max(.1,...model.projects.map(p=>p.mt),...model.destinations.filter(g=>g.id!==UNKNOWN).map(g=>g.mt));
    const sizeScale=Math.min(29,Math.max(16,width*.048))/Math.sqrt(largest);
    const radius=mt=>Math.sqrt(mt)*sizeScale;
    map.setAttribute("viewBox","0 0 "+width+" "+height);
    const active=new Set((plants ? model.hosts : model.destinations).filter(g=>g.mt>0).map(g=>g.id));
    for (const [code,path] of paths) path.classList.toggle("active-country",active.has(code));
    const positionBase=c=>base.setAttribute("transform","translate("+c.x+" "+c.y+") scale("+c.scale+")");
    const key=document.getElementById("size-key");
    key.replaceChildren(document.createTextNode("Dot area"));
    if (items.length) {
      const step=10**Math.floor(Math.log10(largest));
      const values=largest<2*step?[step*.2,step]:[step,step*2];
      values.forEach((value,index)=>{
        const span=document.createElement("span"),disc=document.createElement("i");
        span.className="scale-example";disc.style.width=disc.style.height=(2*radius(value))+"px";
        span.append(disc,number.format(value)+(index===1?" Mt/yr":""));key.append(span);
      });
    }
    const unknown=model.destinations.find(g=>g.id===UNKNOWN).mt;
    const unmapped=document.getElementById("unmapped");
    unmapped.hidden=plants || !unknown;
    unmapped.textContent="Unassigned · "+number.format(unknown)+" Mt/yr";
    const noCoordinates=model.projects.filter(p=>p.mt>0&&!locate(p)).reduce((sum,p)=>sum+p.mt,0);
    const note=document.getElementById("map-message");
    note.hidden=items.length>0 && (!plants || !noCoordinates);
    if (plants && noCoordinates) {
      note.textContent=number.format(noCoordinates)+" Mt/yr has no plant coordinates.";
    } else {
      note.textContent=model.total>0?"All tonnes in this selection are unassigned to an owner country.":
        model.measure==="net"?"No verified net additions in this selection.":"Construction capacity is unreported in this selection.";
    }
    marks.replaceChildren();labels.replaceChildren();
    function settle() {
      positionBase(camera);marks.replaceChildren();labels.replaceChildren();
      const labelNodes=[];
      // Draw smaller sites last so a large neighbour cannot hide them.
      const ordered=[...items].sort((a,b)=>(a.id===selected)-(b.id===selected) || b.mt-a.mt);
      const focusId=items.some(item=>item.id===selected)?selected:ordered[0]?.id;
      for (const item of ordered) {
        const [x,y]=screen(item.point,camera),r=radius(item.mt);
        const text=item.name+", "+number.format(item.mt)+" Mt/yr";
        const group=svg("g",{class:"mark"+(item.id===selected?" selected":""),transform:"translate("+x+" "+y+")",
          role:"button",tabindex:item.id===focusId?"0":"-1","aria-pressed":String(item.id===selected),"aria-label":"Inspect "+text,"data-id":item.id});
        group.append(svg("title",{},text),svg("circle",{class:"target",r:Math.max(r+3,6),fill:"transparent"}));
        bubble(group,item,r);
        group.append(svg("circle",{class:"ring",r:r+3}));
        group.addEventListener("click",()=>selectMark(item.id));
        group.addEventListener("keydown",event=>{
          if (event.key==="Enter" || event.key===" ") {
            event.preventDefault();const mobile=matchMedia("(max-width:680px)").matches;
            selectMark(item.id);
            if (!mobile) marks.querySelector(".selected")?.focus();
          } else if (["ArrowRight","ArrowDown","ArrowLeft","ArrowUp"].includes(event.key)) {
            event.preventDefault();
            const forward=event.key==="ArrowRight"||event.key==="ArrowDown";
            (forward? group.nextElementSibling ?? marks.firstElementChild : group.previousElementSibling ?? marks.lastElementChild)?.focus();
          }
        });
        marks.append(group);labelNodes.push({...item,x,y,r});
      }
      const selectedNode=labelNodes.find(n=>n.id===selected);
      const choices=[...labelNodes].filter(n=>n!==selectedNode).sort((a,b)=>b.mt-a.mt);
      if (selectedNode) choices.unshift(selectedNode);
      const boxes=[], limit=width<500?2:5;
      for (const item of choices) {
        if (boxes.length>=limit) break;
        const fullName=item.name;
        let name=plants? fullName.replace(/ steel plant$| steelworks$| plant$/i,"") : fullName;
        if (name.length>30) name=name.slice(0,27).trimEnd()+"…";
        if (plants && item.id==="P100000120513") name="Hazira";
        const label=svg("text",{class:"map-label"},name);labels.append(label);
        const len=label.getComputedTextLength(),gap=item.r+6;
        let pos=null;
        for (const [dx,dy] of [[gap,3],[-len-gap,3],[-len/2,-gap],[-len/2,gap+10]]) {
          const x=item.x+dx,y=item.y+dy;
          if (x<4||x+len>width-4||y<55||y>height-70) continue;
          if (boxes.some(b=>x<b.x+b.w+5 && x+len>b.x-5 && Math.abs(y-b.y)<16)) continue;
          if (labelNodes.some(n=>n.id!==item.id&&n.x+n.r>x&&n.x-n.r<x+len&&n.y+n.r>y-10&&n.y-n.r<y+3)) continue;
          pos={x,y,w:len};break;
        }
        if (!pos && item===selectedNode) pos={x:Math.max(5,Math.min(width-len-5,item.x+gap)),y:item.y-gap,w:len};
        if (!pos) {label.remove();continue;}
        boxes.push(pos);label.setAttribute("x",pos.x);label.setAttribute("y",pos.y);
      }
    }
    if (motion && previous && !matchMedia("(prefers-reduced-motion:reduce)").matches && items.length) {
      const from=previous;
      const bits=[];
      for (const row of model.projects) for (const part of row.parts) {
        const hq=model.countryByCode.get(part.id)?.label,plant=locate(row);
        if (!hq || !plant || part.mt<=0) continue;
        const circle=svg("circle",{r:radius(part.mt),fill:part.local?"var(--coral)":"var(--blue)",class:"transit"});
        marks.append(circle);bits.push({circle,plant,hq:project(...hq)});
      }
      const start=performance.now();
      function step(now) {
        const t=Math.min(1,(now-start)/500),k=t*t*(3-2*t),p=plants?1-k:k;
        const cam={x:from.x+(camera.x-from.x)*k,y:from.y+(camera.y-from.y)*k,scale:from.scale+(camera.scale-from.scale)*k};
        positionBase(cam);
        for (const {circle,plant,hq} of bits) {
          const [x,y]=screen([plant[0]+(hq[0]-plant[0])*p,plant[1]+(hq[1]-plant[1])*p],cam);
          circle.setAttribute("cx",x);circle.setAttribute("cy",y);
        }
        if(t<1)frame=requestAnimationFrame(step);else settle();
      }
      frame=requestAnimationFrame(step);
    } else settle();
    previous=camera;
  }
  new ResizeObserver(()=>{if(model)draw(model,mode,selected);}).observe(map);
  return draw;
}
