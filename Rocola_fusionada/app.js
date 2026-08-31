// ══════════════════════════════════════════════════════
// Estado
// ══════════════════════════════════════════════════════
let deck=[], history=[], queueList=[], currentIndex=-1;
let searchResults=[], quickResults=[];
let leftTab='discover', statusPoll=null, isLoading=false;

const $  = id => document.getElementById(id);
const esc= s => { const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; };
const fmt= s => { s=Math.floor(s||0); return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; };
const cod= i => String.fromCharCode(65+Math.floor(i/5))+((i%5)+1);

const el = {
  sc: $('slideContainer'),
  a2d: $('arrowToDiscover'), a2r: $('arrowToRocola'),
  hc: $('headerCanvas'),
  vc: $('vinylCanvas'), vl: $('vinylLeft'), vr: $('vinylRight'),
  npCode: $('npCode'), npTitle: $('npTitle'), npAuthor: $('npAuthor'),
  pt: $('progressTrack'), pf: $('progressFill'), pk: $('progressKnob'),
  ct: $('curTime'), dt: $('durTime'),
  prev: $('prevBtn'), play: $('playBtn'), next: $('nextBtn'),
  vol: $('volume'),
  qi: $('quickInput'), qb: $('quickBtn'), qs: $('quickStatus'), qr: $('quickResults'),
  qc: $('queueCount'), queue: $('queue'),
  si: $('searchInput'), sb: $('searchBtn'),
  td: $('tabDiscover'), tr: $('tabResults'), tg: $('tabGenre'),
  vd: $('viewDiscover'), vrv: $('viewResults'), vg: $('viewGenre'),
  sm: $('statusMsg'), dw: $('deckWrap'),
  skip: $('skipBtn'), undo: $('undoBtn'), like: $('likeBtn'),
  rl: $('resultsList'),
  gs: $('genreStatus'),
  dc: $('discoverCount'), dq: $('discoverQueue'),
};

// ══════════════════════════════════════════════════════
// Slide
// ══════════════════════════════════════════════════════
el.a2d.addEventListener('click', () => {
  el.sc.classList.add('on-discover');
});
el.a2r.addEventListener('click', () => {
  el.sc.classList.remove('on-discover');
  setTimeout(drawVinyl, 540);
});

// ══════════════════════════════════════════════════════
// Header canvas — luces full-width + título rojo neón
// ══════════════════════════════════════════════════════
let bulbPhase=0;
function drawHeader(){
  const cv=el.hc, rect=cv.parentElement.getBoundingClientRect();
  cv.width=rect.width; cv.height=rect.height;
  const ctx=cv.getContext('2d'), w=cv.width, h=cv.height;

  // Fondo negro
  ctx.fillStyle='#060810'; ctx.fillRect(0,0,w,h);

  // Franja cromada superior
  ctx.fillStyle='#0088AA'; ctx.fillRect(0,0,w,2);

  // Bombillas — una sola fila en la parte superior
  const nb=Math.floor(w/28);
  for(let i=0;i<nb;i++){
    const x=14+i*((w-28)/(nb-1));
    const g=i%3, p=Math.floor(bulbPhase/8)%3;
    const on=(g===p)||(g===(p+1)%3);
    const colors=['#00D4FF','#FF1A3A','#FFB830','#FF2D78','#00D4FF'];
    const c=colors[i%colors.length];
    if(on){
      ctx.save();
      ctx.shadowColor=c; ctx.shadowBlur=8;
      ctx.beginPath(); ctx.arc(x,14,5,0,Math.PI*2);
      ctx.fillStyle=c; ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(x,14,3,0,Math.PI*2);
      ctx.fillStyle='#1A2240'; ctx.fill();
    }
  }

  // Título con fuente Monoton en rojo neón
  ctx.save();
  ctx.shadowColor='#FF1A3A'; ctx.shadowBlur=20;
  ctx.fillStyle='#FF1A3A';
  ctx.font='400 2rem Monoton, cursive';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('Rocola', w/2, h/2+10);
  ctx.shadowBlur=40; ctx.fillStyle='#FF4060';
  ctx.fillText('Rocola', w/2, h/2+10);
  ctx.restore();
}

