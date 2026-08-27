// ======================================================================
// Estado global
// ======================================================================
let deck = [];                 // candidatos por decidir en "Descubrir"
let history = [];              // pila para deshacer: {track, action:'like'|'skip'}
let seenIds = new Set();       // ids ya vistos (para no repetir en futuras búsquedas)
let currentGenre = 'Rock';

let queueList = [];            // canciones agregadas (la cola real)
let currentIndex = -1;
let shuffleOn = false;
let repeatMode = 0;            // 0 ninguno, 1 todo, 2 una

let mode = 'discover';         // 'discover' | 'queue'
let player = null;
let playerReady = false;
let isPlaying = false;
let progressTimer = null;
let saveTimer = null;

const $ = id => document.getElementById(id);
const els = {
  tabDiscover:$('tabDiscover'), tabQueue:$('tabQueue'), queueCount:$('queueCount'),
  viewDiscover:$('viewDiscover'), viewQueue:$('viewQueue'),
  genreSelect:$('genreSelect'), discoverBtn:$('discoverBtn'),
  randomCount:$('randomCount'), randomBtn:$('randomBtn'), statusMsg:$('statusMsg'),
  deckWrap:$('deckWrap'), deckEmpty:$('deckEmpty'), previewNote:$('previewNote'),
  skipBtn:$('skipBtn'), undoBtn:$('undoBtn'), likeBtn:$('likeBtn'),
  npCode:$('npCode'), npTitle:$('npTitle'), npAuthor:$('npAuthor'),
  progressTrack:$('progressTrack'), progressFill:$('progressFill'), curTime:$('curTime'), durTime:$('durTime'),
  shuffleBtn:$('shuffleBtn'), prevBtn:$('prevBtn'), playBtn:$('playBtn'), nextBtn:$('nextBtn'), repeatBtn:$('repeatBtn'),
  volume:$('volume'), urlInput:$('urlInput'), addBtn:$('addBtn'),
  queue:$('queue'), emptyMsg:$('emptyMsg'),
};

function codeForIndex(i){ return String.fromCharCode(65 + Math.floor(i/9)) + ((i%9)+1); }
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }
function setStatus(msg, isError){ els.statusMsg.textContent = msg||''; els.statusMsg.classList.toggle('error', !!isError); }
function fmtTime(sec){ sec=Math.floor(sec||0); return `${Math.floor(sec/60)}:${(sec%60).toString().padStart(2,'0')}`; }

// ======================================================================
// Reproductor oficial de YouTube (compartido entre "preview" y "cola")
// ======================================================================
function onYouTubeIframeAPIReady(){
  player = new YT.Player('ytplayer', {
    height:'1', width:'1', playerVars:{ playsinline:1, controls:0 },
    events:{
      onReady:()=>{ playerReady=true; player.setVolume(Number(els.volume.value)); },
      onStateChange:onPlayerStateChange,
    }
  });
}
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

function onPlayerStateChange(e){
  if(e.data === YT.PlayerState.PLAYING){
    isPlaying = true;
    if(mode === 'queue'){ els.playBtn.textContent='⏸'; startProgressLoop(); renderQueue(); }
  } else if(e.data === YT.PlayerState.PAUSED){
    isPlaying = false;
    if(mode === 'queue'){ els.playBtn.textContent='▶'; stopProgressLoop(); renderQueue(); }
  } else if(e.data === YT.PlayerState.ENDED){
    if(mode === 'queue') handleQueueTrackEnd();
    // en modo "discover" simplemente deja de sonar; el usuario decide con los botones
  }
}

function playVideo(videoId, volume){
  if(!playerReady){ setTimeout(()=>playVideo(videoId, volume), 250); return; }
  player.loadVideoById(videoId);
  player.setVolume(volume ?? Number(els.volume.value));
}

// ======================================================================
// Tabs
// ======================================================================
els.tabDiscover.addEventListener('click', ()=> switchMode('discover'));
els.tabQueue.addEventListener('click', ()=> switchMode('queue'));

function switchMode(next){
  if(mode === next) return;
  mode = next;
  els.tabDiscover.classList.toggle('active', mode==='discover');
  els.tabQueue.classList.toggle('active', mode==='queue');
  els.viewDiscover.classList.toggle('active', mode==='discover');
  els.viewQueue.classList.toggle('active', mode==='queue');

  if(playerReady) player.pauseVideo();
  isPlaying = false;

  if(mode === 'discover'){
    renderTopCard(true); // re-cuea el preview de la carta visible
  } else {
    els.playBtn.textContent = '▶';
    if(currentIndex >= 0) loadCurrentQueueTrack(false);
  }
}

