/* shortcuts.js — global keyboard shortcuts overlay.
   Press `?` to open a cheatsheet.
*/
(function(){
  if (window.BshShortcuts) return;
  var overlay = null;
  var SHORTCUTS = [
    { keys: ['⌘','K'], keys2:['Ctrl','K'], name:'Quick Jump palette' },
    { keys: ['?'], name:'Show this cheatsheet' },
    { keys: ['⇧','L'], name:'Toggle Library drawer' },
    { keys: ['⇧','P'], name:'Reading Plans' },
    { keys: ['⇧','T'], name:'Explorer' },
    { keys: ['⇧','D'], name:'Toggle dark / light theme' },
    { keys: ['⇧','N'], name:'Toggle Notebook' },
    { keys: ['Esc'], name:'Close any open panel' }
  ];

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  var STYLE = ''
    + '.bsh-sk-overlay{position:fixed;inset:0;background:rgba(20,19,16,.4);z-index:10003;display:none;align-items:center;justify-content:center;padding:16px;font-family:var(--font-sans);animation:bsh-sk-fade var(--dur-2) ease-out}'
    + '.bsh-sk-overlay.open{display:flex}'
    + '@keyframes bsh-sk-fade{from{opacity:0}to{opacity:1}}'
    + '.bsh-sk-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow-3);width:100%;max-width:520px;color:var(--ink);overflow:hidden}'
    + '.bsh-sk-head{background:var(--surface-2);border-bottom:1px solid var(--border);color:var(--ink);padding:14px 20px;display:flex;align-items:center;gap:10px}'
    + '.bsh-sk-head h3{margin:0;font-family:var(--font-serif);font-weight:600;font-size:var(--t-xl);flex:1;color:var(--ink)}'
    + '.bsh-sk-head .x{background:transparent;border:1px solid var(--border);color:var(--ink-2);border-radius:var(--r-sm);padding:5px 10px;cursor:pointer;transition:background var(--dur-1)}'
    + '.bsh-sk-head .x:hover{background:var(--surface-3)}'
    + '.bsh-sk-list{padding:14px 20px 18px}'
    + '.bsh-sk-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)}'
    + '.bsh-sk-row:last-child{border-bottom:none}'
    + '.bsh-sk-row .lbl{flex:1;color:var(--ink);font-size:var(--t-sm)}'
    + '.bsh-sk-row .keys{display:flex;gap:4px}'
    + '.bsh-sk-row kbd{background:var(--surface-3);border:1px solid var(--border);color:var(--ink-3);border-radius:var(--r-xs);padding:2px 8px;font-family:var(--font-mono);font-size:var(--t-xs);font-weight:600;box-shadow:none}';

  function ensureUI(){
    if (overlay) return;
    var st = document.createElement('style'); st.textContent = STYLE; document.head.appendChild(st);
    overlay = document.createElement('div');
    overlay.className = 'bsh-sk-overlay';
    var mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    overlay.innerHTML = '<div class="bsh-sk-card"><div class="bsh-sk-head"><h3>⌨︎ Keyboard Shortcuts</h3><button class="x" type="button">✕</button></div><div class="bsh-sk-list">' +
      SHORTCUTS.map(function(s){
        var k = (mac ? s.keys : (s.keys2||s.keys)).map(function(x){ return '<kbd>'+esc(x)+'</kbd>'; }).join('');
        return '<div class="bsh-sk-row"><div class="lbl">'+esc(s.name)+'</div><div class="keys">'+k+'</div></div>';
      }).join('') + '</div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.x').addEventListener('click', close);
    overlay.addEventListener('click', function(e){ if (e.target === overlay) close(); });
  }

  function open(){ ensureUI(); overlay.classList.add('open'); }
  function close(){ if (overlay) overlay.classList.remove('open'); }

  document.addEventListener('keydown', function(e){
    var tgt = e.target;
    var tag = tgt && tgt.tagName ? tgt.tagName.toLowerCase() : '';
    var typing = tag==='input' || tag==='textarea' || (tgt && tgt.isContentEditable);
    if (typing) return;
    if (e.key === '?') { e.preventDefault(); if (overlay && overlay.classList.contains('open')) close(); else open(); return; }
    if (e.key === 'Escape') { close(); if (window.BshLibrary && window.BshLibrary.close) window.BshLibrary.close(); if (window.BshTopicExplorer && window.BshTopicExplorer.close) window.BshTopicExplorer.close(); if (window.BshPlans && window.BshPlans.close) window.BshPlans.close(); return; }
    if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      var k = e.key.toUpperCase();
      if (k==='L') { e.preventDefault(); if (window.BshLibrary && window.BshLibrary.toggle) window.BshLibrary.toggle(); else if (window.BshLibrary && window.BshLibrary.open) window.BshLibrary.open(); }
      else if (k==='P') { e.preventDefault(); if (window.BshPlans && window.BshPlans.open) window.BshPlans.open(); }
      else if (k==='T') { e.preventDefault(); if (window.BshTopicExplorer && window.BshTopicExplorer.open) window.BshTopicExplorer.open(); }
      else if (k==='D') { e.preventDefault(); if (window.BshTheme && window.BshTheme.cycle) window.BshTheme.cycle(); }
      else if (k==='N') { e.preventDefault(); if (window.BibleNotebook && window.BibleNotebook.toggle) window.BibleNotebook.toggle(); }
    }
  });

  window.BshShortcuts = { open: open, close: close };
})();
