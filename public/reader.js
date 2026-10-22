
// Storink reader: the original Monsieur X reader, made generic. Everything episode-specific comes from #ep-data.
const D = JSON.parse(document.getElementById('ep-data').textContent);
const PAGES = D.pages, T = D.t;
const FIRST = PAGES.length && PAGES[0].kind==='cover' && PAGES.length>1 ? 1 : 0;   // the cover is shown on the title card
const numbered = pg => pg.kind==='comic' || pg.kind==='spread';
const labelOf = (pg, short) => numbered(pg) ? (short?T.plateShort:T.plate)+' '+pg.label : pg.label;
const esc = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* audience stats: anonymous, no cookies */
const SID=(()=>{try{let s=sessionStorage.getItem('storink-sid');if(!s){s=Math.random().toString(36).slice(2)+Date.now().toString(36);sessionStorage.setItem('storink-sid',s);}return s;}catch(e){return Math.random().toString(36).slice(2);}})();
function track(t,data){try{const body=JSON.stringify(Object.assign({t,sid:SID,s:D.series,e:D.episode,l:D.lang},data||{}));if(navigator.sendBeacon){navigator.sendBeacon('/e',new Blob([body],{type:'application/json'}));}else{fetch('/e',{method:'POST',body,headers:{'content-type':'application/json'},keepalive:true}).catch(()=>{});}}catch(e){}}
const seenPages=new Set();
if(!PAGES.length){ document.querySelectorAll('#go,#goPage,#bar,#stage').forEach(el=>el.hidden=true); }
track('view',{ref:document.referrer||'',w:innerWidth,q:location.search.slice(0,200)});
const $ = s => document.querySelector(s);
const stage=$('#stage'), rig=$('#rig'), img=$('#pg'), spot=$('#spot'), fade=$('#fade');
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

let panelMode = true;   // case par case
let p = 0, z = 0;       // page index, zone index (-1 = whole page)
const cache = {};
function load(i){ if(i<0||i>=PAGES.length) return; if(!cache[i]){const im=new Image(); im.decoding='async'; im.src=PAGES[i].src; cache[i]=im;} return cache[i]; }

function zonesOf(i){
  const pg=PAGES[i];
  if(!panelMode || !pg.zones.length) return [[0,0,1,1]];
  return pg.zones;
}

let base={tx:0,ty:0,s:1}, uz=1, ux=0, uy=0, keepZoom=false;
function apply(){
  rig.style.transform=`translate(${ux}px,${uy}px) scale(${uz}) translate(${base.tx}px,${base.ty}px) scale(${base.s})`;
  const zb=$('#zoom'); if(zb){ zb.querySelector('.tag').textContent = uz>1.05 ? (Math.round(uz*10)/10)+'×' : '1×'; zb.setAttribute('aria-pressed', String(uz>1.05)); }
}
function clampPan(){
  const vw=stage.clientWidth, vh=stage.clientHeight;
  if(uz<=1.001){ uz=1; ux=0; uy=0; return; }
  ux=Math.min(0,Math.max(vw*(1-uz),ux)); uy=Math.min(0,Math.max(vh*(1-uz),uy));
}
function zoomAt(k,fx,fy,animate){
  const nz=Math.min(5,Math.max(1,uz*k)); const kk=nz/uz;
  ux=fx-kk*(fx-ux); uy=fy-kk*(fy-uy); uz=nz; clampPan();
  rig.classList.toggle('anim', !!animate && !reduce); apply();
}
function resetZoom(animate){ uz=1; ux=0; uy=0; rig.classList.toggle('anim', !!animate && !reduce); apply(); }
function layout(animate){
  const pg=PAGES[p];
  const W=pg.w, H=pg.h;
  const vw=stage.clientWidth, vh=stage.clientHeight;
  const zs=zonesOf(p); const zone=zs[Math.max(0,Math.min(z,zs.length-1))];
  const full = zone[0]===0&&zone[1]===0&&zone[2]===1&&zone[3]===1;
  // zone in page px, with a little breathing room around panels
  const pad = full?0:0.012*W;
  let x=zone[0]*W-pad, y=zone[1]*H-pad, w=zone[2]*W+2*pad, h=zone[3]*H+2*pad;
  const margin = full? 0.96 : 0.94;
  let s=Math.min(vw*margin/w, vh*margin/h);
  // keep sharpness: never blow a panel past ~2.4× its pixels (×dpr budget)
  const cap = 2.4/Math.max(1,(window.devicePixelRatio||1)/1.5);
  if(!full) s=Math.min(s,cap);
  const tx=vw/2 - s*(x+w/2), ty=vh/2 - s*(y+h/2);
  base={tx,ty,s};
  if(!keepZoom){ uz=1; ux=0; uy=0; }
  rig.classList.toggle('anim', !!animate && !reduce);
  rig.style.width=W+'px'; rig.style.height=H+'px';
  apply();
  spot.classList.toggle('off', full);
  spot.style.left=(zone[0]*W)+'px'; spot.style.top=(zone[1]*H)+'px';
  spot.style.width=(zone[2]*W)+'px'; spot.style.height=(zone[3]*H)+'px';
  updateBar();
}