// ======================================================================
// DESCUBRIR (modo Tinder)
// ======================================================================
async function fetchCandidates(genre, count){
  setStatus('Buscando…');
  const excludeIds = Array.from(seenIds);
  try{
    const res = await window.pywebview.api.search_genre(genre, count, excludeIds);
    if(res.error){ setStatus(res.error, true); return []; }
    setStatus('');
    return res.results || [];
  }catch(e){
    setStatus('Error al buscar: ' + e, true);
    return [];
  }
}

async function startDiscover(){
  currentGenre = els.genreSelect.value;
  els.discoverBtn.disabled = true;
  const results = await fetchCandidates(currentGenre, 10);
  els.discoverBtn.disabled = false;
  results.forEach(r => { deck.push(r); seenIds.add(r.videoId); });
  renderTopCard(true);
}

async function refillDeckIfLow(){
  if(deck.length <= 1){
    const results = await fetchCandidates(currentGenre, 10);
    results.forEach(r => { deck.push(r); seenIds.add(r.videoId); });
  }
}

function renderTopCard(autoplay){
  els.deckWrap.innerHTML = '';
  if(deck.length === 0){
    const empty = document.createElement('div');
    empty.className = 'deck-empty';
    empty.textContent = 'No hay más candidatos. Elige un género y dale "Descubrir" de nuevo.';
    els.deckWrap.appendChild(empty);
    els.previewNote.textContent = '';
    if(playerReady) player.pauseVideo();
    return;
  }
  // tarjeta de fondo (peek)
  if(deck[1]){
    const behind = document.createElement('div');
    behind.className = 'card behind';
    behind.style.backgroundImage = `url(${deck[1].thumbnail})`;
    els.deckWrap.appendChild(behind);
  }
  // tarjeta activa
  const t = deck[0];
  const card = document.createElement('div');
  card.className = 'card top';
  card.style.backgroundImage = `url(${t.thumbnail})`;
  card.innerHTML = `
    <div class="fade"></div>
    <div class="stamp like">ME GUSTA</div>
    <div class="stamp nope">PASAR</div>
    <div class="info"><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.channel)}</p></div>
  `;
  els.deckWrap.appendChild(card);
  attachSwipeHandlers(card);
  els.previewNote.textContent = 'Escuchando vista previa…';
  if(autoplay) playVideo(t.videoId, Number(els.volume.value));
  refillDeckIfLow();
}

