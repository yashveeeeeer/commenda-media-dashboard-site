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
  // Mollweide, in the same spherical degree units as build-map.py.
  let theta=lat*radians;
  if (Math.abs(lat)<90) {
    const target=Math.PI*Math.sin(theta);
    for (let i=0;i<16;i++) {
      const delta=(2*theta+Math.sin(2*theta)-target)/(2+2*Math.cos(2*theta));
      theta-=delta;
      if (Math.abs(delta)<1e-12) break;
    }
  }
  return [2*Math.SQRT2/Math.PI*lon*Math.cos(theta),-Math.SQRT2*Math.sin(theta)/radians];
}
function locate(row) {
  return Number.isFinite(row.lat) && Number.isFinite(row.lon) ? project(row.lon,row.lat) : null;
}
function fit(points, width, height, worldwide) {
  let left = project(-180,0)[0], right = -left, top = project(0,90)[1], bottom = project(0,-59)[1];
  if (!worldwide && points.length) {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
    const xpad = Math.max(2.6,(xmax-xmin)*.07), ypad = Math.max(2.6,(ymax-ymin)*.07);
    left=xmin-xpad; right=xmax+xpad; top=ymin-ypad; bottom=ymax+ypad;
  }
  const padding=worldwide ? Math.min(16,width*.025) : Math.min(32,width*.065);
  const scale=Math.min((width-2*padding)/(right-left),(height-2*padding)/(bottom-top));
  return {scale,x:width/2-scale*(left+right)/2,y:height/2-scale*(top+bottom)/2};
}
function screen(point,camera) {return [camera.x+point[0]*camera.scale,camera.y+point[1]*camera.scale];}

function hitsCircle(box, point) {
  const dx=Math.max(box.x-point.x,0,point.x-box.x-box.w);
  const dy=Math.max(box.y-point.y,0,point.y-box.y-box.h);
  return dx*dx+dy*dy < (point.r+2)**2;
}

function selectedLabel(labels, item, points, width, height) {
  const place=item.id==="P100000120513" ? "Hazira" : item.name.replace(/ (?:steel plant|steelworks|plant)$/i,"");
  const caption=place+" · "+number.format(item.mt)+" Mt/yr";
  const group=svg("g",{"aria-hidden":"true","pointer-events":"none"});
  const text=svg("text",{class:"selection-label",fill:"#fff9ed"});
  labels.append(group);group.append(text);
  // Wrap the selected name at word boundaries; its full name remains readable on phones.
  const maxWidth=Math.min(225,width*.58), lines=[];
  let line="";
  for (const word of caption.split(/\s+/)) {
    text.textContent=line ? line+" "+word : word;
    if (line && text.getComputedTextLength()>maxWidth) {
      lines.push(line);
      line=word;
    } else line=text.textContent;
  }
  lines.push(line);
  text.replaceChildren(...lines.map((s,i)=>svg("tspan",{x:7,y:15+i*15},s)));
  const w=text.getBBox().width+14, h=lines.length*15+9, gap=item.r+11;
  const positions=[
    [item.x+gap,item.y-h-7],[item.x-gap-w,item.y-h-7],
    [item.x+gap,item.y+7],[item.x-gap-w,item.y+7],
    [item.x-w/2,item.y-gap-h],[item.x-w/2,item.y+gap],
  ];
  let best,score=Infinity;
  for (const [left,top] of positions) {
    const box={x:Math.max(4,Math.min(width-w-4,left)),y:Math.max(4,Math.min(height-h-4,top)),w,h};
    const covered=points.filter(p=>hitsCircle(box,p)).length;
    const cost=covered*1000 + (hitsCircle(box,item)?10000:0) + Math.abs(left-box.x)+Math.abs(top-box.y);
    if (cost<score) {score=cost;best=box;}
  }
  const endX=Math.max(best.x,Math.min(item.x,best.x+w));
  const endY=Math.max(best.y,Math.min(item.y,best.y+h));
  const dx=endX-item.x,dy=endY-item.y,dist=Math.hypot(dx,dy);
  if (dist>item.r+3) {
    labels.insertBefore(svg("line",{class:"selection-leader",x1:item.x+(item.r+3)*dx/dist,
      y1:item.y+(item.r+3)*dy/dist,x2:endX,y2:endY,stroke:"#e8e1d2","stroke-width":1}),group);
  }
  group.setAttribute("transform","translate("+best.x+" "+best.y+")");
  group.prepend(svg("rect",{class:"selection-label-bg",width:w,height:h,rx:2,fill:"#292724"}));
  return best;
}