function animHeader(){
  bulbPhase=(bulbPhase+1)%100;
  drawHeader();
  setTimeout(animHeader,150);
}

// ══════════════════════════════════════════════════════
// Búsqueda RÁPIDA (en página principal)
// ══════════════════════════════════════════════════════
el.qb.addEventListener('click', doQuickSearch);
el.qi.addEventListener('keydown', e=>{ if(e.key==='Enter') doQuickSearch(); });

async function doQuickSearch(){
  const q=el.qi.value.trim(); if(!q) return;
  el.qs.textContent='Buscando...'; el.qs.className='quick-status';
  el.qr.innerHTML='';
  try{
    const res=await window.pywebview.api.search(q,6);
    if(res.error){ el.qs.textContent=res.error; el.qs.className='quick-status error'; return; }
    quickResults=res.results||[];
    el.qs.textContent=quickResults.length ? `${quickResults.length} resultados` : 'Sin resultados';
    renderQuickResults();
  }catch(e){ el.qs.textContent='Error: '+e; el.qs.className='quick-status error'; }
}

function renderQuickResults(){
  el.qr.innerHTML='';
  quickResults.forEach(r=>{
    const row=document.createElement('div');
    row.className='result-row';
    row.innerHTML=`<img src="${r.thumbnail}" alt=""><div class="meta"><div class="t">${esc(r.title)}</div><div class="a">${esc(r.channel)}</div></div><button class="add-btn">+ ADD</button>`;
    row.querySelector('.add-btn').addEventListener('click',e=>{ e.stopPropagation(); addToQueue(r); el.qs.textContent=''; el.qi.value=''; el.qr.innerHTML=''; });
    el.qr.appendChild(row);
  });
}

// ══════════════════════════════════════════════════════
// Búsqueda DESCUBRIR
// ══════════════════════════════════════════════════════
el.sb.addEventListener('click', doSearch);
el.si.addEventListener('keydown', e=>{ if(e.key==='Enter') doSearch(); });

async function doSearch(){
  const q=el.si.value.trim(); if(!q) return;
  el.sm.textContent='Buscando...'; el.sm.className='status-msg';
  try{
    const res=await window.pywebview.api.search(q,8);
    if(res.error){ el.sm.textContent=res.error; el.sm.className='status-msg error'; return; }
    searchResults=res.results||[];
    el.sm.textContent='';
    searchResults.forEach(r=>deck.push(r));
    renderTopCard(); renderResults(); switchTab('results');
  }catch(e){ el.sm.textContent='Error: '+e; el.sm.className='status-msg error'; }
}

// ══════════════════════════════════════════════════════
// Géneros
// ══════════════════════════════════════════════════════
document.querySelectorAll('.genre-btn').forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    const genre=btn.dataset.genre;
    document.querySelectorAll('.genre-btn').forEach(b=>b.classList.remove('loading'));
    btn.classList.add('loading'); el.gs.textContent=`Buscando ${genre}...`;
    try{
      const res=await window.pywebview.api.search_genre(genre,8);
      btn.classList.remove('loading');
      if(res.error){ el.gs.textContent=res.error; return; }
      deck=[...(res.results||[])]; history=[];
      el.gs.textContent=`${deck.length} canciones de ${genre} listas`;
      renderTopCard(); switchTab('discover');
    }catch(e){ btn.classList.remove('loading'); el.gs.textContent='Error: '+e; }
  });
});

// ══════════════════════════════════════════════════════
// Tabs DESCUBRIR
// ══════════════════════════════════════════════════════
el.td.addEventListener('click',()=>switchTab('discover'));
el.tr.addEventListener('click',()=>switchTab('results'));
el.tg.addEventListener('click',()=>switchTab('genre'));