function updateBar(){
  const pg=PAGES[p], zs=zonesOf(p);
  const short = stage.clientWidth<480;
  let t = labelOf(pg, short);
  if(panelMode && zs.length>1) t += `  ·  ${z+1}/${zs.length}`;
  $('#lbl').textContent=t;
  $('#prog i').style.width=((p+1)/PAGES.length*100)+'%';
  $('#mode').setAttribute('aria-pressed', String(panelMode));
  $('#modeTag').textContent = panelMode?T.modePanel:T.modePage;
  try{ history.replaceState(null,'','#p'+p); }catch(e){}
  store.set(D.key, JSON.stringify({p,z,panelMode}));
}

let busy=false;
function showPage(i, zi, dir){
  if(i<0||i>=PAGES.length) return;
  const change=()=>{
    p=i; const zs=zonesOf(p);
    z = zi==='last' ? zs.length-1 : 0;
    const im=load(p);
    const done=()=>{ if(!seenPages.has(p)){ seenPages.add(p); track('page',{p,m:panelMode?'case':'page'}); } img.src=im.src; layout(false); requestAnimationFrame(()=>fade.classList.remove('on')); busy=false; load(p+1); load(p+2); load(p-1); };
    if(im.complete) done(); else { im.onload=done; im.onerror=done; }
  };
  if(reduce || dir===0){ busy=true; change(); return; }
  busy=true; fade.classList.add('on'); setTimeout(change, 200);
}

function next(){
  if(busy) return; hideTip();
  const zs=zonesOf(p);
  if(z<zs.length-1){ z++; layout(true); }
  else if(p<PAGES.length-1) showPage(p+1,0,1);
}
function prev(){
  if(busy) return;
  if(z>0){ z--; layout(true); }
  else if(p>0) showPage(p-1,'last',-1);
}

/* input: tap / swipe to read, pinch / drag / double-tap to zoom */
const pts=new Map(); let g=null, lastTap=0, tapTimer=null;
function rel(e){ const r=stage.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; }
stage.addEventListener('pointerdown',e=>{
  try{ stage.setPointerCapture(e.pointerId); }catch(_){}
  pts.set(e.pointerId, rel(e));
  if(pts.size===1){ const q=rel(e); g={type:'tap', sx:q.x, sy:q.y, lx:q.x, ly:q.y, t:Date.now()}; }
  else if(pts.size===2){
    const [a,b]=[...pts.values()];
    g={type:'pinch', d:Math.hypot(a.x-b.x,a.y-b.y)||1, mx:(a.x+b.x)/2, my:(a.y+b.y)/2, uz, ux, uy};
    rig.classList.remove('anim');
  }
});
stage.addEventListener('pointermove',e=>{
  if(!pts.has(e.pointerId)||!g) return;
  pts.set(e.pointerId, rel(e));
  if(g.type==='pinch' && pts.size>=2){
    const [a,b]=[...pts.values()];
    const d=Math.hypot(a.x-b.x,a.y-b.y), mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
    const nz=Math.min(5,Math.max(1,g.uz*d/g.d)); const k=nz/g.uz;
    ux=mx-k*(g.mx-g.ux); uy=my-k*(g.my-g.uy); uz=nz; clampPan(); apply();
  } else if(pts.size===1){
    const q=pts.get(e.pointerId);
    if(g.type==='tap' && uz>1.001 && Math.hypot(q.x-g.sx,q.y-g.sy)>8){ g.type='pan'; rig.classList.remove('anim'); }
    if(g.type==='pan'){ ux+=q.x-g.lx; uy+=q.y-g.ly; clampPan(); apply(); }
    g.lx=q.x; g.ly=q.y;
  }
});
function endPointer(e){
  if(!pts.has(e.pointerId)) return;
  const q=rel(e); pts.delete(e.pointerId);
  if(!g) return;
  if(g.type==='pinch'){ if(pts.size===0){ if(uz<1.05) resetZoom(true); g=null; } else g={type:'gesture'}; return; }
  if(g.type!=='tap'){ if(pts.size===0) g=null; return; }
  const dx=q.x-g.sx, dy=q.y-g.sy; g=null;
  if(Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy) && uz<=1.001){ dx<0?next():prev(); return; }
  if(Math.abs(dx)<12 && Math.abs(dy)<12){
    const now=Date.now();
    if(now-lastTap<280){ clearTimeout(tapTimer); lastTap=0;
      if(uz>1.05) resetZoom(true); else zoomAt(2.2,q.x,q.y,true);
      return; }
    lastTap=now;
    const x=q.x; tapTimer=setTimeout(()=>{ (x < stage.clientWidth*0.33) ? prev() : next(); },260);
  }
}
stage.addEventListener('pointerup',endPointer);
stage.addEventListener('pointercancel',e=>{ pts.delete(e.pointerId); if(pts.size===0) g=null; });
stage.addEventListener('wheel',e=>{ e.preventDefault(); const q=rel(e); zoomAt(Math.exp(-e.deltaY*0.0018),q.x,q.y,false); },{passive:false});
document.addEventListener('gesturestart',e=>e.preventDefault());
stage.addEventListener('dragstart',e=>e.preventDefault());
document.addEventListener('dblclick',e=>e.preventDefault());
addEventListener('keydown',e=>{
  if(!$('#index').hidden){ if(e.key==='Escape') closeIndex(); return; }
  if(!$('#intro').hidden){ if(e.key==='Enter') start(true); return; }
  if(['ArrowRight',' ','PageDown'].includes(e.key)){e.preventDefault();next();}
  else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();prev();}
  else if(e.key==='p'||e.key==='P') toggleMode();
  else if(e.key==='+'||e.key==='=') zoomAt(1.4,stage.clientWidth/2,stage.clientHeight/2,true);
  else if(e.key==='-') zoomAt(1/1.4,stage.clientWidth/2,stage.clientHeight/2,true);
  else if(e.key==='0') resetZoom(true);
});
addEventListener('resize',()=>{ keepZoom=false; layout(false); });
$('#next').onclick=next; $('#prev').onclick=prev;
function toggleMode(){ panelMode=!panelMode; track('mode',{m:panelMode?'case':'page'}); z=0; layout(true); }
$('#mode').onclick=toggleMode;
$('#zoom').onclick=()=>{ const cx=stage.clientWidth/2, cy=stage.clientHeight/2; if(uz<1.9) zoomAt(2/uz,cx,cy,true); else if(uz<2.9) zoomAt(3/uz,cx,cy,true); else resetZoom(true); };
$('#home').onclick=()=>{ $('#intro').hidden=false; };
$('#fs').onclick=()=>{ try{ document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen().catch(()=>{});}catch(e){} };