function contextLabels(labels,model,mode,camera,points,annotation,width,height) {
  if (model.host!==ALL) return;
  // These interior alternatives keep labels on land and clear of industrial clusters.
  const interiors={CHN:[[87,38],[91,34],[124,52]],IND:[[77.5,13],[72.9,26.8]],IRN:[[57,32.1],[53.7,27.9]],
    USA:[[-107,42.5]],RUS:[[102,62]],MEX:[[-105,28]],SWE:[[14.5,63]]};
  const ranked=mode==="plants"?model.hosts:model.destinations;
  const occupied=annotation?[annotation]:[];
  const limit=width<500?1:4;
  let count=0;
  for (const group of ranked.filter(g=>g.id!==UNKNOWN).slice(0,width<500?3:10)) {
    if (count>=limit) break;
    const home=model.countryByCode.get(group.id);
    if (!home?.label) continue;
    for (const at of [...(interiors[group.id] || []),home.label]) {
      const [x,y]=screen(project(...at),camera);
      const label=svg("text",{class:"context-label",x,y,"text-anchor":"middle",fill:"#b5afa4",
        "pointer-events":"none","aria-hidden":"true"},group.name);
      labels.prepend(label);
      const {width:w,height:h}=label.getBBox();
      const b={x:x-w/2-2,y:y-h,w:w+4,h:h+2};
      const collides=occupied.some(o=>b.x<o.x+o.w+3 && b.x+b.w>o.x-3 && b.y<o.y+o.h+3 && b.y+b.h>o.y-3);
      if (b.x>=3 && b.x+b.w<=width-3 && b.y>=3 && b.y+b.h<=height-3 &&
          !collides && !points.some(p=>hitsCircle(b,p))) {
        occupied.push(b);count++;break;
      }
      label.remove();
    }
  }
}

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