function switchTab(tab){
  leftTab=tab;
  [['discover',el.td,el.vd],['results',el.tr,el.vrv],['genre',el.tg,el.vg]].forEach(([t,btn,view])=>{
    btn.classList.toggle('active',t===tab);
    view.classList.toggle('active',t===tab);
  });
}

function renderResults(){
  el.rl.innerHTML='';
  if(!searchResults.length){ el.rl.innerHTML='<div class="empty">Sin resultados</div>'; return; }
  searchResults.forEach(r=>{
    const row=document.createElement('div');
    row.className='result-row';
    row.innerHTML=`<img src="${r.thumbnail}" alt=""><div class="meta"><div class="t">${esc(r.title)}</div><div class="a">${esc(r.channel)}</div></div><button class="add-btn">+ ADD</button>`;
    row.querySelector('.add-btn').addEventListener('click',e=>{ e.stopPropagation(); addToQueue(r); });
    el.rl.appendChild(row);
  });
}

// ══════════════════════════════════════════════════════
// Swipe
// ══════════════════════════════════════════════════════
function renderTopCard(){
  el.dw.innerHTML='';
  if(!deck.length){ el.dw.innerHTML='<div class="deck-empty">Busca algo o elige un género.</div>'; return; }
  if(deck[1]){
    const b=document.createElement('div'); b.className='card behind';
    b.style.backgroundImage=`url(${deck[1].thumbnail})`; el.dw.appendChild(b);
  }
  const t=deck[0], card=document.createElement('div');
  card.className='card top';
  card.style.backgroundImage=`url(${t.thumbnail})`;
  card.innerHTML=`<div class="fade"></div><div class="stamp like">ME GUSTA</div><div class="stamp nope">PASAR</div><div class="info"><h3>${esc(t.title)}</h3><p>${esc(t.channel)}</p></div>`;
  el.dw.appendChild(card); attachSwipe(card);
}

function attachSwipe(card){
  let sx=0,dx=0,drag=false;
  const ls=card.querySelector('.stamp.like'), ns=card.querySelector('.stamp.nope');
  card.addEventListener('pointerdown',e=>{ drag=true; sx=e.clientX; card.style.cursor='grabbing'; });
  window.addEventListener('pointermove',e=>{
    if(!drag)return; dx=e.clientX-sx;
    card.style.transform=`translate(${dx}px,${Math.abs(dx)*.07}px) rotate(${dx/22}deg)`;
    ls.style.opacity=Math.max(0,Math.min(1,dx/80));
    ns.style.opacity=Math.max(0,Math.min(1,-dx/80));
  });
  window.addEventListener('pointerup',()=>{
    if(!drag)return; drag=false; card.style.cursor='grab';
    if(dx>100) finishSwipe(card,'like');
    else if(dx<-100) finishSwipe(card,'skip');
    else{ card.style.transform=''; ls.style.opacity=0; ns.style.opacity=0; }
    dx=0;
  });
}

function finishSwipe(card,action){
  const fly=action==='like'?520:-520;
  card.style.transition='transform .28s ease';
  card.style.transform=`translate(${fly}px,-30px) rotate(${fly/14}deg)`;
  setTimeout(()=>decide(action),220);
}

function decide(action){
  if(!deck.length)return;
  const track=deck.shift(); history.push({track,action});
  if(action==='like') addToQueue(track);
  renderTopCard();
}

el.like.addEventListener('click',()=>{ const c=el.dw.querySelector('.card.top'); if(c) finishSwipe(c,'like'); else decide('like'); });
el.skip.addEventListener('click',()=>{ const c=el.dw.querySelector('.card.top'); if(c) finishSwipe(c,'skip'); else decide('skip'); });
el.undo.addEventListener('click',()=>{
  const last=history.pop(); if(!last)return;
  if(last.action==='like'){ const i=queueList.findIndex(t=>t.videoId===last.track.videoId); if(i!==-1){ queueList.splice(i,1); recodify(); } }
  deck.unshift(last.track); renderTopCard(); renderQueues(); drawVinyl();
});

