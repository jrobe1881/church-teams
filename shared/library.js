/* library.js — Universal cross-tool library for highlights and bookmarks.
   Stored under one cloud-synced key ("bsh_library") so a verse marked in the
   Study Bible shows up in Strong's, Word-Study, and the Builder.
   Exposes a floating drawer with tabs for Highlights, Bookmarks, and Recent.

   Public API:
     BshLibrary.add({type:'highlight'|'bookmark', ref:'Book C:V', color?, note?, tool?})
     BshLibrary.remove(id)
     BshLibrary.list(type?)                 -> [{id,type,ref,color,note,tool,at}]
     BshLibrary.has(ref, type?)             -> boolean
     BshLibrary.toggleHighlight(ref, color?, note?)  -> newState boolean
     BshLibrary.toggleBookmark(ref)         -> newState boolean
     BshLibrary.open()
     BshLibrary.onChange(fn)
     BshLibrary.recordRecent(ref, tool)     -> adds to recent list (capped)
*/
(function(){
  if (window.BshLibrary) return;
  var KEY = 'bsh_library_v1';
  var listeners = [];

  function safeLoad(){
    try { var raw = (window.safeLS||localStorage).getItem(KEY); if (!raw) return { items:[], recent:[] }; var d = JSON.parse(raw); if (!d || typeof d !== 'object') return { items:[], recent:[] }; d.items = Array.isArray(d.items)?d.items:[]; d.recent = Array.isArray(d.recent)?d.recent:[]; return d; }
    catch(e){ return { items:[], recent:[] }; }
  }
  function safeSave(d){
    try { (window.safeLS||localStorage).setItem(KEY, JSON.stringify(d)); } catch(e){}
    if (librarySync) librarySync.notifyLocalChange();
  }

  var state = safeLoad();

  var librarySync = null;
  function tryBind(){
    if (!window.CloudAccount || librarySync) return;
    librarySync = window.CloudAccount.bindSync('library', {
      getLocal: function(){ return safeLoad(); },
      setLocal: function(d){ try { (window.safeLS||localStorage).setItem(KEY, JSON.stringify(d||{items:[],recent:[]})); } catch(e){} },
      emptyValue: {items:[],recent:[]},
      onRemoteUpdate: function(){ state = safeLoad(); notify(); renderPanel(); }
    });
  }
  if (window.CloudAccount) tryBind(); else { var w = setInterval(function(){ if (window.CloudAccount) { tryBind(); clearInterval(w); } }, 300); }

  function notify(){ listeners.forEach(function(fn){ try { fn(state); } catch(e){} }); }
  function onChange(fn){ listeners.push(fn); try { fn(state); } catch(e){} return function(){ listeners = listeners.filter(function(f){return f!==fn;}); }; }

  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function normRef(r){ return String(r||'').trim().replace(/\s+/g,' '); }

  function findIdx(ref, type){
    ref = normRef(ref);
    for (var i=0;i<state.items.length;i++){
      var it = state.items[i];
      if (it.ref === ref && (!type || it.type === type)) return i;
    }
    return -1;
  }
  function has(ref, type){ return findIdx(ref, type) >= 0; }

  function add(item){
    if (!item || !item.ref) return null;
    var it = {
      id: item.id || uid(),
      type: item.type === 'bookmark' ? 'bookmark' : 'highlight',
      ref: normRef(item.ref),
      color: item.color || 'yellow',
      note: item.note || '',
      tool: item.tool || (location.pathname.split('/').filter(Boolean).pop() || 'hub'),
      at: item.at || Date.now()
    };
    var idx = findIdx(it.ref, it.type);
    if (idx >= 0) {
      state.items[idx] = Object.assign(state.items[idx], it);
    } else {
      state.items.push(it);
    }
    safeSave(state);
    notify();
    renderPanel();
    return it;
  }

  function remove(id){
    var before = state.items.length;
    state.items = state.items.filter(function(x){ return x.id !== id; });
    if (state.items.length !== before) { safeSave(state); notify(); renderPanel(); }
  }

  function list(type){
    if (!type) return state.items.slice().sort(function(a,b){return b.at-a.at;});
    return state.items.filter(function(x){return x.type===type;}).sort(function(a,b){return b.at-a.at;});
  }

  function toggleHighlight(ref, color, note){
    ref = normRef(ref);
    var idx = findIdx(ref, 'highlight');
    if (idx >= 0) { state.items.splice(idx,1); safeSave(state); notify(); renderPanel(); toast('Highlight removed'); return false; }
    add({type:'highlight', ref:ref, color:color||'yellow', note:note||''});
    toast('Highlighted ' + ref);
    return true;
  }
  function toggleBookmark(ref){
    ref = normRef(ref);
    var idx = findIdx(ref, 'bookmark');
    if (idx >= 0) { state.items.splice(idx,1); safeSave(state); notify(); renderPanel(); toast('Bookmark removed'); return false; }
    add({type:'bookmark', ref:ref});
    toast('Bookmarked ' + ref);
    return true;
  }

  function recordRecent(ref, tool){
    ref = normRef(ref); if (!ref) return;
    state.recent = (state.recent||[]).filter(function(x){return x && x.ref !== ref;});
    state.recent.unshift({ ref: ref, tool: tool || 'hub', at: Date.now() });
    if (state.recent.length > 50) state.recent.length = 50;
    safeSave(state); notify();
  }

  /* ---- toast ---- */
  var toastTimer = null;
  function toast(msg){
    var el = document.querySelector('.bsh-toast');
    if (!el) { el = document.createElement('div'); el.className = 'bsh-toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ el.style.display='none'; }, 2200);
  }

  /* ---- panel + FAB ---- */
  var isEmbedded = false;
  try { isEmbedded = new URLSearchParams(location.search).get('embed') === 'split'; } catch(e){}

  var fab = null, panel = null, tab = 'highlight', search = '';

  /* ---------- styles (Builder tokens; overrides hub-modern .bsh-lib-* rules) ---------- */
  (function(){
    var st = document.createElement('style');
    st.id = 'bsh-lib-style';
    st.textContent = `
.bsh-lib-fab{position:fixed;bottom:68px;right:16px;z-index:9997;width:40px;height:40px;border-radius:50%;background:var(--surface);color:var(--ink-2);border:1px solid var(--border);cursor:pointer;box-shadow:var(--shadow-1);display:flex;align-items:center;justify-content:center;font-size:1rem;transition:background 160ms,color 160ms,border-color 160ms,transform 160ms}
.bsh-lib-fab:hover{background:var(--surface-2);color:var(--accent);border-color:var(--accent);transform:translateY(-1px)}
.bsh-lib-fab .bsh-lib-badge{position:absolute;top:-4px;right:-4px;background:var(--ink);color:var(--surface);font-size:.6rem;font-weight:700;border:2px solid var(--surface);border-radius:50%;width:16px;height:16px;min-width:0;display:flex;align-items:center;justify-content:center;text-align:center;font-family:var(--font-sans)}
@media (max-width:620px){.bsh-lib-fab{bottom:58px;right:12px;width:36px;height:36px}}
body.embed-split .bsh-lib-fab{display:none}
.bsh-lib-panel{position:fixed;top:0;right:-460px;width:min(440px,92vw);height:100dvh;z-index:10001;background:var(--surface);border-left:1px solid var(--border);box-shadow:var(--shadow-3);transition:right var(--dur-3) var(--ease);display:flex;flex-direction:column;font-family:var(--font-sans);color:var(--ink)}
.bsh-lib-panel.open{right:0}
.bsh-lib-head{background:var(--surface-2);border-bottom:1px solid var(--border);color:var(--ink);padding:14px 16px;display:flex;align-items:center;gap:10px}
.bsh-lib-head h3{margin:0;font-family:var(--font-serif);font-weight:600;font-size:var(--t-lg);flex:1;color:var(--ink)}
.bsh-lib-head .bsh-lib-close{background:transparent;border:none;color:var(--ink-2);border-radius:var(--r-sm);padding:6px 10px;cursor:pointer;font-size:var(--t-sm);transition:background var(--dur-1)}
.bsh-lib-head .bsh-lib-close:hover{background:var(--surface-3)}
.bsh-lib-tabs{display:flex;padding:12px 14px 0;gap:6px;border-bottom:1px solid var(--border)}
.bsh-lib-tab{padding:8px 12px;border-radius:var(--r-sm) var(--r-sm) 0 0;cursor:pointer;font-size:var(--t-xs);font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);border:1px solid transparent;border-bottom:none;transition:background var(--dur-1),color var(--dur-1)}
.bsh-lib-tab:hover{background:var(--surface-2)}
.bsh-lib-tab.active{color:var(--accent);background:var(--accent-tint);border-color:var(--border)}
.bsh-lib-body{flex:1;overflow-y:auto;padding:14px}
.bsh-lib-item{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:10px 12px;margin-bottom:8px;font-size:var(--t-sm);transition:box-shadow var(--dur-2),border-color var(--dur-2)}
.bsh-lib-item:hover{box-shadow:var(--shadow-1);border-color:var(--border-strong)}
.bsh-lib-item.hl-yellow{border-left:3px solid #e6c46a}
.bsh-lib-item.hl-pink{border-left:3px solid #e0748e}
.bsh-lib-item.hl-green{border-left:3px solid #7cae5f}
.bsh-lib-item.hl-blue{border-left:3px solid #6f9ed1}
.bsh-lib-item .bsh-lib-ref{font-weight:600;color:var(--accent);font-size:var(--t-xs);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;display:flex;align-items:center;gap:6px}
.bsh-lib-item .bsh-lib-ref .bsh-lib-x{margin-left:auto;background:none;border:none;color:var(--ink-3);cursor:pointer;font-size:1.05rem;padding:0 4px;border-radius:var(--r-xs)}
.bsh-lib-item .bsh-lib-ref .bsh-lib-x:hover{background:var(--accent-soft);color:var(--accent)}
.bsh-lib-item .bsh-lib-note{color:var(--ink-3);font-size:var(--t-sm);margin-top:4px;font-style:italic;font-family:var(--font-scripture)}
.bsh-lib-empty{color:var(--ink-3);text-align:center;padding:32px 20px;font-style:italic;font-family:var(--font-scripture)}
.bsh-lib-search{width:100%;padding:9px 12px;margin-bottom:10px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface-2);color:var(--ink);font-family:inherit;transition:box-shadow var(--dur-1)}
.bsh-lib-search:focus{outline:none;box-shadow:var(--focus)}
`;
    document.head.appendChild(st);
  })();

  function mountUI(){
    if (isEmbedded || fab) return;
    if (!document.body) { document.addEventListener('DOMContentLoaded', mountUI); return; }
    fab = document.createElement('button');
    fab.className = 'bsh-lib-fab';
    fab.type = 'button';
    fab.title = 'My Library — highlights & bookmarks';
    fab.innerHTML = '★<span class="bsh-lib-badge" style="display:none">0</span>';
    fab.addEventListener('click', function(){ openPanel(); });
    document.body.appendChild(fab);

    panel = document.createElement('div');
    panel.className = 'bsh-lib-panel';
    panel.innerHTML =
      '<div class="bsh-lib-head"><h3>My Library</h3><button class="bsh-lib-close" type="button">✕</button></div>' +
      '<div class="bsh-lib-tabs">' +
        '<div class="bsh-lib-tab active" data-tab="highlight">✦ Highlights</div>' +
        '<div class="bsh-lib-tab" data-tab="bookmark">❋ Bookmarks</div>' +
        '<div class="bsh-lib-tab" data-tab="recent">◷ Recent</div>' +
      '</div>' +
      '<div class="bsh-lib-body"><input class="bsh-lib-search" placeholder="Filter…" /><div id="bsh-lib-list"></div></div>';
    document.body.appendChild(panel);

    panel.querySelector('.bsh-lib-close').addEventListener('click', closePanel);
    panel.querySelectorAll('.bsh-lib-tab').forEach(function(t){
      t.addEventListener('click', function(){
        tab = t.getAttribute('data-tab');
        panel.querySelectorAll('.bsh-lib-tab').forEach(function(x){ x.classList.toggle('active', x===t); });
        renderPanel();
      });
    });
    panel.querySelector('.bsh-lib-search').addEventListener('input', function(e){ search = e.target.value; renderPanel(); });
    updateBadge();
  }

  function updateBadge(){
    if (!fab) return;
    var n = state.items.length;
    var b = fab.querySelector('.bsh-lib-badge');
    if (n === 0) { b.style.display = 'none'; return; }
    b.style.display = 'inline-block';
    b.textContent = n > 99 ? '99+' : String(n);
  }

  function openPanel(){ if (!panel) mountUI(); if (panel) { panel.classList.add('open'); renderPanel(); } }
  function closePanel(){ if (panel) panel.classList.remove('open'); }

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function itemActionUrl(ref){
    /* Route bookmarks/highlights back to the Study Bible reader. /read/ is
       an absolute path so it works correctly from any page. */
    return '/read/?ref=' + encodeURIComponent(ref);
  }

  function renderPanel(){
    if (!panel) { updateBadge(); return; }
    updateBadge();
    var body = panel.querySelector('#bsh-lib-list');
    var q = (search || '').toLowerCase().trim();
    var items;
    if (tab === 'recent') items = (state.recent||[]).slice(0,50);
    else items = list(tab);
    if (q) items = items.filter(function(x){ return (x.ref||'').toLowerCase().includes(q) || (x.note||'').toLowerCase().includes(q); });
    if (!items.length) {
      body.innerHTML = '<div class="bsh-lib-empty">' + (tab==='highlight'?'No highlights yet. Long-press a verse in the Study Bible, or use ✦ from any tool.':tab==='bookmark'?'No bookmarks yet.':'No recent verses yet.') + '</div>';
      return;
    }
    body.innerHTML = items.map(function(it){
      var when = new Date(it.at).toLocaleDateString(undefined,{month:'short',day:'numeric'});
      if (tab === 'recent') {
        return '<div class="bsh-lib-item"><div class="bsh-lib-ref"><a href="'+itemActionUrl(it.ref)+'" style="color:inherit;text-decoration:none">'+esc(it.ref)+'</a><span style="color:var(--ink-3);font-weight:500;font-size:var(--t-xs);margin-left:auto">'+esc(when)+' · '+esc(it.tool||'')+'</span></div></div>';
      }
      var colorCls = it.type==='highlight' ? ' hl-'+esc(it.color||'yellow') : '';
      return '<div class="bsh-lib-item'+colorCls+'"><div class="bsh-lib-ref">'+
        '<a href="'+itemActionUrl(it.ref)+'" style="color:inherit;text-decoration:none">'+esc(it.ref)+'</a>'+
        '<span style="color:var(--ink-3);font-weight:500;font-size:var(--t-xs);margin-left:8px">'+esc(when)+'</span>'+
        '<button class="bsh-lib-x" data-id="'+esc(it.id)+'" type="button" title="Remove">✕</button>'+
      '</div>'+
      (it.note ? '<div class="bsh-lib-note">'+esc(it.note)+'</div>' : '') +
      '</div>';
    }).join('');
    body.querySelectorAll('.bsh-lib-x').forEach(function(x){ x.addEventListener('click', function(){ remove(x.getAttribute('data-id')); }); });
  }

  mountUI();

  window.BshLibrary = {
    add: add, remove: remove, list: list, has: has,
    toggleHighlight: toggleHighlight, toggleBookmark: toggleBookmark,
    open: openPanel, close: closePanel,
    onChange: onChange,
    recordRecent: recordRecent,
    toast: toast
  };
})();
