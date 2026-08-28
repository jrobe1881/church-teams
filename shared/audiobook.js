/* Bible Parlor — Audiobook Reader v2
   Primary: streams high-quality MP3 from Supabase Storage
     https://ysnhgsbujahvlnqyggti.supabase.co/storage/v1/object/public/bible-audio/{BOOK}/{CH}.mp3
   Fallback: Web Speech API (SpeechSynthesis) verse-by-verse
   Features:
     - Continuous playback across chapters (auto-advance)
     - Book / Chapter / Verse picker (start playback anywhere)
     - Reader page auto-navigates as audio advances
     - Background playback on mobile via Media Session API + lock-screen controls
     - Verse-level highlighting when possible (native audio uses time cues; fallback highlights per utterance)
     - Persists position + speed + voice in localStorage
     - Minimalist chrome matching the site (round FAB, no shadows)
*/
(function(){
  'use strict';

  const AUDIO_BASE = 'https://ysnhgsbujahvlnqyggti.supabase.co/storage/v1/object/public/bible-audio';
  const LS_POS='bp_ab_pos_v2';
  const LS_SET='bp_ab_settings_v2';
  const LS_CHECK='bp_ab_avail_v1'; // cache which chapters have audio (per book) for the session

  const settings = loadSettings();
  let position = loadPosition();

  let audioEl = null;         // <audio> element for MP3 playback
  let mode = null;            // 'audio' | 'speech' | null
  let currentBook = null;     // {bid, name, abbr, ord, id, chaps}
  let currentChap = null;
  let currentVerseNum = null; // last-known active verse for highlighting
  let loading = false;         // true while a chapter is being fetched/prepared
  let wantPlaying = false;     // user intent — true while we intend to play
  let toggleLock = false;      // brief lock during toggle to prevent double-clicks racing
  let currentLoadAttempt = 0;  // monotonically-increasing id so late events don't affect a superseded load
  let queueCancelled = false;
  let continuousPlay = true;  // auto-advance chapters
  let playing = false;
  let paused = false;
  let bookCache = null;
  const availability = loadAvailability();

  /* ---------- storage helpers ---------- */
  function loadSettings(){
    try{ const s=JSON.parse(localStorage.getItem(LS_SET)||'{}'); return {
      rate:(typeof s.rate==='number'?s.rate:1.0),
      voiceURI:s.voiceURI||null,
      preferNative:(s.preferNative!==false),
      continuous:(s.continuous!==false),
    }; }catch(e){ return {rate:1.0, voiceURI:null, preferNative:true, continuous:true}; }
  }
  function saveSettings(){ try{ localStorage.setItem(LS_SET, JSON.stringify(settings)); }catch(e){} }
  function loadPosition(){ try{ return JSON.parse(localStorage.getItem(LS_POS)||'null'); }catch(e){ return null; } }
  function savePosition(bid,c,v){
    try{
      position={bid:bid|0,c:c|0,v:(v|0)||1,updated:Date.now()};
      localStorage.setItem(LS_POS, JSON.stringify(position));
    }catch(e){}
  }
  function clearPosition(){ try{ localStorage.removeItem(LS_POS); }catch(e){} position=null; renderPanel(); }
  function loadAvailability(){ try{ return JSON.parse(sessionStorage.getItem(LS_CHECK)||'{}'); }catch(e){ return {}; } }
  function saveAvailability(){ try{ sessionStorage.setItem(LS_CHECK, JSON.stringify(availability)); }catch(e){} }

  /* ---------- book/chapter helpers (use META from strongs/meta.js and window.BOOKS from reader) ---------- */
  function meta(){ return (typeof META!=='undefined')?META:(window.META||null); }
  // Chapter count is derived from the max chapter in the vfile; META has vcount (total verses) not chapters.
  // Precompute chapter counts from a canonical mapping (KJV):
  const CHAP_COUNTS = {
    GEN:50,EXO:40,LEV:27,NUM:36,DEU:34,JOS:24,JDG:21,RUT:4,'1SA':31,'2SA':24,'1KI':22,'2KI':25,'1CH':29,'2CH':36,
    EZR:10,NEH:13,EST:10,JOB:42,PSA:150,PRO:31,ECC:12,SNG:8,ISA:66,JER:52,LAM:5,EZK:48,DAN:12,HOS:14,JOL:3,AMO:9,
    OBA:1,JON:4,MIC:7,NAM:3,HAB:3,ZEP:3,HAG:2,ZEC:14,MAL:4,
    MAT:28,MRK:16,LUK:24,JHN:21,ACT:28,ROM:16,'1CO':16,'2CO':13,GAL:6,EPH:6,PHP:4,COL:4,'1TH':5,'2TH':3,
    '1TI':6,'2TI':4,TIT:3,PHM:1,HEB:13,JAS:5,'1PE':5,'2PE':3,'1JN':5,'2JN':1,'3JN':1,JUD:1,REV:22
  };
  function bookByBid(bid){
    const m=meta(); if(!m || !m.books) return null;
    const mb = m.books[bid-1];
    if(!mb) return null;
    return { bid, name:mb.name, abbr:mb.abbr, id:mb.id, ord:mb.ord, chaps:(CHAP_COUNTS[mb.abbr]||1) };
  }
  function allBooks(){
    const m=meta(); if(!m || !m.books) return [];
    return m.books.map((_,i)=>bookByBid(i+1)).filter(Boolean);
  }

  /* ---------- audio availability check ---------- */
  async function checkAudioAvailable(abbr, chap){
    const key=`${abbr}/${chap}`;
    if(availability[key]!==undefined) return availability[key];
    try{
      const r=await fetch(`${AUDIO_BASE}/${abbr}/${chap}.mp3`, {method:'HEAD', cache:'no-cache'});
      availability[key] = r.ok;
      saveAvailability();
      return r.ok;
    }catch(e){ availability[key]=false; saveAvailability(); return false; }
  }

  /* ---------- reader integration ---------- */
  function verseElements(){
    const wrap=document.getElementById('verses');
    if(!wrap) return [];
    return Array.from(wrap.querySelectorAll('.verse'));
  }
  function verseTextOf(el){
    if(!el) return '';
    const clone=el.cloneNode(true);
    // Remove verse-number sup and margin markers
    clone.querySelectorAll('.vn, .vnum, sup, .marg, .footnote-anchor').forEach(n=>n.remove());
    let t=(clone.textContent||'').replace(/¶/g,'').replace(/\s+/g,' ').trim();
    // Strip leading digit-run if it looks like a verse number that leaked in
    t=t.replace(/^\d+\s+/,'');
    return t;
  }
  function highlightVerse(n){
    if(currentVerseNum===n) return;
    document.querySelectorAll('.verse.ab-now').forEach(el=>el.classList.remove('ab-now'));
    currentVerseNum=n;
    if(!n) return;
    const target=document.getElementById('v-'+n) || document.querySelector(`.verse[data-v="${n}"]`);
    if(target){
      target.classList.add('ab-now');
      try{ target.scrollIntoView({behavior:'smooth', block:'center'}); }catch(e){}
    }
  }
  function ensureReaderOnChapter(bid, chap){
    // Reader stores `state.bid` as an abbreviation string like 'GEN'/'PSA'.
    // Our internal `bid` is a 1-based numeric index. Convert before comparing.
    const abbr = (typeof bid === 'number') ? (bookByBid(bid)||{}).id : bid;
    if(!abbr) return false;
    // If already on target chapter (via state or hash), no navigation needed.
    if(readerAtChapter(abbr, chap)) return true;
    // Navigate via hash change — the reader listens for hashchange and re-renders.
    try{
      const h = `#b=${abbr}&c=${chap}&v=1`;
      if(location.hash !== h){ location.hash = h; }
      return true;
    }catch(e){}
    return false;
  }
  function readerAtChapter(abbr, chap){
    // `state` is a top-level `let` in read/index.html — not attached to window.
    // Fall back to parsing location.hash which the reader keeps canonical
    // (`#b=PSA&c=23&v=1`).
    if(window.state && window.state.bid===abbr && window.state.c===chap) return true;
    const h = location.hash || '';
    const bm = /[#&?]b=([A-Z0-9]+)/i.exec(h);
    const cm = /[#&?]c=(\d+)/i.exec(h);
    if(bm && cm){
      if(bm[1].toUpperCase()===abbr && parseInt(cm[1],10)===chap){
        return true;
      }
    }
    return false;
  }
  async function waitForChapterRender(bid, chap, timeoutMs=6000){
    const t0=Date.now();
    const abbr = (typeof bid === 'number') ? (bookByBid(bid)||{}).id : bid;
    return new Promise(resolve=>{
      const iv=setInterval(()=>{
        if(readerAtChapter(abbr, chap)){
          const verses=verseElements();
          if(verses.length){ clearInterval(iv); resolve(true); return; }
        }
        if(Date.now()-t0>timeoutMs){ clearInterval(iv); resolve(false); }
      },80);
    });
  }

  /* ---------- native audio player ---------- */
  function ensureAudioEl(){
    if(audioEl) return audioEl;
    audioEl = new Audio();
    audioEl.preload='auto';
    audioEl.playbackRate = settings.rate || 1.0;
    audioEl.addEventListener('play', ()=>{
      // Reconcile state — user is playing.
      playing=true; paused=false; loading=false;
      renderPill(); updateMediaSession();
    });
    audioEl.addEventListener('playing', ()=>{
      // Actual audio started producing sound (after buffering).
      playing=true; paused=false; loading=false;
      renderPill(); updateMediaSession();
    });
    audioEl.addEventListener('pause', ()=>{
      // Only trust pause events when we're not actively (re)loading a source
      // and the element isn't ended. This filters the spurious pause event
      // fired when .src is (re)assigned.
      if(loading) return;
      if(audioEl.ended) return;
      if(!wantPlaying) { paused=true; playing=false; renderPill(); updateMediaSession(); }
      // If wantPlaying is true but the element paused (e.g. buffering stall),
      // we don't flip state — the 'playing' event will reset it when audio resumes.
    });
    audioEl.addEventListener('waiting', ()=>{
      // Buffering — keep the play intent but signal loading
      if(wantPlaying){ loading=true; renderPill(); }
    });
    audioEl.addEventListener('canplay', ()=>{
      loading=false; renderPill();
    });
    audioEl.addEventListener('ended', ()=>{
      // Move to next chapter
      wantPlaying = continuousPlay && !queueCancelled;
      if(continuousPlay && !queueCancelled){
        goNextChapter();
      } else {
        playing=false; paused=false; loading=false; highlightVerse(null); renderPill(); updateMediaSession();
      }
    });
    audioEl.addEventListener('error', (e)=>{
      // Only fall back to speech for real load failures — not for user actions.
      // The 'error' event fires when src loading fails or is unsupported.
      // We ignore errors when we've cleared the src (empty src).
      if(!audioEl.src || audioEl.src === window.location.href){ return; }
      console.warn('[audiobook] audio error, falling back to speech', audioEl.error?.code, e);
      loading=false;
      if(currentBook && currentChap){
        startSpeechFor(currentBook, currentChap, currentVerseNum||1);
      }
    });
    audioEl.addEventListener('timeupdate', onTimeUpdate);
    return audioEl;
  }
  function onTimeUpdate(){
    // Estimate current verse from time — best-effort: divide chapter duration evenly by verse count
    if(!audioEl || !audioEl.duration || !currentBook || !currentChap) return;
    const verses=verseElements();
    if(!verses.length) return;
    const dur=audioEl.duration;
    const cur=audioEl.currentTime;
    const frac=Math.max(0, Math.min(0.999, cur/dur));
    const idx=Math.floor(frac*verses.length);
    const el=verses[idx];
    if(!el) return;
    const v=parseInt(el.dataset.v||el.id.replace('v-',''),10);
    if(v && v!==currentVerseNum){
      highlightVerse(v);
      savePosition(currentBook.bid, currentChap, v);
    }
  }

  async function startAudioFor(book, chap, startVerse){
    stopSpeech();
    mode='audio';
    currentBook=book; currentChap=chap; currentVerseNum=startVerse||1;
    queueCancelled=false;
    // Set intent + loading state up-front so the UI reflects action immediately
    wantPlaying = true;
    loading = true;
    paused = false;
    playing = false;
    renderPill();
    ensureReaderOnChapter(book.bid, chap);
    await waitForChapterRender(book.bid, chap);
    const url = `${AUDIO_BASE}/${book.abbr}/${chap}.mp3`;
    const el = ensureAudioEl();
    // Assign a fresh src — the 'pause' event that fires here is filtered
    // by the pause handler (it checks `loading` flag).
    el.src = url;
    el.playbackRate = settings.rate || 1.0;

    // Guard against a stalled load — if the MP3 can't be fetched within a
    // reasonable window, drop to speech so the user isn't stuck on "loading".
    // Track this attempt's id so late events don't affect a later chapter.
    const loadAttempt = ++currentLoadAttempt;
    let stalled = setTimeout(()=>{
      if(loadAttempt !== currentLoadAttempt) return;
      if(!wantPlaying || playing) return;
      if(el.readyState >= 2) return; // already have data
      console.warn('[audiobook] load stalled — falling back to speech');
      try{ el.pause(); }catch(e){}
      loading = false;
      startSpeechFor(book, chap, startVerse||1);
    }, 8000);

    // Seek to approximate position for startVerse
    el.addEventListener('loadedmetadata', function once(){
      el.removeEventListener('loadedmetadata', once);
      if(loadAttempt !== currentLoadAttempt) return; // superseded
      clearTimeout(stalled);
      // If user pressed pause during load, honor that
      if(!wantPlaying){ loading=false; paused=true; renderPill(); return; }
      const verses=verseElements();
      if(verses.length && startVerse && startVerse>1){
        const idx=Math.max(0, Math.min(verses.length-1, startVerse-1));
        try{ el.currentTime = (el.duration * idx) / verses.length; }catch(e){}
      }
      el.play().then(()=>{
        loading=false; playing=true; paused=false; renderPill(); updateMediaSession();
      }).catch(err=>{
        console.warn('[audiobook] play() blocked', err);
        loading=false; wantPlaying=false; paused=true; playing=false; renderPill();
      });
    }, {once:true});
    savePosition(book.bid, chap, startVerse||1);
  }

  /* ---------- speech fallback ---------- */
  let speechUtter=null;
  let speechQueue=[];
  let speechIndex=0;
  function pickVoice(){
    if(!('speechSynthesis' in window)) return null;
    const voices=speechSynthesis.getVoices()||[]; if(!voices.length) return null;
    if(settings.voiceURI){ const s=voices.find(v=>v.voiceURI===settings.voiceURI); if(s) return s; }
    const en=voices.filter(v=>/^en(-|_|$)/i.test(v.lang));
    const pool=en.length?en:voices;
    const preferred=pool.find(v=>/Samantha|Karen|Google US English|Microsoft (Aria|Guy|Jenny|Ryan)/i.test(v.name));
    return preferred || pool.find(v=>v.localService) || pool[0];
  }
  function stopSpeech(){
    queueCancelled=true;
    if('speechSynthesis' in window){
      try{ speechSynthesis.cancel(); }catch(e){}
    }
    speechUtter=null; speechQueue=[]; speechIndex=0;
  }
  async function startSpeechFor(book, chap, startVerse){
    if(!('speechSynthesis' in window)){
      alert('This browser does not support speech synthesis.'); return;
    }
    mode='speech';
    currentBook=book; currentChap=chap; currentVerseNum=startVerse||1;
    queueCancelled=false; playing=true; paused=false; loading=false; wantPlaying=true;
    ensureReaderOnChapter(book.bid, chap);
    await waitForChapterRender(book.bid, chap);
    const verses=verseElements();
    speechQueue = verses.map(el=>({
      v: parseInt(el.dataset.v||el.id.replace('v-',''),10) || 0,
      text: verseTextOf(el),
    })).filter(x=>x.v>=(startVerse||1) && x.text);
    speechIndex=0;
    savePosition(book.bid, chap, startVerse||1);
    renderPill(); updateMediaSession();
    runSpeechQueue();
  }
  function runSpeechQueue(){
    if(queueCancelled) return;
    if(speechIndex>=speechQueue.length){
      // chapter done
      if(continuousPlay && !queueCancelled){ goNextChapter(); return; }
      playing=false; paused=false; highlightVerse(null); renderPill(); return;
    }
    const item=speechQueue[speechIndex];
    highlightVerse(item.v);
    savePosition(currentBook.bid, currentChap, item.v);
    const u=new SpeechSynthesisUtterance(item.text);
    const voice=pickVoice(); if(voice) u.voice=voice;
    u.rate = settings.rate || 1.0;
    u.pitch=1.0; u.volume=1.0;
    u.onend=()=>{
      if(queueCancelled) return;
      speechIndex++;
      runSpeechQueue();
    };
    u.onerror=()=>{
      if(queueCancelled) return;
      speechIndex++;
      runSpeechQueue();
    };
    speechUtter=u;
    try{ speechSynthesis.speak(u); }catch(e){ console.warn('[audiobook] speak err', e); }
  }

  /* ---------- chapter navigation ---------- */
  async function goNextChapter(){
    if(!currentBook) return;
    let nextBid=currentBook.bid, nextChap=currentChap+1;
    if(nextChap > currentBook.chaps){
      nextBid=currentBook.bid+1;
      nextChap=1;
      if(!window.BOOKS || nextBid>window.BOOKS.length){
        // End of Bible
        playing=false; paused=false; highlightVerse(null);
        clearPosition();
        renderPill();
        return;
      }
    }
    const nextBook = bookByBid(nextBid);
    if(!nextBook) return;
    await playChapter(nextBook, nextChap, 1);
  }
  async function playChapter(book, chap, startVerse){
    if(!book) return;
    stopSpeech();
    // Signal we're switching chapters — pause but do NOT clear src
    // (clearing to '' fires an error event that spuriously triggers speech fallback).
    if(audioEl){ try{ audioEl.pause(); }catch(e){} }
    // Mark loading state now so the UI shows a spinner while checking availability
    loading = true; wantPlaying = true; playing = false; paused = false;
    // Set current context early so pill can render a label even before audio loads
    currentBook = book; currentChap = chap; currentVerseNum = startVerse||1;
    renderPill();
    const useAudio = settings.preferNative && await checkAudioAvailable(book.abbr, chap);
    if(useAudio){
      await startAudioFor(book, chap, startVerse||1);
    } else {
      await startSpeechFor(book, chap, startVerse||1);
    }
  }

  /* ---------- public API ---------- */
  const api = {
    async play(startPos){
      // startPos = {bid, c, v} or null (use saved or default Genesis 1:1)
      let target=startPos;
      if(!target){
        target = position || {bid:1, c:1, v:1};
      }
      const book=bookByBid(target.bid);
      if(!book){ console.warn('[audiobook] no book', target); return; }
      await playChapter(book, target.c||1, target.v||1);
    },
    async playFromSaved(){
      if(!position) return api.play({bid:1,c:1,v:1});
      return api.play(position);
    },
    pause(){
      wantPlaying = false;
      if(mode==='audio' && audioEl){
        try{ audioEl.pause(); }catch(e){}
        paused=true; playing=false; loading=false;
      }
      else if(mode==='speech' && 'speechSynthesis' in window){
        try{ speechSynthesis.pause(); }catch(e){}
        paused=true; playing=false;
      }
      renderPill(); updateMediaSession();
    },
    resume(){
      wantPlaying = true;
      if(mode==='audio' && audioEl){
        // If src is set but readyState is low, we're loading again
        if(audioEl.readyState < 2){ loading=true; renderPill(); }
        audioEl.play().then(()=>{
          loading=false; playing=true; paused=false; renderPill(); updateMediaSession();
        }).catch(err=>{
          console.warn('[audiobook] resume blocked', err);
          loading=false; paused=true; playing=false; renderPill();
        });
      }
      else if(mode==='speech' && 'speechSynthesis' in window){
        try{ speechSynthesis.resume(); }catch(e){}
        paused=false; playing=true;
        renderPill(); updateMediaSession();
      }
      else {
        renderPill();
      }
    },
    stop(){
      wantPlaying=false;
      queueCancelled=true;
      if(audioEl){ try{ audioEl.pause(); audioEl.currentTime=0; }catch(e){} }
      stopSpeech();
      playing=false; paused=false; loading=false; highlightVerse(null);
      renderPill(); updateMediaSession();
    },
    toggle(){
      // Serialize rapid clicks — reject if a toggle is already in-flight
      if(toggleLock) return;
      toggleLock = true;
      setTimeout(()=>{ toggleLock=false; }, 250);
      // If nothing is loaded yet, start from saved or default
      if(!currentBook){ return api.playFromSaved(); }
      // If we're loading, treat toggle as "cancel load & pause intent"
      if(loading){ wantPlaying=false; return api.pause(); }
      if(playing) return api.pause();
      if(paused)  return api.resume();
      // Fallback: nothing playing or paused — start from saved
      return api.playFromSaved();
    },
    isLoading(){ return loading; },
    setRate(r){ settings.rate=Math.max(0.5, Math.min(2.0, +r||1.0)); saveSettings(); if(audioEl) audioEl.playbackRate=settings.rate; renderPanel(); },
    setVoice(uri){ settings.voiceURI=uri||null; saveSettings(); renderPanel(); },
    setContinuous(v){ continuousPlay=!!v; settings.continuous=continuousPlay; saveSettings(); renderPanel(); },
    setPreferNative(v){ settings.preferNative=!!v; saveSettings(); renderPanel(); },
    getSavedPosition(){ return position; },
    clearSavedPosition(){ clearPosition(); },
    isPlaying(){ return playing; },
    isPaused(){ return paused; },
    getCurrentVerse(){ return currentVerseNum; },
    togglePanel(){ togglePanel(); },
    openPanel(){ openPanel(); },
    closePanel(){ closePanel(); },
  };
  window.BPAudiobook = api;

  /* ---------- Media Session (lock-screen / background controls) ---------- */
  function updateMediaSession(){
    if(!('mediaSession' in navigator)) return;
    try{
      const title = currentBook ? `${currentBook.name} ${currentChap||''}${currentVerseNum?':'+currentVerseNum:''}` : 'Bible Parlor';
      navigator.mediaSession.metadata = new MediaMetadata({
        title, artist:'Bible Parlor', album:'King James Version',
        artwork:[
          {src:'/favicon-192.png', sizes:'192x192', type:'image/png'},
          {src:'/favicon-512.png', sizes:'512x512', type:'image/png'},
        ]
      });
      navigator.mediaSession.playbackState = playing ? 'playing' : (paused ? 'paused' : 'none');
      navigator.mediaSession.setActionHandler('play', ()=>api.resume());
      navigator.mediaSession.setActionHandler('pause', ()=>api.pause());
      navigator.mediaSession.setActionHandler('stop', ()=>api.stop());
      navigator.mediaSession.setActionHandler('nexttrack', ()=>goNextChapter());
      navigator.mediaSession.setActionHandler('previoustrack', ()=>{
        if(!currentBook) return;
        let pb=currentBook.bid, pc=currentChap-1;
        if(pc<1){ pb=currentBook.bid-1; if(pb<1) return; const pbk=bookByBid(pb); pc=pbk.chaps; }
        const pbk=bookByBid(pb); if(pbk) playChapter(pbk, pc, 1);
      });
    }catch(e){}
  }

  /* ---------- UI ---------- */
  const ICONS = {
    play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 5l8 7-8 7V5zM16 5h2v14h-2z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18 5l-8 7 8 7V5zM6 5h2v14H6z"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    spinner: '<svg class="ab-spin" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9" opacity=".95"/></svg>',
  };

  function injectStyles(){
    if(document.getElementById('bp-ab-style')) return;
    const css = document.createElement('style');
    css.id='bp-ab-style';
    css.textContent = `
      .verse.ab-now{
        background: color-mix(in oklab, var(--accent) 10%, transparent);
        box-shadow: inset 2px 0 0 var(--accent);
        border-radius: 4px;
      }
      .bp-ab-launcher{
        position: fixed; right: 16px; bottom: 120px; z-index: 9996;
        width: 40px; height: 40px; border-radius: 50%;
        border: 1px solid var(--border); background: var(--surface);
        color: var(--ink-2); cursor: pointer;
        display: inline-flex; align-items:center; justify-content:center;
        transition: background 160ms, color 160ms, border-color 160ms, transform 160ms;
      }
      .bp-ab-launcher:hover{ background: var(--surface-2); color: var(--accent); border-color: var(--accent); transform: translateY(-1px); }
      .bp-ab-launcher.active{ background: var(--accent-tint); color: var(--accent); border-color: var(--accent); }
      .bp-ab-launcher .ab-dot{
        position:absolute; top:2px; right:2px; width:8px; height:8px; border-radius:50%;
        background: var(--accent); box-shadow: 0 0 0 2px var(--surface);
        opacity: 0; transition: opacity 200ms;
      }
      .bp-ab-launcher.playing .ab-dot{ opacity: 1; animation: bp-ab-pulse 1.4s ease-in-out infinite; }
      @keyframes bp-ab-pulse { 50% { opacity: .35; } }

      .bp-ab-pill{
        position: fixed; right: 16px; bottom: 120px; z-index: 9996;
        display: flex; align-items: center; gap: 4px;
        padding: 6px; background: var(--surface);
        border: 1px solid var(--border); border-radius: var(--r-md);
        font-family: var(--font-sans); font-size: var(--t-sm); color: var(--ink);
      }
      .bp-ab-pill .ab-btn{
        appearance:none; border:1px solid transparent; background:transparent; color:var(--ink-2);
        width:32px; height:32px; border-radius: var(--r-sm); cursor:pointer;
        display:inline-flex; align-items:center; justify-content:center;
        transition: background var(--dur-1), color var(--dur-1);
      }
      .bp-ab-pill .ab-btn:hover{ background: var(--surface-2); color: var(--ink); }
      .bp-ab-pill .ab-btn.primary{ color: var(--accent); }
      .bp-ab-pill .ab-status{ padding: 0 8px; color: var(--ink-3); font-size: var(--t-xs); white-space: nowrap; }
      .bp-ab-pill select{ height:28px; border:1px solid var(--border); background:var(--surface); color:var(--ink-2); border-radius: var(--r-sm); font-size:var(--t-xs); padding: 0 4px; }
      .bp-ab-pill .ab-close{ width: 26px; height: 26px; }

      .bp-ab-panel{
        position: fixed; right: 16px; bottom: 168px; z-index: 9995;
        background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md);
        padding: 12px; min-width: 300px; max-width: min(360px, calc(100vw - 24px));
        font-family: var(--font-sans); color: var(--ink); font-size: var(--t-sm);
      }
      .bp-ab-panel h4{ margin: 0 0 10px 0; font-size: var(--t-xs); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3); font-weight: 600; }
      .bp-ab-panel .ab-row{ display:flex; align-items:center; justify-content:space-between; margin-bottom: 8px; gap: 10px; }
      .bp-ab-panel .ab-row label{ color: var(--ink-2); font-size: var(--t-sm); }
      .bp-ab-panel select, .bp-ab-panel input[type=number]{
        border:1px solid var(--border); background:var(--surface); color:var(--ink); border-radius: var(--r-sm);
        padding: 4px 6px; font-size: var(--t-sm); min-width: 130px;
      }
      .bp-ab-panel .ab-picker{ display:grid; grid-template-columns: 1fr 84px 68px; gap: 6px; margin: 8px 0; }
      .bp-ab-panel .ab-picker select, .bp-ab-panel .ab-picker input{ min-width: 0; width: 100%; box-sizing: border-box; }
      .bp-ab-panel .ab-btn{
        display:block; width:100%; margin-top: 8px;
        padding: 9px 12px; border-radius: var(--r-sm);
        border:1px solid var(--border); background: var(--surface); color: var(--ink);
        font-size: var(--t-sm); font-family: var(--font-sans); cursor: pointer;
        text-align: left; transition: background var(--dur-1), border-color var(--dur-1), color var(--dur-1);
      }
      .bp-ab-panel .ab-btn:hover{ background: var(--surface-2); }
      .bp-ab-panel .ab-btn.primary{ border-color: var(--accent); color: var(--accent); }
      .bp-ab-panel .ab-btn.primary:hover{ background: var(--accent-tint); }
      .bp-ab-panel .ab-btn.muted{ color: var(--ink-3); font-size: var(--t-xs); }
      .bp-ab-panel .ab-btn .ab-b-label{ font-size: var(--t-xs); color: var(--ink-3); letter-spacing: .04em; display:block; margin-top:2px; }
      .bp-ab-panel .ab-btn.primary .ab-b-label{ color: var(--accent); opacity: .8; }
      .bp-ab-panel .ab-toggle{ display:flex; align-items:center; gap:8px; margin: 6px 0; color: var(--ink-2); font-size: var(--t-xs); cursor:pointer; }
      .bp-ab-panel .ab-toggle input{ margin: 0; }
      .bp-ab-panel .ab-close{
        position:absolute; top:6px; right:6px; width:26px; height:26px;
        border:0; background:transparent; color: var(--ink-3); cursor:pointer;
        display:inline-flex; align-items:center; justify-content:center; border-radius: var(--r-sm);
      }
      .bp-ab-panel .ab-close:hover{ background: var(--surface-2); color: var(--ink); }
      .bp-ab-panel{ position: fixed; }

      @media (max-width: 620px){
        .bp-ab-pill{ right: 12px; bottom: 104px; padding: 5px; gap: 2px; }
        .bp-ab-pill .ab-status{ display:none; }
        .bp-ab-launcher{ right: 12px; bottom: 104px; width: 36px; height: 36px; }
        .bp-ab-panel{ right: 12px; bottom: 148px; left: 12px; min-width: 0; max-width: none; }
      }

      @keyframes bp-ab-spin{ to { transform: rotate(360deg); } }
      .ab-spin{ animation: bp-ab-spin 900ms linear infinite; transform-origin: center; }

      @media print{
        .bp-ab-pill, .bp-ab-launcher, .bp-ab-panel{ display:none !important; }
        .verse.ab-now{ background: none !important; box-shadow: none !important; }
      }
    `;
    document.head.appendChild(css);
  }

  let launcherEl=null, pillEl=null, panelEl=null, panelOpen=false;

  function ensureLauncher(){
    if(launcherEl) return launcherEl;
    launcherEl=document.createElement('button');
    launcherEl.className='bp-ab-launcher';
    launcherEl.type='button';
    launcherEl.setAttribute('aria-label','Audiobook reader');
    launcherEl.innerHTML=ICONS.speaker+'<span class="ab-dot" aria-hidden="true"></span>';
    launcherEl.addEventListener('click', togglePanel);
    document.body.appendChild(launcherEl);
    return launcherEl;
  }
  function ensurePill(){
    if(pillEl) return pillEl;
    pillEl=document.createElement('div');
    pillEl.className='bp-ab-pill';
    pillEl.style.display='none';
    document.body.appendChild(pillEl);
    return pillEl;
  }
  function ensurePanel(){
    if(panelEl) return panelEl;
    panelEl=document.createElement('div');
    panelEl.className='bp-ab-panel';
    panelEl.style.display='none';
    document.body.appendChild(panelEl);
    return panelEl;
  }
  function openPanel(){ panelOpen=true; ensurePanel().style.display=''; renderPanel(); if(launcherEl) launcherEl.classList.add('active'); }
  function closePanel(){ panelOpen=false; if(panelEl) panelEl.style.display='none'; if(launcherEl) launcherEl.classList.remove('active'); }
  function togglePanel(){ if(panelOpen) closePanel(); else openPanel(); }

  function renderPill(){
    ensurePill();
    // Show pill whenever we have any active state (playing/paused/loading)
    if(!playing && !paused && !loading){ pillEl.style.display='none'; if(launcherEl) launcherEl.classList.remove('playing'); return; }
    pillEl.style.display='';
    if(launcherEl) launcherEl.classList.toggle('playing', playing);
    const label = currentBook ? `${currentBook.name} ${currentChap}${currentVerseNum?':'+currentVerseNum:''}${loading?' • loading…':''}` : (loading?'Loading…':'');
    const mainIcon = loading ? ICONS.spinner : (playing ? ICONS.pause : ICONS.play);
    pillEl.innerHTML = `
      <button class="ab-btn" data-act="prev" aria-label="Previous chapter" ${loading?'disabled':''}>${ICONS.prev}</button>
      <button class="ab-btn primary" data-act="toggle" aria-label="${loading?'Loading':(playing?'Pause':'Play')}">${mainIcon}</button>
      <button class="ab-btn" data-act="stop" aria-label="Stop">${ICONS.stop}</button>
      <button class="ab-btn" data-act="next" aria-label="Next chapter" ${loading?'disabled':''}>${ICONS.next}</button>
      <span class="ab-status">${label}</span>
      <select data-act="rate" aria-label="Speed">
        ${[0.75,0.9,1,1.1,1.25,1.5].map(r=>`<option value="${r}"${(settings.rate===r||(!settings.rate&&r===1))?' selected':''}>${r}×</option>`).join('')}
      </select>
      <button class="ab-btn ab-close" data-act="close" aria-label="Hide">${ICONS.close}</button>
    `;
    pillEl.querySelectorAll('[data-act]').forEach(el=>{
      const a=el.dataset.act;
      if(el.tagName==='SELECT'){
        el.onchange=()=>api.setRate(+el.value);
      } else {
        el.onclick=()=>{
          if(a==='toggle') api.toggle();
          else if(a==='stop') api.stop();
          else if(a==='next') goNextChapter();
          else if(a==='prev'){
            if(!currentBook) return;
            let pb=currentBook.bid, pc=currentChap-1;
            if(pc<1){ pb=currentBook.bid-1; if(pb<1) return; const pbk=bookByBid(pb); pc=pbk.chaps; }
            const pbk=bookByBid(pb); if(pbk) playChapter(pbk, pc, 1);
          }
          else if(a==='close'){ /* keep playing, just hide */ pillEl.style.display='none'; }
        };
      }
    });
  }

  function renderPanel(){
    ensurePanel();
    if(!panelOpen) return;
    const books = allBooks();
    // Determine picker defaults
    const st = (window.state && window.state.bid) ? window.state : (position || {bid:1,c:1,v:1});
    const curBid = (currentBook?currentBook.bid:st.bid) || 1;
    const curChap = currentChap || st.c || 1;
    const curVerse = currentVerseNum || st.v || 1;
    const bookInfo = bookByBid(curBid);
    const chaps = bookInfo ? bookInfo.chaps : 1;
    // We don't know verse count without loading — allow a number input
    panelEl.innerHTML = `
      <button class="ab-close" data-act="close" aria-label="Close">${ICONS.close}</button>
      <h4>Read Aloud</h4>
      <div class="ab-row"><label>Speed</label>
        <select data-act="rate">
          ${[0.75,0.9,1,1.1,1.25,1.5].map(r=>`<option value="${r}"${(settings.rate===r||(!settings.rate&&r===1))?' selected':''}>${r}×</option>`).join('')}
        </select>
      </div>
      <div class="ab-row"><label>Voice</label>
        <select data-act="voice">
          <option value="">Premium narrator</option>
          <option value="__system__"${settings.preferNative?'':' selected'}>System voice (fallback)</option>
        </select>
      </div>
      <label class="ab-toggle"><input type="checkbox" data-act="continuous" ${continuousPlay?'checked':''}/> Play continuously across chapters</label>

      <h4 style="margin-top:14px">Start From</h4>
      <div class="ab-picker">
        <select data-act="pick-book">
          ${books.map(b=>`<option value="${b.bid}"${b.bid===curBid?' selected':''}>${b.name}</option>`).join('')}
        </select>
        <select data-act="pick-chap">
          ${Array.from({length:chaps},(_,i)=>i+1).map(c=>`<option value="${c}"${c===curChap?' selected':''}>Ch ${c}</option>`).join('')}
        </select>
        <input type="number" data-act="pick-verse" min="1" value="${curVerse}" aria-label="Verse"/>
      </div>
      <button class="ab-btn primary" data-act="play-picker">Play from selection<span class="ab-b-label">${bookInfo?bookInfo.name:''} ${curChap}:${curVerse}</span></button>

      ${position?`<button class="ab-btn" data-act="resume">Resume<span class="ab-b-label">${(bookByBid(position.bid)||{name:''}).name} ${position.c}:${position.v}</span></button>`:''}
      ${position?`<button class="ab-btn muted" data-act="clear">Clear saved position</button>`:''}
    `;
    panelEl.querySelectorAll('[data-act]').forEach(el=>{
      const a=el.dataset.act;
      if(a==='rate') el.onchange=()=>api.setRate(+el.value);
      else if(a==='voice') el.onchange=()=>{ api.setPreferNative(el.value !== '__system__'); };
      else if(a==='continuous') el.onchange=()=>api.setContinuous(el.checked);
      else if(a==='pick-book') el.onchange=()=>{ /* rerender to update chapter dropdown */
        const bid=+el.value; const bk=bookByBid(bid);
        const chapSel = panelEl.querySelector('[data-act="pick-chap"]');
        chapSel.innerHTML = Array.from({length:bk.chaps},(_,i)=>i+1).map(c=>`<option value="${c}">Ch ${c}</option>`).join('');
        updatePickerLabel();
      };
      else if(a==='pick-chap') el.onchange=updatePickerLabel;
      else if(a==='pick-verse') el.oninput=updatePickerLabel;
      else if(a==='play-picker') el.onclick=()=>{
        const bid=+panelEl.querySelector('[data-act="pick-book"]').value;
        const c=+panelEl.querySelector('[data-act="pick-chap"]').value;
        const v=+panelEl.querySelector('[data-act="pick-verse"]').value || 1;
        api.play({bid, c, v});
        closePanel();
      };
      else if(a==='resume') el.onclick=()=>{ api.playFromSaved(); closePanel(); };
      else if(a==='clear') el.onclick=()=>{ clearPosition(); renderPanel(); };
      else if(a==='close') el.onclick=closePanel;
    });
    function updatePickerLabel(){
      const bidEl=panelEl.querySelector('[data-act="pick-book"]');
      const cEl=panelEl.querySelector('[data-act="pick-chap"]');
      const vEl=panelEl.querySelector('[data-act="pick-verse"]');
      const lbl=panelEl.querySelector('[data-act="play-picker"] .ab-b-label');
      if(!bidEl||!lbl) return;
      const bk=bookByBid(+bidEl.value);
      lbl.textContent = `${bk?bk.name:''} ${cEl?cEl.value:1}:${vEl?(vEl.value||1):1}`;
    }
  }

  /* ---------- boot ---------- */
  function boot(){
    injectStyles();
    ensureLauncher();
    ensurePill();
    // Warm up voices for fallback
    if('speechSynthesis' in window){
      try{ speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged=()=>{}; }catch(e){}
    }
    continuousPlay = settings.continuous!==false;
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