document.addEventListener('keydown',e=>{
  if(leftTab!=='discover')return;
  if(e.code==='ArrowLeft') el.skip.click();
  else if(e.code==='ArrowRight') el.like.click();
  else if(e.code==='ArrowUp') el.undo.click();
});

// ══════════════════════════════════════════════════════
// Cola
// ══════════════════════════════════════════════════════
function addToQueue(track){
  queueList.push({videoId:track.videoId,title:track.title,channel:track.channel||'',thumbnail:track.thumbnail||'',duration:track.duration||0,code:cod(queueList.length)});
  el.qc.textContent=queueList.length; el.dc.textContent=queueList.length;
  renderQueues(); drawVinyl(); persistQueue();
  if(currentIndex===-1) currentIndex=0;
}

function removeFromQueue(i){
  const wasCur=i===currentIndex;
  queueList.splice(i,1); recodify();
  el.qc.textContent=queueList.length; el.dc.textContent=queueList.length;
  if(!queueList.length){ currentIndex=-1; window.pywebview.api.stop(); resetPlayer(); }
  else if(wasCur) currentIndex=Math.min(i,queueList.length-1);
  else if(i<currentIndex) currentIndex--;
  renderQueues(); drawVinyl(); persistQueue();
}

function recodify(){ queueList.forEach((t,i)=>t.code=cod(i)); }

function renderQueues(){ renderMainQueue(); renderDiscoverQueue(); }

function renderMainQueue(){
  el.queue.innerHTML='';
  if(!queueList.length){ el.queue.innerHTML='<div class="empty">Tu rocola está vacía. Busca canciones arriba o ve a Descubrir →</div>'; return; }
  queueList.forEach((t,i)=>{
    const row=document.createElement('div');
    row.className='track'+(i===currentIndex?' current':'');
    row.innerHTML=`<span class="code">${t.code}</span><div class="meta"><div class="t">${esc(t.title)}</div><div class="a">${esc(t.channel)}</div></div>${t.duration?`<span class="dur">${fmt(t.duration)}</span>`:''}<button class="remove">✕</button>`;
    row.querySelector('.remove').addEventListener('click',e=>{ e.stopPropagation(); removeFromQueue(i); });
    row.addEventListener('click',()=>playIndex(i));
    el.queue.appendChild(row);
  });
}

function renderDiscoverQueue(){
  el.dq.innerHTML='';
  if(!queueList.length){ el.dq.innerHTML='<div class="empty">Aquí aparecen las canciones que agregas.</div>'; return; }
  queueList.forEach((t,i)=>{
    const row=document.createElement('div');
    row.className='track'+(i===currentIndex?' current':'');
    row.innerHTML=`<span class="code">${t.code}</span><div class="meta"><div class="t">${esc(t.title)}</div><div class="a">${esc(t.channel)}</div></div>`;
    el.dq.appendChild(row);
  });
}

// ══════════════════════════════════════════════════════
// Reproducción
// ══════════════════════════════════════════════════════
async function playIndex(i){
  if(!queueList[i])return;
  await window.pywebview.api.stop();
  currentIndex=i;
  const t=queueList[i];
  el.npTitle.textContent=t.title;
  el.npAuthor.textContent=t.channel||'';
  el.npCode.textContent=t.code;
  el.play.textContent='...'; el.play.classList.add('loading');
  isLoading=true; renderQueues(); drawVinyl();
  await window.pywebview.api.download_and_play(t.videoId, t.title);
  startPoll();
  startVinylSpin();
}