/* index */
const grid=$('#grid');
PAGES.forEach((pg,i)=>{
  const b=document.createElement('button');
  b.innerHTML=`<img loading="lazy" src="${esc(pg.thumb||pg.src)}" alt=""><span>${esc(labelOf(pg,false))}</span>`;
  b.onclick=()=>{ closeIndex(); $('#intro').hidden=true; showPage(i,0,0); };
  grid.appendChild(b);
});
function openIndex(){ [...grid.children].forEach((b,i)=>b.classList.toggle('cur',i===p)); $('#index').hidden=false; }
function closeIndex(){ $('#index').hidden=true; }
$('#ixBtn').onclick=openIndex; $('#ixClose').onclick=closeIndex;

/* tip */
let tipShown=false;
function showTip(){ if(tipShown) return; tipShown=true; const t=$('#tip'); t.classList.remove('gone'); setTimeout(hideTip,3500); }
function hideTip(){ $('#tip').classList.add('gone'); }

/* start */
function start(cases, at){
  panelMode=cases; track('start',{m:cases?'case':'page'}); $('#intro').hidden=true;
  const pos = at || {p:FIRST,z:0};
  showPage(pos.p, 0, 0);
  if(pos.z){ setTimeout(()=>{ z=Math.min(pos.z, zonesOf(p).length-1); layout(false); },50); }
  if(cases) setTimeout(showTip,600);
}
$('#go').onclick=()=>start(true);
$('#goPage').onclick=()=>start(false);

// resume or deep link
let saved=null; try{ saved=JSON.parse(store.get(D.key)||'null'); }catch(e){}
const hm=/^#p(\d+)$/.exec(location.hash);
if(hm && +hm[1]<PAGES.length){ start(true,{p:+hm[1],z:0}); }
else if(saved && saved.p>FIRST && saved.p<PAGES.length){
  const r=$('#resume'); r.hidden=false;
  const sp=PAGES[saved.p], where = numbered(sp) ? T.plateLower+' '+sp.label : sp.label.toLowerCase();
  r.innerHTML=esc(T.resume.replace('{where}',where))+` <button class="btn" id="res" style="padding:6px 10px;margin-left:6px">${esc(T.resumeBtn)}</button>`;
  $('#res').onclick=()=>start(saved.panelMode!==false,{p:saved.p,z:saved.z||0});
}
if(PAGES.length){ load(FIRST); load(FIRST+1); }