export function createMap(geography, selectMark) {
  const map=document.getElementById("map"), base=document.getElementById("geography");
  const marks=document.getElementById("marks"), labels=document.getElementById("labels");
  const zoomIn=document.getElementById("zoom-in"), zoomOut=document.getElementById("zoom-out");
  const resetView=document.getElementById("reset-view");
  const paths=[];
  let previous,model,mode,selected,frame=0;
  let previousScope,zoom=1,panX=0,panY=0,drag=null,dragged=false,paintView,selectedPoint;
  let fitted,camera,width,height;
  const maxZoom=16;
  map.setAttribute("tabindex","0");
  function updateCamera() {
    const limitX=(1-1/zoom)*width/(2*fitted.scale), limitY=(1-1/zoom)*height/(2*fitted.scale);
    panX=Math.max(-limitX,Math.min(limitX,panX));panY=Math.max(-limitY,Math.min(limitY,panY));
    const scale=fitted.scale*zoom;
    camera={scale,x:width/2+(fitted.x-width/2)*zoom-panX*scale,
      y:height/2+(fitted.y-height/2)*zoom-panY*scale};
    map.dataset.zoomed=String(zoom>1);
    if (zoomIn) zoomIn.disabled=zoom===maxZoom;
    if (zoomOut) zoomOut.disabled=zoom===1;
    if (resetView) resetView.disabled=zoom===1;
  }
  function changeZoom(next) {
    if (!paintView || next===zoom) return;
    const anchor=selectedPoint ? screen(selectedPoint,camera) : [width/2,height/2];
    const onScreen=anchor[0]>=0 && anchor[0]<=width && anchor[1]>=0 && anchor[1]<=height;
    if (onScreen) {
      const shift=(1/zoom-1/next)/fitted.scale;
      panX+=(anchor[0]-width/2)*shift;panY+=(anchor[1]-height/2)*shift;
    }
    zoom=next;updateCamera();paintView();previous=camera;
  }
  zoomIn?.addEventListener("click",()=>changeZoom(Math.min(maxZoom,zoom*2)));
  zoomOut?.addEventListener("click",()=>changeZoom(Math.max(1,zoom/2)));
  resetView?.addEventListener("click",()=>changeZoom(1));
  map.addEventListener("pointerdown",event=>{
    if (!event.isPrimary || event.button!==0 || zoom===1 || !paintView) return;
    dragged=false;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,panX,panY};
  });
  map.addEventListener("pointermove",event=>{
    if (!drag || event.pointerId!==drag.id) return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if (!dragged && Math.hypot(dx,dy)<5) return;
    if (!dragged) {map.setPointerCapture(event.pointerId);map.dataset.dragging="true";dragged=true;}
    panX=drag.panX-dx/camera.scale;panY=drag.panY-dy/camera.scale;
    updateCamera();paintView(false);previous=camera;
  });
  function endDrag(event) {
    if (!drag || event.pointerId!==drag.id) return;
    drag=null;
    if (map.hasPointerCapture(event.pointerId)) map.releasePointerCapture(event.pointerId);
    delete map.dataset.dragging;
    if (dragged) {
      paintView?.();
      // The browser dispatches click after pointerup. Suppress only that click.
      setTimeout(()=>{dragged=false;},0);
    }
  }
  map.addEventListener("pointerup",endDrag);
  map.addEventListener("pointercancel",endDrag);
  map.addEventListener("pointerleave",event=>{if (!dragged) endDrag(event);});
  map.addEventListener("keydown",event=>{
    if (event.target!==map || zoom===1 || !paintView) return;
    const arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const dir=arrows[event.key];
    if (!dir) return;
    event.preventDefault();panX+=dir[0]*width*.18/camera.scale;panY+=dir[1]*height*.18/camera.scale;
    updateCamera();paintView();previous=camera;
  });
  base.append(svg("path",{d:geography.graticule,class:"grid-line",fill:"none"}),
    svg("path",{d:geography.land,class:"land-base",fill:"var(--land)","fill-rule":"evenodd"}));
  for (const country of geography.countries) {
    const path=svg("path",{d:country.d,class:"country","fill-rule":"evenodd"});
    paths.push([country.iso3,path]);base.append(path);
  }
  base.append(svg("path",{d:geography.borders,class:"country-borders",fill:"none",stroke:"#979189",
    "stroke-width":.65,"stroke-linejoin":"round","stroke-linecap":"round","vector-effect":"non-scaling-stroke"}));
  function draw(modelNext,modeNext,selectedNext,motion=false) {
    cancelAnimationFrame(frame);
    model=modelNext;mode=modeNext;selected=selectedNext;
    width=map.clientWidth;height=map.clientHeight;
    if (!width || !height) return;
    const scope=[model.host,model.measure,mode].join("/");
    if (scope!==previousScope) {zoom=1;panX=0;panY=0;drag=null;dragged=false;delete map.dataset.dragging;}
    previousScope=scope;
    const plants=mode==="plants";
    const items=(plants ? model.projects.map(p=>({id:p.id,name:p.name,mt:p.mt,point:locate(p),color:p.group.color})) :
      model.destinations.map(g=>({...g,point:g.label && project(...g.label)}))).filter(item=>item.mt>0 && item.point);
    const points=items.map(item=>item.point);
    const hostCountry=model.countryByCode.get(model.host);
    if (hostCountry?.focus && (plants || !points.length)) {
      const [x0,y0,x1,y1]=hostCountry.focus;
      points.push([x0,y0],[x1,y1]);
    }
    fitted=fit(points,width,height,model.host===ALL);
    updateCamera();
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
      const maximum=Math.max(...items.map(item=>item.mt));
      const step=10**Math.floor(Math.log10(maximum));
      const big=maximum>=5*step ? 5*step : maximum>=2*step ? 2*step : step;
      const values=[big/5,big];
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
      marks.replaceChildren();labels.replaceChildren();
      const symbols=[];
      // Draw smaller sites last so a large neighbour cannot hide them.
      const ordered=[...items].sort((a,b)=>(a.id===selected)-(b.id===selected) || b.mt-a.mt);
      const focusId=items.some(item=>item.id===selected)?selected:ordered[0]?.id;
      for (const item of ordered) {
        const r=radius(item.mt);
        const text=item.name+", "+number.format(item.mt)+" Mt/yr";
        const group=svg("g",{class:"mark"+(item.id===selected?" selected":""),
          role:"button",tabindex:item.id===focusId?"0":"-1","aria-pressed":String(item.id===selected),"aria-label":"Inspect "+text,"data-id":item.id});
        group.append(svg("title",{},text),svg("circle",{class:"target",r:Math.max(r+3,6),fill:"transparent"}));
        bubble(group,item,r);
        group.append(svg("circle",{class:"ring",r:r+3}));
        group.addEventListener("click",()=>{if (!dragged) selectMark(item.id);});
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
        marks.append(group);symbols.push({...item,r,group});
      }
      const selectedNode=symbols.find(n=>n.id===selected);
      selectedPoint=selectedNode?.point;
      paintView=(withLabels=true)=>{
        positionBase(camera);labels.replaceChildren();
        for (const symbol of symbols) {
          [symbol.x,symbol.y]=screen(symbol.point,camera);
          symbol.group.setAttribute("transform","translate("+symbol.x+" "+symbol.y+")");
        }
        if (!withLabels) return;
        const visible=symbols.filter(n=>n.x+n.r>=0 && n.x-n.r<=width && n.y+n.r>=0 && n.y-n.r<=height);
        const annotation=selectedNode && visible.includes(selectedNode) && selectedLabel(labels,selectedNode,visible,width,height);
        contextLabels(labels,model,mode,camera,visible,annotation,width,height);
      };
      paintView();
    }
    if (motion && previous && !matchMedia("(prefers-reduced-motion:reduce)").matches && items.length) {
      paintView=null;
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