el.play.addEventListener('click', async ()=>{
  if(isLoading)return;
  if(currentIndex===-1){ if(queueList.length) playIndex(0); return; }
  const res=await window.pywebview.api.play_pause();
  el.play.textContent=res.state==='playing'?'⏸':'▶';
});
el.next.addEventListener('click',()=>{
  const n=pickNext(false); if(n!==-1&&n!==currentIndex) playIndex(n);
  else if(n===0&&n!==currentIndex) playIndex(0);
});
el.prev.addEventListener('click',()=>{ if(currentIndex>0) playIndex(currentIndex-1); });

el.pt.addEventListener('click', async e=>{
  const r=el.pt.getBoundingClientRect();
  await window.pywebview.api.seek((e.clientX-r.left)/r.width);
});

el.vol.addEventListener('input',()=> window.pywebview.api.set_volume(Number(el.vol.value)));

// Shuffle button
const btnShuffle = document.getElementById('shuffleBtn');
const btnRepeat  = document.getElementById('repeatBtn');
btnShuffle.addEventListener('click',()=>{
  shuffleOn=!shuffleOn;
  btnShuffle.classList.toggle('active',shuffleOn);
});
btnRepeat.addEventListener('click',()=>{
  repeatMode=(repeatMode+1)%3;
  btnRepeat.classList.toggle('active',repeatMode!==0);
  btnRepeat.textContent=repeatMode===2?'\uD83D\uDD02':'\uD83D\uDD01';
});

function resetPlayer(){
  stopVinylSpin(); vinylAngle=0; drawVinyl();
  el.npTitle.textContent='Nada sonando todavía';
  el.npAuthor.textContent='Busca canciones abajo o ve a Descubrir \u2192';
  el.npCode.textContent='— —';
  el.play.textContent='▶'; el.play.classList.remove('loading');
  el.pf.style.width='0%'; el.pk.style.left='0%';
  el.ct.textContent='0:00'; el.dt.textContent='0:00';
  isLoading=false;
}

function startPoll(){
  if(statusPoll) clearInterval(statusPoll);
  statusPoll=setInterval(async ()=>{
    try{
      const s=await window.pywebview.api.get_status();
      if(s.loading)return;
      if(s.finished){
        stopVinylSpin();
        const n=pickNext(true);
        if(n!==-1) playIndex(n);
        else{ resetPlayer(); clearInterval(statusPoll); }
        return;
      }
      if(s.playing){
        isLoading=false; el.play.classList.remove('loading');
        const dur=s.duration||1, cur=s.current||0;
        const pct=Math.min(cur/dur*100,100);
        el.pf.style.width=pct+'%'; el.pk.style.left=pct+'%';
        el.ct.textContent=fmt(cur); el.dt.textContent=fmt(dur);
        el.play.textContent=s.paused?'▶':'⏸';
        if(s.paused) stopVinylSpin(); else startVinylSpin();
      }
    }catch(e){}
  },500);
}

// ══════════════════════════════════════════════════════
// Shuffle / Repeat
// ══════════════════════════════════════════════════════
let shuffleOn=false, repeatMode=0; // 0=off 1=all 2=one

function pickNext(auto){
  if(!queueList.length) return -1;
  if(repeatMode===2) return currentIndex;
  if(shuffleOn){
    if(queueList.length===1) return 0;
    let n; do{ n=Math.floor(Math.random()*queueList.length); }while(n===currentIndex);
    return n;
  }
  const n=currentIndex+1;
  if(n>=queueList.length){ return repeatMode===1?0:(auto?-1:0); }
  return n;
}

// ══════════════════════════════════════════════════════
// Vinyl rotation
// ══════════════════════════════════════════════════════
let vinylAngle=0, vinylRAF=null;

function startVinylSpin(){
  if(vinylRAF) return;
  function spin(){ vinylAngle=(vinylAngle+1.4)%360; drawVinylFrame(); vinylRAF=requestAnimationFrame(spin); }
  vinylRAF=requestAnimationFrame(spin);
}
function stopVinylSpin(){ if(vinylRAF){ cancelAnimationFrame(vinylRAF); vinylRAF=null; } }