function attachSwipeHandlers(card){
  let startX=0, startY=0, dx=0, dragging=false;
  const likeStamp = card.querySelector('.stamp.like');
  const nopeStamp = card.querySelector('.stamp.nope');

  function onDown(e){
    dragging = true; card.style.cursor='grabbing';
    startX = (e.touches ? e.touches[0].clientX : e.clientX);
    startY = (e.touches ? e.touches[0].clientY : e.clientY);
  }
  function onMove(e){
    if(!dragging) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    const y = (e.touches ? e.touches[0].clientY : e.clientY);
    dx = x - startX; const dy = y - startY;
    const rot = dx / 18;
    card.style.transform = `translate(${dx}px, ${dy*0.2}px) rotate(${rot}deg)`;
    likeStamp.style.opacity = Math.max(0, Math.min(1, dx/80));
    nopeStamp.style.opacity = Math.max(0, Math.min(1, -dx/80));
  }
  function onUp(){
    if(!dragging) return;
    dragging = false; card.style.cursor='grab';
    if(dx > 100){ finishSwipe(card, 'like'); }
    else if(dx < -100){ finishSwipe(card, 'skip'); }
    else{
      card.style.transform = '';
      likeStamp.style.opacity = 0; nopeStamp.style.opacity = 0;
    }
    dx = 0;
  }
  card.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  card._cleanup = ()=>{ window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
}

function finishSwipe(card, action){
  const flyX = action === 'like' ? 600 : -600;
  card.style.transition = 'transform .35s ease';
  card.style.transform = `translate(${flyX}px, -40px) rotate(${flyX/12}deg)`;
  if(card._cleanup) card._cleanup();
  setTimeout(()=> decide(action), 200);
}

function decide(action){
  if(deck.length === 0) return;
  const track = deck.shift();
  history.push({ track, action });
  if(action === 'like'){ addTrackToQueue(track); }
  renderTopCard(true);
}

els.likeBtn.addEventListener('click', ()=>{
  const card = els.deckWrap.querySelector('.card.top');
  if(card) finishSwipe(card, 'like'); else decide('like');
});
els.skipBtn.addEventListener('click', ()=>{
  const card = els.deckWrap.querySelector('.card.top');
  if(card) finishSwipe(card, 'skip'); else decide('skip');
});
els.undoBtn.addEventListener('click', ()=>{
  const last = history.pop();
  if(!last) return;
  if(last.action === 'like'){
    const idx = queueList.findIndex(t => t.videoId === last.track.videoId);
    if(idx !== -1) removeFromQueueSilently(idx);
  }
  deck.unshift(last.track);
  renderTopCard(true);
});

els.discoverBtn.addEventListener('click', startDiscover);
els.randomBtn.addEventListener('click', async ()=>{
  const genre = els.genreSelect.value;
  const count = Math.max(1, Math.min(10, parseInt(els.randomCount.value,10)||5));
  els.randomBtn.disabled = true; els.randomBtn.textContent = 'Generando…';
  const results = await fetchCandidates(genre, count);
  results.forEach(r => { seenIds.add(r.videoId); addTrackToQueue(r); });
  els.randomBtn.disabled = false; els.randomBtn.textContent = '🎲 Lista aleatoria';
});

document.addEventListener('keydown', (e)=>{
  if(mode !== 'discover') return;
  if(e.code === 'ArrowLeft') els.skipBtn.click();
  else if(e.code === 'ArrowRight') els.likeBtn.click();
  else if(e.code === 'ArrowUp') els.undoBtn.click();
  else if(e.code === 'Space'){ e.preventDefault(); if(playerReady){ isPlaying ? player.pauseVideo() : player.playVideo(); } }
});

// ======================================================================
// COLA / MI ROCOLA
// ======================================================================
function addTrackToQueue(t){
  const track = {
    videoId: t.videoId, title: t.title, author: t.channel || t.author || '',
    thumb: t.thumbnail || t.thumb, code: codeForIndex(queueList.length),
  };
  queueList.push(track);
  els.queueCount.textContent = queueList.length;
  renderQueue();
  schedulePersist();
  if(currentIndex === -1) currentIndex = 0; // queda listo pero no se autoreproduce
}

function removeFromQueueSilently(i){
  const wasCurrent = i === currentIndex;
  queueList.splice(i,1);
  queueList.forEach((t,idx)=> t.code = codeForIndex(idx));
  els.queueCount.textContent = queueList.length;
  if(queueList.length === 0){ currentIndex = -1; stopQueuePlayback(); }
  else if(wasCurrent){ currentIndex = Math.min(i, queueList.length-1); }
  else if(i < currentIndex){ currentIndex -= 1; }
  renderQueue();
  schedulePersist();
}

function removeTrack(i){ removeFromQueueSilently(i); }

function renderQueue(){
  els.queue.innerHTML = '';
  if(queueList.length === 0){ els.queue.appendChild(els.emptyMsg); return; }
  queueList.forEach((t,i)=>{
    const row = document.createElement('div');
    row.className = 'track' + (i===currentIndex ? ' current' : '');
    row.innerHTML = `
      <span class="code">${t.code}</span>
      <img src="${t.thumb}" alt="">
      <div class="meta"><div class="t">${escapeHtml(t.title)}</div><div class="a">${escapeHtml(t.author)}</div></div>
      <button class="remove" title="Quitar">✕</button>`;
    row.querySelector('.remove').addEventListener('click', (e)=>{ e.stopPropagation(); removeTrack(i); });
    row.addEventListener('click', ()=> playQueueIndex(i));
    els.queue.appendChild(row);
  });
}

function playQueueIndex(i){
  if(!queueList[i]) return;
  currentIndex = i;
  loadCurrentQueueTrack(true);
}

function loadCurrentQueueTrack(autoplay){
  const t = queueList[currentIndex];
  if(!t) return;
  els.npTitle.textContent = t.title;
  els.npAuthor.textContent = t.author || 'Artista desconocido';
  els.npCode.textContent = t.code;
  renderQueue();
  if(!playerReady){ setTimeout(()=>loadCurrentQueueTrack(autoplay), 250); return; }
  player.loadVideoById(t.videoId);
  player.setVolume(Number(els.volume.value));
  if(!autoplay) player.pauseVideo();
}

function toggleQueuePlay(){
  if(currentIndex === -1){ if(queueList.length) playQueueIndex(0); return; }
  if(!playerReady) return;
  if(isPlaying){ player.pauseVideo(); } else { player.playVideo(); }
}

function stopQueuePlayback(){
  if(playerReady) player.stopVideo();
  isPlaying = false; els.playBtn.textContent='▶';
  els.npTitle.textContent = 'Nada sonando todavía';
  els.npAuthor.textContent = 'Agrega canciones desde "Descubrir"';
  els.npCode.textContent = '— —';
  stopProgressLoop();
  els.progressFill.style.width='0%'; els.curTime.textContent='0:00'; els.durTime.textContent='0:00';
}

function handleQueueTrackEnd(){
  if(repeatMode === 2){ loadCurrentQueueTrack(true); return; }
  goNext(true);
}

function pickNextIndex(auto){
  if(queueList.length === 0) return -1;
  if(shuffleOn){
    if(queueList.length === 1) return 0;
    let n; do{ n = Math.floor(Math.random()*queueList.length); } while(n===currentIndex);
    return n;
  }
  let n = currentIndex + 1;
  if(n >= queueList.length){ if(repeatMode===1) return 0; return auto ? -1 : 0; }
  return n;
}
function goNext(auto){ const n=pickNextIndex(auto); if(n===-1){ stopQueuePlayback(); return; } playQueueIndex(n); }
function goPrev(){
  if(queueList.length===0) return;
  let p = currentIndex-1; if(p<0) p = shuffleOn ? Math.floor(Math.random()*queueList.length) : queueList.length-1;
  playQueueIndex(p);
}

function startProgressLoop(){
  stopProgressLoop();
  progressTimer = setInterval(()=>{
    if(!playerReady || !player.getDuration) return;
    const dur = player.getDuration()||0, cur = player.getCurrentTime()||0;
    els.progressFill.style.width = dur ? `${(cur/dur)*100}%` : '0%';
    els.curTime.textContent = fmtTime(cur); els.durTime.textContent = fmtTime(dur);
  }, 500);
}
function stopProgressLoop(){ if(progressTimer) clearInterval(progressTimer); }

els.progressTrack.addEventListener('click', (e)=>{
  if(!playerReady || currentIndex===-1) return;
  const rect = els.progressTrack.getBoundingClientRect();
  const pct = (e.clientX-rect.left)/rect.width;
  player.seekTo((player.getDuration()||0)*pct, true);
});

els.playBtn.addEventListener('click', toggleQueuePlay);
els.nextBtn.addEventListener('click', ()=> goNext(false));
els.prevBtn.addEventListener('click', goPrev);
els.shuffleBtn.addEventListener('click', ()=>{ shuffleOn=!shuffleOn; els.shuffleBtn.classList.toggle('active', shuffleOn); });
els.repeatBtn.addEventListener('click', ()=>{
  repeatMode = (repeatMode+1)%3;
  els.repeatBtn.classList.toggle('active', repeatMode!==0);
  els.repeatBtn.textContent = repeatMode===2 ? '🔂' : '🔁';
});
els.volume.addEventListener('input', ()=>{ if(playerReady) player.setVolume(Number(els.volume.value)); });

function extractVideoId(url){
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/, /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/, /(?:youtube\.com\/embed\/)([\w-]{11})/,
  ];
  for(const p of patterns){ const m=url.match(p); if(m) return m[1]; }
  if(/^[\w-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

els.addBtn.addEventListener('click', async ()=>{
  const raw = els.urlInput.value.trim();
  if(!raw) return;
  const videoId = extractVideoId(raw);
  if(!videoId){ setStatus('Enlace de YouTube no reconocido.', true); return; }
  let title='Título no disponible', author='';
  try{
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if(res.ok){ const d = await res.json(); title=d.title||title; author=d.author_name||''; }
  }catch(e){}
  addTrackToQueue({ videoId, title, channel:author, thumbnail:`https://img.youtube.com/vi/${videoId}/hqdefault.jpg` });
  els.urlInput.value = '';
});
els.urlInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') els.addBtn.click(); });

// ======================================================================
// Persistencia (guarda/carga la cola vía el puente con Python)
// ======================================================================
function schedulePersist(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    if(window.pywebview && window.pywebview.api){
      window.pywebview.api.save_playlist(queueList).catch(()=>{});
    }
  }, 600);
}

async function restorePlaylist(){
  if(!(window.pywebview && window.pywebview.api)) return;
  try{
    const res = await window.pywebview.api.load_playlist();
    if(res && res.tracks && res.tracks.length){
      queueList = res.tracks;
      queueList.forEach((t,idx)=> t.code = codeForIndex(idx));
      els.queueCount.textContent = queueList.length;
      renderQueue();
    }
  }catch(e){ /* sin datos previos, no pasa nada */ }
}

window.addEventListener('pywebviewready', restorePlaylist);
renderQueue();