// Galaxy texture cache
const _galaxyCache={};
function getGalaxy(r,idx){
  const key=idx+'_'+r;
  if(!_galaxyCache[key]) _galaxyCache[key]=makeGalaxy(r,idx);
  return _galaxyCache[key];
}
function makeGalaxy(r,idx){
  // Vinyl de color real — marmoleado / liquid swirl
  const off=document.createElement('canvas');
  const S=Math.ceil((r+2)*2);
  off.width=off.height=S;
  const ctx=off.getContext('2d'), cx=S/2, cy=S/2;

  // Paletas tipo vinyl de color: base + 3-4 colores de mezcla
  const palettes=[
    {base:'#1a0030', colors:['#8800cc','#cc00ff','#ff44ff','#440066','#220044']},
    {base:'#001a33', colors:['#0044cc','#0088ff','#44ccff','#002266','#003388']},
    {base:'#1a0800', colors:['#cc4400','#ff6600','#ffaa00','#882200','#441100']},
    {base:'#001a00', colors:['#006600','#00cc44','#44ff88','#003300','#002200']},
    {base:'#1a001a', colors:['#cc0044','#ff0066','#ff66aa','#880033','#440022']},
    {base:'#0d0d1a', colors:['#4444cc','#6666ff','#aaaaff','#222266','#111133']},
    {base:'#1a0a00', colors:['#884400','#cc7700','#ffaa33','#442200','#221100']},
  ];
  const pal=palettes[idx%palettes.length];

  // Fondo base
  ctx.fillStyle=pal.base;
  ctx.fillRect(0,0,S,S);

  // Liquid swirl usando campos de ruido simulado con curvas Bezier
  // Dibujamos vetas de color que fluyen como material fundido
  const numVetas=18+Math.floor(Math.random()*12);
  for(let v=0;v<numVetas;v++){
    const colorIdx=v%pal.colors.length;
    const c=pal.colors[colorIdx];
    const alpha=0.25+Math.random()*0.55;

    // Punto de inicio aleatorio en el borde o interior
    const angle=Math.random()*Math.PI*2;
    const dist=Math.random()*r*1.1;
    const sx=cx+Math.cos(angle)*dist*0.3;
    const sy=cy+Math.sin(angle)*dist*0.3;

    // Control points para curva fluida
    const a1=angle+(-0.8+Math.random()*1.6);
    const a2=angle+(-0.8+Math.random()*1.6);
    const len=r*(0.6+Math.random()*0.8);

    const cp1x=sx+Math.cos(a1)*len*0.5;
    const cp1y=sy+Math.sin(a1)*len*0.5;
    const cp2x=sx+Math.cos(a2)*len*0.8;
    const cp2y=sy+Math.sin(a2)*len*0.8;
    const ex=sx+Math.cos(angle+Math.PI*0.5)*len;
    const ey=sy+Math.sin(angle+Math.PI*0.5)*len;

    const width=2+Math.random()*18;

    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.strokeStyle=c;
    ctx.lineWidth=width;
    ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(sx,sy);
    ctx.bezierCurveTo(cp1x,cp1y,cp2x,cp2y,ex,ey);
    ctx.stroke();
    ctx.restore();
  }

  // Segunda capa: manchas tipo gota de tinta
  const numGotas=6+Math.floor(Math.random()*6);
  for(let g=0;g<numGotas;g++){
    const ga=Math.random()*Math.PI*2;
    const gd=Math.random()*r*0.7;
    const gx=cx+Math.cos(ga)*gd;
    const gy=cy+Math.sin(ga)*gd;
    const gr=r*(0.06+Math.random()*0.18);
    const gc=pal.colors[Math.floor(Math.random()*pal.colors.length)];

    const radGrad=ctx.createRadialGradient(gx,gy,0,gx,gy,gr);
    radGrad.addColorStop(0,gc+'ee');
    radGrad.addColorStop(0.5,gc+'77');
    radGrad.addColorStop(1,'transparent');

    ctx.save();
    ctx.globalAlpha=0.4+Math.random()*0.4;
    ctx.beginPath(); ctx.arc(gx,gy,gr,0,Math.PI*2);
    ctx.fillStyle=radGrad; ctx.fill();
    ctx.restore();
  }

  // Brillo general sutil (como el material tiene lustre)
  const shine=ctx.createRadialGradient(cx-r*0.3,cy-r*0.3,0,cx,cy,r);
  shine.addColorStop(0,'rgba(255,255,255,0.12)');
  shine.addColorStop(0.5,'rgba(255,255,255,0.04)');
  shine.addColorStop(1,'rgba(0,0,0,0.2)');
  ctx.fillStyle=shine; ctx.fillRect(0,0,S,S);

  // Máscara circular
  ctx.save();
  ctx.globalCompositeOperation='destination-in';
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
  ctx.restore();
  return off;
}

// ══════════════════════════════════════════════════════
// Vinyl Canvas
// ══════════════════════════════════════════════════════
function drawVinylFrame(){ drawVinyl(); }
function drawVinyl(){
  const cv=el.vc, rect=cv.parentElement.getBoundingClientRect();
  cv.width=rect.width; cv.height=rect.height;
  const ctx=cv.getContext('2d'), w=cv.width, h=cv.height, cx=w/2, cy=h/2;

  const bg=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(w,h)/2);
  bg.addColorStop(0,'#0D1220'); bg.addColorStop(1,'#060810');
  ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);

  if(!queueList.length){
    ctx.fillStyle='#607080'; ctx.font='20px Georgia'; ctx.textAlign='center';
    ctx.fillText('\u266a     \u266a     \u266a',cx,cy);
    ctx.font='9px Courier'; ctx.fillText('AGREGUE CANCIONES',cx,cy+22); return;
  }

  const R=112;
  for(let o=1;o<35;o++){
    const idx=currentIndex-o; if(idx<0)break;
    const x=cx-R-o*12; if(x<22)break;
    drawEdge(ctx,x,cy,idx,o);
  }
  for(let o=1;o<35;o++){
    const idx=currentIndex+o; if(idx>=queueList.length)break;
    const x=cx+R+o*12; if(x>w-22)break;
    drawEdge(ctx,x,cy,idx,o);
  }

  drawCenter(ctx,cx,cy);

  ctx.fillStyle='#00D4FF'; ctx.font='bold 10px Courier'; ctx.textAlign='center';
  ctx.shadowColor='#00D4FF'; ctx.shadowBlur=6;
  ctx.fillText('\u2014 '+queueList[currentIndex].code+' \u2014',cx,cy+115);
  ctx.shadowBlur=0;
}

function drawEdge(ctx,x,cy,idx,offset){
  const h=140, t=7, alpha=Math.max(0.07,1-offset*0.08);
  const lc=['#00D4FF','#FF1A3A','#cc44ff','#FFB830','#0088AA'][idx%5];
  ctx.save(); ctx.globalAlpha=alpha;
  ctx.fillStyle='#0a0a0a'; ctx.fillRect(x-t/2,cy-h/2,t,h);
  ctx.fillStyle='#1a1a1a'; ctx.fillRect(x-.5,cy-h/2+4,1,h-8);
  ctx.fillStyle=lc; ctx.fillRect(x-t/2+1,cy-7,t-2,14);
  ctx.restore();
}

function drawCenter(ctx,cx,cy){
  const r=100, angRad=vinylAngle*Math.PI/180;

  ctx.save(); ctx.shadowColor='#00D4FF'; ctx.shadowBlur=22;
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle='#141210'; ctx.fill(); ctx.restore();

  const galaxy=getGalaxy(r,currentIndex);
  ctx.save();
  ctx.translate(cx,cy); ctx.rotate(angRad);
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.clip();
  ctx.drawImage(galaxy,-r-2,-r-2,galaxy.width,galaxy.height);
  ctx.restore();

  ctx.save(); ctx.globalAlpha=0.5;
  for(let sr=14;sr<r-14;sr+=4){
    ctx.beginPath(); ctx.arc(cx,cy,sr,0,Math.PI*2);
    ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=1; ctx.stroke();
  }
  ctx.restore();

  ctx.beginPath(); ctx.arc(cx,cy,r+1,0,Math.PI*2);
  ctx.strokeStyle='#00D4FF'; ctx.lineWidth=2;
  ctx.shadowColor='#00D4FF'; ctx.shadowBlur=10; ctx.stroke(); ctx.shadowBlur=0;

  const lr=r/3, t=queueList[currentIndex];
  if(t&&t.thumbnail&&!t._imgLoaded){
    const img=new window.Image(); img.crossOrigin='anonymous';
    img.onload=()=>{ t._img=img; t._imgLoaded=true; };
    img.src=t.thumbnail;
  }
  if(t&&t._img){
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(-angRad);
    ctx.beginPath(); ctx.arc(0,0,lr,0,Math.PI*2); ctx.clip();
    ctx.drawImage(t._img,-lr,-lr,lr*2,lr*2); ctx.restore();
  } else {
    const lg=ctx.createRadialGradient(cx-3,cy-3,0,cx,cy,lr);
    lg.addColorStop(0,'#FF2D78'); lg.addColorStop(1,'#8A0020');
    ctx.beginPath(); ctx.arc(cx,cy,lr,0,Math.PI*2);
    ctx.fillStyle=lg; ctx.fill(); ctx.strokeStyle='#FF1A3A'; ctx.lineWidth=1; ctx.stroke();
  }

  ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2);
  ctx.fillStyle='#C8D8E8'; ctx.fill(); ctx.strokeStyle='#8A9AB0'; ctx.lineWidth=1; ctx.stroke();
}

// Navegación de vinyl removida — se usa prev/next del reproductor

function updateNP(){
  if(currentIndex>=0&&queueList[currentIndex]){
    const t=queueList[currentIndex];
    el.npTitle.textContent=t.title; el.npAuthor.textContent=t.channel||''; el.npCode.textContent=t.code;
  }
  renderQueues();
}

window.addEventListener('resize',()=>{ drawHeader(); drawVinyl(); });

// ══════════════════════════════════════════════════════
// Persistencia
// ══════════════════════════════════════════════════════
function persistQueue(){
  if(window.pywebview&&window.pywebview.api)
    window.pywebview.api.save_playlist(queueList).catch(()=>{});
}

async function restoreQueue(){
  if(!(window.pywebview&&window.pywebview.api))return;
  try{
    const res=await window.pywebview.api.load_playlist();
    if(res&&res.tracks&&res.tracks.length){
      // Limpiar propiedades internas de sesiones anteriores
      queueList=res.tracks.map(t=>({
        videoId: t.videoId||'',
        title: t.title||'',
        channel: t.channel||'',
        thumbnail: t.thumbnail||'',
        duration: t.duration||0,
        code: '',
        _img: null,
        _imgLoaded: false,
      }));
      recodify();
      el.qc.textContent=queueList.length; el.dc.textContent=queueList.length;
      currentIndex=0; renderQueues(); drawVinyl(); updateNP();
    }
  }catch(e){ console.error('restore error',e); }
  window.pywebview.api.set_volume(Number(el.vol.value));
}

window.addEventListener('pywebviewready',restoreQueue);

// ══════════════════════════════════════════════════════
// Init
// ══════════════════════════════════════════════════════
renderQueues();
setTimeout(()=>{ drawHeader(); drawVinyl(); },80);
animHeader();