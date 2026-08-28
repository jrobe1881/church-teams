/* ============================================================
   quick-jump.js — global Ctrl/Cmd+K command palette
   Works from every tool page (Study Bible home, hub, atlas, strongs,
   wordstudy, sermon). Jumps to: a scripture reference (opens the
   Study Bible), a Strong's number (opens the lexicon entry), a tool
   (switches pages), or a topic (opens Nave's Topical Bible search in
   the Builder). Pure vanilla JS, no dependencies.
   ============================================================ */
(function () {
  'use strict';
  if (window.QuickJump) return; // already initialized on this page

  // ---- figure out our path prefix ('' at root, '../' inside a tool folder) ----
  var thisScript = document.currentScript;
  var rawSrc = thisScript ? thisScript.getAttribute('src') || '' : 'shared/quick-jump.js';
  var PREFIX = rawSrc.replace(/shared\/quick-jump\.js.*$/, '');

  function nav(path) { window.location.href = PREFIX + path; }

  // ---- Teams visibility gate (mirrors shared/topbar.js's check so the two
  // scripts agree; reuses topbar's cached promise on window when present) ----
  var TEAMS_SITE_ADMIN_ID = '91d864d1-5472-4c9c-9079-ca3f263f3995';
  function teamsGateVisible(){
    if (window.__bshTeamsGateState) return window.__bshTeamsGateState.then(function(s){ return !!(s && s.visible); });
    if (!window.CloudAccount || !window.CloudAccount.ready) return Promise.resolve(false);
    return window.CloudAccount.ready.then(function(){
      var user = window.CloudAccount.getUser ? window.CloudAccount.getUser() : null;
      if (!user) return false;
      if (user.id === TEAMS_SITE_ADMIN_ID) return true;
      var sb = window.CloudAccount.getSupabaseClient ? window.CloudAccount.getSupabaseClient() : null;
      if (!sb) return false;
      return sb.from('bst_members').select('status').eq('user_id', user.id).then(function(res){
        var rows = res.error ? [] : (res.data || []);
        return rows.some(function(m){ return m.status === 'active' || m.status === 'pending'; });
      });
    }).catch(function(){ return false; });
  }
  var teamsVisibleCache = null;
  function visibleToolItems(){
    if (teamsVisibleCache === null) return TOOL_ITEMS.filter(function(t){ return !t.gate; });
    return TOOL_ITEMS.filter(function(t){ return !t.gate || (t.gate === 'teams' && teamsVisibleCache); });
  }
  teamsGateVisible().then(function(v){ teamsVisibleCache = v; });

  // ---- book alias table (built from META, loaded lazily if needed) ----
  var bookAliases = null;
  var EXTRA_ALIASES = {
    psalm: 'PSA', psalms: 'PSA', ps: 'PSA',
    song: 'SNG', canticles: 'SNG', sos: 'SNG', songofsongs: 'SNG', songofsolomon: 'SNG',
    '1kgs': '1KI', '2kgs': '2KI', '1chr': '1CH', '2chr': '2CH',
    '1sam': '1SA', '2sam': '2SA', '1tim': '1TI', '2tim': '2TI',
    '1thess': '1TH', '2thess': '2TH', '1cor': '1CO', '2cor': '2CO',
    '1pet': '1PE', '2pet': '2PE', '1john': '1JO', '2john': '2JO', '3john': '3JO'
  };
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, '').replace(/\./g, ''); }
  // META is declared with `const` by strongs/meta.js, which does NOT attach a
  // window.META property (only `var` globals do) — reference the bare
  // identifier via a scoped getter, guarded against ReferenceError when the
  // script hasn't been loaded on this page at all.
  function getMETA() {
    try { return (typeof META !== 'undefined') ? META : (window.META || undefined); }
    catch (e) { return window.META || undefined; }
  }
  function buildAliases() {
    var M = getMETA();
    if (bookAliases || !M || !M.books) return;
    var m = {};
    M.books.forEach(function (b) {
      m[norm(b.name)] = b.id;
      m[norm(b.abbr)] = b.id;
      var roman = b.name.replace(/^1 /, 'I ').replace(/^2 /, 'II ').replace(/^3 /, 'III ');
      m[norm(roman)] = b.id;
    });
    Object.keys(EXTRA_ALIASES).forEach(function (k) { m[k] = EXTRA_ALIASES[k]; });
    bookAliases = m;
  }
  function ensureMeta(cb) {
    var M = getMETA();
    if (M && M.books) { buildAliases(); cb(); return; }
    var s = document.createElement('script');
    s.src = PREFIX + 'strongs/meta.js';
    s.onload = function () { buildAliases(); cb(); };
    s.onerror = cb;
    document.head.appendChild(s);
  }

  function bookNameFor(id) {
    var M = getMETA();
    if (!M) return id;
    var b = M.books.filter(function (x) { return x.id === id; })[0];
    return b ? b.name : id;
  }

  function tryParseRef(str) {
    if (!bookAliases) return null;
    str = str.trim();
    var m = str.match(/^(.*?)\s+(\d[\d:,.\-\s]*)$/i);
    var bookPart, spec = '';
    if (m) { bookPart = m[1]; spec = m[2].trim(); } else { bookPart = str; }
    var id = bookAliases[norm(bookPart)];
    if (!id) return null;
    return { id: id, spec: spec, bookName: bookNameFor(id) };
  }

  // ---- static tool-switch / notebook entries (kept tight) ----
  var TOOL_ITEMS = [
    { icon: '⌂', title: 'Reader', kind: 'tool', run: function () { nav('read/index.html'); } },
    { icon: '✦', title: 'Builder', kind: 'tool', run: function () { nav('builder/index.html'); } },
    { icon: '§', title: "Strong's", kind: 'tool', run: function () { nav('strongs/index.html'); } },
    { icon: '✎', title: 'Lexicon', kind: 'tool', run: function () { nav('wordstudy/index.html'); } },
    { icon: '◈', title: 'Atlas', kind: 'tool', run: function () { nav('atlas/index.html'); } },
    { icon: '◉', title: 'Connect', kind: 'tool', run: function () { nav('connect/index.html'); } },
    { icon: '❖', title: 'Teams', kind: 'tool', gate: 'teams', run: function () { nav('teams/index.html'); } }
  ];
  var STATIC_ITEMS = [
    { icon: '⌕', title: 'Explorer', sub: 'Open overlay', kind: 'action', run: function () {
        close(); if (window.BshExplorerOverlay && window.BshExplorerOverlay.open) window.BshExplorerOverlay.open();
      } },
    { icon: '★', title: 'Library', sub: 'Highlights & bookmarks', kind: 'action', run: function () {
        close(); if (window.BshLibrary && window.BshLibrary.open) window.BshLibrary.open();
      } },
    { icon: '▢', title: 'Notebook', sub: 'Cross-tool notes', kind: 'action', run: function () {
        close(); if (window.BibleNotebook && window.BibleNotebook.toggle) window.BibleNotebook.toggle();
      } }
  ];

  // ---- build modal DOM ----
  var root = document.createElement('div');
  root.innerHTML =
    '<div class="qjm-overlay" id="qjmOverlay">' +
      '<div class="qjm-panel" role="dialog" aria-modal="true" aria-label="Search">' +
        '<div class="qjm-tabs" role="tablist" aria-label="Search mode">' +
          '<button class="qjm-tab active" id="qjmTabJump" role="tab" aria-selected="true" type="button">Jump</button>' +
          '<button class="qjm-tab" id="qjmTabAsk" role="tab" aria-selected="false" type="button">Ask</button>' +
        '</div>' +
        '<div class="qjm-inputrow">' +
          '<div class="qjm-ic-wrap"><span class="qjm-ic">⌕</span></div>' +
          '<input class="qjm-input" id="qjmInput" type="text" autocomplete="off" spellcheck="false" placeholder="Jump to a verse, Strong\u2019s number, or topic\u2026" />' +
          '<kbd class="qjm-esc">Esc</kbd>' +
        '</div>' +
        '<div class="qjm-tools" id="qjmTools"></div>' +
        '<div class="qjm-list" id="qjmList"></div>' +
        '<div class="qjm-answer" id="qjmAnswer" aria-live="polite" hidden></div>' +
        '<div class="qjm-foot">' +
          '<span><kbd>\u21b5</kbd> Open</span>' +
          '<span><kbd>\u2318K</kbd> Toggle</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  var style = document.createElement('style');
  style.textContent =
    '.qjm-overlay{position:fixed;inset:0;background:rgba(20,19,16,.4);z-index:10000;display:none;align-items:center;justify-content:center;padding:16px;font-family:var(--font-sans)}' +
    '.qjm-overlay.open{display:flex;animation:qjmFade var(--dur-2) ease}' +
    '@keyframes qjmFade{from{opacity:0}to{opacity:1}}' +
    '.qjm-panel{width:min(560px,calc(100vw - 32px));max-height:min(72vh,640px);background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow-3);overflow:hidden;display:flex;flex-direction:column;position:relative;animation:qjmPop var(--dur-2) var(--ease)}' +
    '@keyframes qjmPop{from{transform:scale(.96);opacity:0}to{transform:none;opacity:1}}' +
    '.qjm-inputrow{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--border);flex-shrink:0}' +
    '.qjm-ic-wrap{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:var(--r-md);background:var(--surface-2);flex-shrink:0}' +
    '.qjm-ic{font-size:1.05rem;opacity:.85}' +
    '.qjm-input{flex:1;min-width:0;border:none;outline:none;background:transparent;font-size:var(--t-lg);font-weight:500;color:var(--ink);font-family:var(--font-sans);letter-spacing:.01em}' +
    '.qjm-inputrow:focus-within{box-shadow:var(--focus);border-radius:var(--r-md)}' +
    '.qjm-input::placeholder{color:var(--ink-muted);opacity:1;font-weight:400}' +
    '.qjm-esc{flex-shrink:0;font-size:var(--t-xs);font-weight:600;color:var(--ink-3);border:none;background:var(--surface-3);border-radius:var(--r-xs);padding:3px 8px;font-family:var(--font-mono)}' +
    '.qjm-tabs{display:flex;gap:2px;padding:8px 12px 0;border-bottom:1px solid var(--border);background:var(--surface-2);flex-shrink:0}'+
    '.qjm-tab{padding:8px 16px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--ink-3);font-family:var(--font-sans);font-size:var(--t-sm);font-weight:600;letter-spacing:.02em;cursor:pointer;margin-bottom:-1px;transition:color var(--dur-1),border-color var(--dur-1)}'+
    '.qjm-tab:hover{color:var(--ink)}'+
    '.qjm-tab.active{color:var(--accent);border-bottom-color:var(--accent)}'+
    '.qjm-tools{display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid var(--border);background:var(--surface-2)}'+
    '.qjm-tool{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border-radius:var(--r-sm);cursor:pointer;font-size:.66rem;font-weight:500;color:var(--ink-3);letter-spacing:.02em;border:1px solid transparent;transition:background var(--dur-1),color var(--dur-1),border-color var(--dur-1)}'+
    '.qjm-tool:hover{background:var(--surface);color:var(--accent);border-color:var(--border)}'+
    '.qjm-tool .ic{font-size:1.1rem;line-height:1;color:var(--ink-2);transition:color var(--dur-1)}'+
    '.qjm-tool:hover .ic{color:var(--accent)}'+
    '.qjm-list{overflow-y:auto;padding:6px 8px;scrollbar-width:thin;max-height:280px}' +
    '.qjm-list::-webkit-scrollbar{width:6px}' +
    '.qjm-list::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:6px}' +
    '.qjm-item{display:flex;align-items:center;gap:11px;padding:8px 10px;margin:1px 0;border-radius:var(--r-sm);cursor:pointer;position:relative;border-left:3px solid transparent;transition:background var(--dur-1),border-color var(--dur-1)}' +
    '.qjm-item.sel{background:var(--accent-tint);border-left-color:var(--accent)}' +
    '.qjm-item:hover{background:var(--surface-2)}' +
    '.qjm-item .qji-ic{font-size:1rem;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:var(--r-sm);background:var(--surface-2);border:1px solid var(--border);color:var(--ink-2);flex-shrink:0;transition:color var(--dur-1),border-color var(--dur-1)}' +
    '.qjm-item.sel .qji-ic,.qjm-item:hover .qji-ic{color:var(--accent);border-color:var(--accent)}' +
    '.qjm-item .qji-txt{min-width:0;flex:1}' +
    '.qjm-item .qji-title{font-weight:600;color:var(--ink);font-size:var(--t-md);line-height:1.3;letter-spacing:-.005em;font-family:var(--font-sans)}' +
    '.qjm-item .qji-sub{font-size:var(--t-sm);color:var(--ink-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.qjm-item .qji-go{font-size:var(--t-xs);font-weight:700;color:var(--accent);opacity:0;flex-shrink:0;background:var(--accent-tint);border-radius:var(--r-xs);padding:3px 7px;transition:opacity var(--dur-1)}' +
    '.qjm-item.sel .qji-go{opacity:1}' +
    '.qjm-empty{padding:26px 14px;text-align:center;color:var(--ink-3);font-size:var(--t-sm)}' +
    /* --- Ask-mode answer pane --- */
    '.qjm-answer{overflow-y:auto;padding:14px 18px 18px;font-family:var(--font-serif);color:var(--ink);font-size:var(--t-md);line-height:1.55;max-height:340px;min-height:60px;scrollbar-width:thin}'+
    '.qjm-answer::-webkit-scrollbar{width:6px}'+
    '.qjm-answer::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:6px}'+
    '.qjm-answer p{margin:0 0 .75em}'+
    '.qjm-answer p:last-child{margin-bottom:0}'+
    '.qjm-answer .qjm-ans-hint{font-family:var(--font-sans);font-size:var(--t-sm);color:var(--ink-3);letter-spacing:.01em}'+
    '.qjm-answer .qjm-ans-err{color:#a33;font-family:var(--font-sans);font-size:var(--t-sm)}'+
    '.qjm-answer .qjm-ans-cursor{display:inline-block;width:.55em;height:1em;vertical-align:-2px;background:var(--accent);margin-left:2px;animation:qjmBlink 1s steps(2,start) infinite;opacity:.7}'+
    '@keyframes qjmBlink{to{visibility:hidden}}'+
    '.qjm-answer a.qjm-ref{color:var(--accent);text-decoration:none;border-bottom:1px dashed var(--accent);font-weight:600;font-family:var(--font-sans);font-size:.94em;padding:0 2px;border-radius:2px}'+
    '.qjm-answer a.qjm-ref:hover{background:var(--accent-tint)}'+
    /* Shared Ask AI conversation view */
    '.qjm-convo{border-left:2px solid var(--border);padding-left:10px;margin-bottom:12px}'+
    '.qjm-convo-hd{display:flex;justify-content:space-between;align-items:center;gap:8px;font-family:var(--font-sans);font-size:var(--t-xs);color:var(--ink-3);font-weight:600;letter-spacing:.03em;text-transform:uppercase;margin-bottom:8px}'+
    '.qjm-convo-clear{border:1px solid var(--border);background:var(--surface);color:var(--ink-2);border-radius:var(--r-xs);padding:2px 8px;font-size:var(--t-xs);font-weight:600;cursor:pointer;font-family:var(--font-sans);text-transform:none;letter-spacing:0}'+
    '.qjm-convo-clear:hover{background:var(--surface-3)}'+
    '.qjm-turn{margin-bottom:10px}'+
    '.qjm-turn:last-child{margin-bottom:0}'+
    '.qjm-tq{font-family:var(--font-sans);font-size:var(--t-sm);font-weight:600;color:var(--ink-2);margin-bottom:4px}'+
    '.qjm-ta{font-family:var(--font-serif);font-size:.95em;color:var(--ink);line-height:1.55}'+
    '.qjm-live{margin-top:4px}'+
    '.qjm-live .qjm-tq{color:var(--accent)}'+
    '.qjm-foot{display:flex;gap:14px;padding:10px 18px;border-top:1px solid var(--border);font-size:var(--t-xs);color:var(--ink-3);flex-shrink:0;background:var(--surface-2)}' +
    '.qjm-foot span{display:flex;align-items:center;gap:4px}' +
    '.qjm-foot kbd{background:var(--surface-3);color:var(--ink-3);border:none;border-radius:var(--r-xs);padding:2px 6px;font-family:var(--font-mono);font-weight:600}' +
    '.qjm-trigger-btn{cursor:pointer}' +
    '@media(max-width:640px){.qjm-foot span:nth-child(1){display:none}}';
  document.head.appendChild(style);
  document.body.appendChild(root);

  var overlay = document.getElementById('qjmOverlay');
  var input = document.getElementById('qjmInput');
  var list = document.getElementById('qjmList');
  var answerEl = document.getElementById('qjmAnswer');
  var toolsEl = document.getElementById('qjmTools');
  var mode = 'jump';           // 'jump' | 'ask'
  var askCtl = null;           // AbortController for the current /api/ask stream
  var askBuffer = '';          // running text from the model
  var askQuestion = '';        // question that produced askBuffer
  var results = [];
  var selIdx = 0;

  /* ---- Shared, cloud-synced Ask AI conversation state ----
     Same key + same CloudAccount binding as explorer-overlay.js and
     explorer/index.html, so a chat started anywhere shows up here. */
  var CONVO_KEY = 'bshai_convo_v1';
  var _convo = [];         // [{q, a}]
  var _convoMessages = []; // OpenAI-style history (kept in sync with _convo)
  var _convoSync = null;

  function _readConvoRaw(key){
    try {
      var s = localStorage.getItem(key); if (!s) return null;
      var j = JSON.parse(s); if (!j) return null;
      if (Array.isArray(j.convo) && Array.isArray(j.messages)) return j;
      return null;
    } catch(_e){ return null; }
  }
  function loadConvo(){
    var j = _readConvoRaw(CONVO_KEY);
    if (!j){
      var a = _readConvoRaw('bsheov_convo_v2');
      var b = _readConvoRaw('explorer_convo_v2');
      var pick = null;
      if (a && b) pick = (a.convo.length >= b.convo.length) ? a : b;
      else pick = a || b;
      if (pick){
        j = pick;
        try { localStorage.setItem(CONVO_KEY, JSON.stringify(j)); } catch(_e){}
      }
    }
    if (j){ _convo = j.convo.slice(-6); _convoMessages = j.messages.slice(-24); }
    else { _convo = []; _convoMessages = []; }
  }
  function saveConvo(){
    try { localStorage.setItem(CONVO_KEY, JSON.stringify({convo:_convo.slice(-6), messages:_convoMessages.slice(-24), ts:Date.now()})); } catch(_e){}
    if (_convoSync) _convoSync.notifyLocalChange();
  }
  function clearConvo(){
    _convo = []; _convoMessages = [];
    try { localStorage.removeItem(CONVO_KEY); } catch(_e){}
    if (_convoSync) _convoSync.notifyLocalChange();
  }
  loadConvo();

  function bindConvoSync(){
    if (_convoSync) return;
    if (!(window.CloudAccount && window.CloudAccount.bindSync)) return;
    _convoSync = window.CloudAccount.bindSync('ask_ai_chat', {
      getLocal: function(){ return { convo:_convo.slice(-6), messages:_convoMessages.slice(-24), ts:Date.now() }; },
      setLocal: function(v){
        try {
          if (v && Array.isArray(v.convo) && Array.isArray(v.messages)){
            localStorage.setItem(CONVO_KEY, JSON.stringify(v));
          } else {
            localStorage.removeItem(CONVO_KEY);
          }
        } catch(_e){}
      },
      emptyValue: { convo: [], messages: [], ts: 0 },
      onRemoteUpdate: function(){
        loadConvo();
        // If the Ask panel is currently visible, refresh the transcript view.
        if (mode === 'ask' && overlay.classList.contains('open')) renderAskPanel();
      }
    });
  }
  // Wait until CloudAccount is present + ready, then bind.
  function whenAccountReady(cb){
    if (window.CloudAccount && window.CloudAccount.ready){
      window.CloudAccount.ready.then(cb).catch(function(){ cb(); });
    } else {
      // Retry a few times for late-loading account.js.
      var tries = 0;
      var t = setInterval(function(){
        tries++;
        if (window.CloudAccount && window.CloudAccount.ready){
          clearInterval(t);
          window.CloudAccount.ready.then(cb).catch(function(){ cb(); });
        } else if (tries > 20){
          clearInterval(t); cb();
        }
      }, 250);
    }
  }
  whenAccountReady(function(){ bindConvoSync(); loadConvo(); if (mode === 'ask' && overlay.classList.contains('open')) renderAskPanel(); });

  // Cross-tab live sync: if another tab writes the shared key, pick it up.
  window.addEventListener('storage', function(e){
    if (e.key !== CONVO_KEY) return;
    loadConvo();
    if (mode === 'ask' && overlay.classList.contains('open')) renderAskPanel();
  });

  // ---- Book-name index for linkifying scripture refs in AI answers ----
  // Includes canonical KJV names + common abbreviations (with and without a
  // trailing period). Order is longest-first so "1 Corinthians" wins over
  // "1 Cor" when both would match.
  var BOOK_NAMES = (
    'Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|'+
    '1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|'+
    'Nehemiah|Esther|Job|Psalms|Psalm|Proverbs|Ecclesiastes|Song of Solomon|'+
    'Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|'+
    'Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|'+
    'Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|'+
    'Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|'+
    '1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|'+
    '1 John|2 John|3 John|Jude|Revelation|'+
    // Common abbreviations
    'Gen|Exo|Exod|Lev|Num|Deut|Deu|Josh|Jos|Judg|Jdg|Rth|'+
    '1 Sam|2 Sam|1 Kgs|2 Kgs|1 Chr|2 Chr|Neh|Est|'+
    'Ps|Prov|Pro|Prv|Eccl|Ecc|Song|SS|Isa|Jer|Lam|Ezek|Eze|Dan|Hos|Obad|Oba|Jon|'+
    'Mic|Nah|Hab|Zeph|Zep|Hag|Zech|Zec|Mal|'+
    'Matt|Mat|Mrk|Mk|Lk|Jn|Rom|1 Cor|2 Cor|Gal|Eph|Phil|Php|Col|'+
    '1 Thess|2 Thess|1 Thes|2 Thes|1 Tim|2 Tim|Tit|Phlm|Phm|Heb|Jas|'+
    '1 Pet|2 Pet|1 Pt|2 Pt|1 Jn|2 Jn|3 Jn|Jud|Rev|Rv'
  ).split('|').sort(function(a,b){ return b.length - a.length; });
  // Escape for regex + allow an optional trailing period on abbreviations.
  var BOOK_ALT = BOOK_NAMES.map(function(b){
    return b.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'\\s+') + '\\.?';
  }).join('|');
  // Match: (Book) 1(:2(-3)?)?, allowing trailing verse ranges/commas simply.
  var REF_RE = new RegExp('\\b(' + BOOK_ALT + ')\\s+(\\d{1,3})(?::(\\d{1,3})(?:-(\\d{1,3}))?)?\\b','g');

  function linkifyRefs(safeHtml){
    // Replace scripture refs in already-escaped HTML with reader links.
    // Use an ABSOLUTE-rooted href (starts with '/') so it works from any
    // subpath — e.g. /connect/g/<slug>/ resolving 'read/?ref=...' as a
    // relative path would produce /connect/g/<slug>/read/?ref=... (404).
    return safeHtml.replace(REF_RE, function(match, book, ch, vs, vs2){
      var ref = book.replace(/\s+/g,' ').trim();
      ref = ref.replace(/\.$/, ''); // drop trailing period on abbreviation
      ref += ' ' + ch;
      if (vs) ref += ':' + vs + (vs2 ? '-' + vs2 : '');
      var href = '/read/?ref=' + encodeURIComponent(ref);
      return '<a class="qjm-ref" href="' + href + '" data-ref="' + escHtml(ref) + '">' + escHtml(match) + '</a>';
    });
  }

  function paragraphize(text, opts){
    opts = opts || {};
    var paras = String(text||'').split(/\n{2,}/).map(function(p){
      return '<p>' + linkifyRefs(escHtml(p)).replace(/\n/g,'<br>') + '</p>';
    }).join('');
    var cursor = opts.streaming ? '<span class="qjm-ans-cursor"></span>' : '';
    if (cursor){ paras = paras.replace(/<\/p>$/, cursor + '</p>'); }
    return paras;
  }

  function renderAskPanel(opts){
    // Renders prior turns (compact) + the current in-flight/completed answer.
    opts = opts || {};
    if (!answerEl) return;
    var priorHtml = '';
    if (_convo.length){
      priorHtml =
        '<div class="qjm-convo">' +
          '<div class="qjm-convo-hd">' +
            '<span>Earlier in this conversation \u00b7 ' + _convo.length + ' turn' + (_convo.length===1?'':'s') + '</span>' +
            '<button type="button" class="qjm-convo-clear" id="qjmClearConvo">New chat</button>' +
          '</div>' +
          _convo.map(function(t){
            return '<div class="qjm-turn">' +
                     '<div class="qjm-tq">' + escHtml(t.q) + '</div>' +
                     '<div class="qjm-ta">' + linkifyRefs(escHtml(t.a)).replace(/\n{2,}/g,'<br><br>').replace(/\n/g,'<br>') + '</div>' +
                   '</div>';
          }).join('') +
        '</div>';
    }
    var liveHtml = '';
    if (opts.thinking){
      liveHtml = '<div class="qjm-live"><div class="qjm-tq">' + escHtml(askQuestion||'') + '</div><div class="qjm-ta"><span class="qjm-ans-hint">Thinking\u2026</span></div></div>';
    } else if (opts.error){
      liveHtml = '<div class="qjm-live"><div class="qjm-ta"><span class="qjm-ans-err">' + escHtml(opts.error) + '</span></div></div>';
    } else if (askBuffer){
      liveHtml = '<div class="qjm-live"><div class="qjm-tq">' + escHtml(askQuestion||'') + '</div><div class="qjm-ta">' + paragraphize(askBuffer, {streaming: !!opts.streaming}) + '</div></div>';
    } else if (!_convo.length){
      liveHtml = '<span class="qjm-ans-hint">Type a question and press Enter. Answers cite KJV scripture \u2014 tap a reference to open it in the Reader.</span>';
    }
    answerEl.innerHTML = priorHtml + liveHtml;
    // Autoscroll to the live tail so the streaming answer stays visible.
    if (opts.streaming || opts.thinking) answerEl.scrollTop = answerEl.scrollHeight;
    // Wire New-chat button.
    var nb = document.getElementById('qjmClearConvo');
    if (nb) nb.addEventListener('click', function(){
      clearConvo();
      askBuffer = ''; askQuestion = '';
      renderAskPanel();
    });
  }

  function askStreamStart(question){
    // Abort any prior stream.
    if (askCtl){ try { askCtl.abort(); } catch(_e){} askCtl = null; }
    askBuffer = '';
    askQuestion = question;
    renderAskPanel({thinking:true});
    askCtl = new AbortController();
    // Fold prior turns into the question as light context so /api/ask/ keeps
    // continuity even though the endpoint is single-shot.
    var priorCtx = '';
    if (_convo.length){
      priorCtx = 'Prior conversation between the user and you:\n' +
        _convo.map(function(t){ return 'User: ' + t.q + '\nAssistant: ' + t.a; }).join('\n\n') +
        '\n\nCurrent question: ' + question;
    }
    fetch('/api/ask/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept':'text/event-stream' },
      body: JSON.stringify({ question: priorCtx || question, verses: [] }),
      signal: askCtl.signal
    }).then(function(res){
      if (!res.ok || !res.body){
        renderAskPanel({error: 'Sorry \u2014 the AI service is unavailable (HTTP '+res.status+').'});
        return;
      }
      var reader = res.body.getReader();
      var dec = new TextDecoder();
      var carry = '';
      function pump(){
        return reader.read().then(function(chunk){
          if (chunk.done){
            renderAskPanel({streaming:false});
            // Persist the completed turn into the shared, cloud-synced store.
            if (askBuffer && askQuestion){
              _convo.push({ q: askQuestion, a: askBuffer });
              if (_convo.length > 6) _convo = _convo.slice(-6);
              _convoMessages.push({ role: 'user', content: askQuestion });
              _convoMessages.push({ role: 'assistant', content: askBuffer });
              if (_convoMessages.length > 24) _convoMessages = _convoMessages.slice(-24);
              saveConvo();
              // Re-render so the just-finished turn appears as a prior turn
              // next time the panel is opened (also resets the live area).
              askBuffer = ''; askQuestion = '';
              renderAskPanel();
            }
            return;
          }
          carry += dec.decode(chunk.value, {stream:true});
          var lines = carry.split(/\n/);
          carry = lines.pop();
          for (var i=0;i<lines.length;i++){
            var line = lines[i];
            if (!line || line.startsWith('event:')) continue;
            if (!line.startsWith('data:')) continue;
            var payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              var j = JSON.parse(payload);
              if (j.error){
                renderAskPanel({error: j.error + (j.detail ? ' \u2014 ' + j.detail : '')});
                continue;
              }
              if (typeof j.delta === 'string'){
                askBuffer += j.delta;
                renderAskPanel({streaming:true});
              }
            } catch(_e){}
          }
          return pump();
        });
      }
      return pump();
    }).catch(function(err){
      if (err && err.name === 'AbortError') return;
      renderAskPanel({error: 'Sorry \u2014 could not reach the AI service.'});
    });
  }

  // Delegated click on scripture refs: close the palette so the reader isn't
  // hidden behind the overlay. The <a href> handles navigation itself.
  answerEl.addEventListener('click', function(e){
    var a = e.target && e.target.closest && e.target.closest('a.qjm-ref');
    if (a){ close(); }
  });

  function setMode(next){
    mode = next;
    var isAsk = (next === 'ask');
    // Toggle tab active state
    var tj = document.getElementById('qjmTabJump');
    var ta = document.getElementById('qjmTabAsk');
    if (tj){ tj.classList.toggle('active', !isAsk); tj.setAttribute('aria-selected', !isAsk); }
    if (ta){ ta.classList.toggle('active', isAsk); ta.setAttribute('aria-selected', isAsk); }
    // Toggle panels
    if (toolsEl) toolsEl.hidden = isAsk;
    if (list) list.hidden = isAsk;
    if (answerEl) answerEl.hidden = !isAsk;
    // Placeholder swap
    input.placeholder = isAsk
      ? 'Ask the AI a Bible question\u2026 (e.g. "Why baptize in Jesus\u2019 name?")'
      : 'Jump to a verse, Strong\u2019s number, or topic\u2026';
    // Reset content when switching
    if (isAsk){
      askBuffer = ''; askQuestion = '';
      if (askCtl){ try{askCtl.abort();}catch(_e){} askCtl=null; }
      // Pull the latest shared history (in case another surface added turns).
      loadConvo();
      renderAskPanel();
    }
    input.value = '';
    setTimeout(function(){ input.focus(); }, 10);
  }

  function fuzzyMatch(items, q) {
    var ql = q.toLowerCase();
    return items.filter(function (it) { return it.title.toLowerCase().indexOf(ql) >= 0; });
  }

  function computeResults(qRaw) {
    var q = qRaw.trim();
    if (!q) {
      var recent = (window.BshLibrary && window.BshLibrary.list) ? (window.BshLibrary.list('recent')||[]).slice(0,3) : [];
      var recentItems = recent.map(function(r){ return { icon:'◷', title: r.ref, sub:'Recently opened', run:function(){ nav('read/?ref='+encodeURIComponent(r.ref)); } }; });
      return recentItems.concat(STATIC_ITEMS).slice(0,6);
    }
    var out = [];
    var ghm = q.match(/^([GgHh])[\s-]?(\d{1,4})$/);
    if (ghm) {
      var num = ghm[1].toUpperCase() + parseInt(ghm[2], 10);
      out.push({ icon: '§', title: "Strong's " + num, sub: 'Open in the Greek & Hebrew lexicon', run: function () { nav('strongs/index.html?s=' + num); } });
    }
    var ref = tryParseRef(q);
    if (ref) {
      out.push({ icon: '⌂', title: 'Open ' + q + ' in the Study Bible', sub: ref.bookName + (ref.spec ? ' ' + ref.spec : ' (chapter 1)'), run: function () { nav('read/?ref=' + encodeURIComponent(q)); } });
    }
    // Match against both static actions (Explorer, Library, Notebook) and
    // the tool-switch tiles (Reader, Builder, Strong's, Lexicon, Atlas,
    // Connect) so typing a tool name jumps you there.
    out = out.concat(fuzzyMatch(STATIC_ITEMS, q));
    out = out.concat(fuzzyMatch(visibleToolItems(), q).map(function(t){ return { icon: t.icon, title: t.title, sub: 'Open the ' + t.title + ' tool', run: t.run }; }));
    // Extra keyword aliases for Bible Connect
    var qql = q.toLowerCase();
    if (/^(group|groups|church|churches|congregation|chat|announce|announcement|community|fellowship)/.test(qql)) {
      out.push({ icon: '◉', title: 'Bible Connect', sub: 'Find or create a group', run: function(){ nav('connect/index.html'); } });
    }
    // Extra keyword aliases for Teams (only surfaced when gate resolves visible)
    if (teamsVisibleCache && /^teams?/i.test(qql) || (teamsVisibleCache && /church.*(team|study|leader)/i.test(qql))) {
      out.push({ icon: '❖', title: 'Teams', sub: 'Church studies, follow-ups, and baptisms', run: function(){ nav('teams/index.html'); } });
    }
    out.push({ icon: '✎', title: 'Search topic \u201c' + q + '\u201d', sub: "Search Nave's Topical Bible in the Builder", run: function () { nav('builder/index.html#topic=' + encodeURIComponent(q)); } });
    return out.slice(0, 8);
  }

  function render() {
    if (!results.length) { list.innerHTML = '<div class="qjm-empty">No matches — press Enter to search anyway.</div>'; return; }
    list.innerHTML = results.map(function (it, i) {
      return '<div class="qjm-item' + (i === selIdx ? ' sel' : '') + '" data-i="' + i + '">' +
        '<div class="qji-ic">' + it.icon + '</div>' +
        '<div class="qji-txt"><div class="qji-title">' + escHtml(it.title) + '</div><div class="qji-sub">' + escHtml(it.sub) + '</div></div>' +
        '<div class="qji-go">\u21b5 Open</div>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('.qjm-item'), function (el) {
      el.addEventListener('click', function () { runIdx(parseInt(el.dataset.i, 10)); });
    });
  }
  function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  function runIdx(i) {
    var it = results[i];
    if (!it) return;
    it.run();
  }

  function refresh() {
    results = computeResults(input.value);
    selIdx = 0;
    render();
  }

  function renderTools(){
    var host = document.getElementById('qjmTools');
    if (!host) return;
    var items = visibleToolItems();
    host.innerHTML = items.map(function(t,i){ return '<div class="qjm-tool" data-t="'+i+'"><span class="ic">'+t.icon+'</span><span>'+escHtml(t.title)+'</span></div>'; }).join('');
    Array.prototype.forEach.call(host.querySelectorAll('.qjm-tool'), function(el){
      el.addEventListener('click', function(){ items[+el.dataset.t].run(); });
    });
    if (teamsVisibleCache === null) {
      teamsGateVisible().then(function(v){ teamsVisibleCache = v; renderTools(); });
    }
  }

  function open() {
    ensureMeta(function () {
      overlay.classList.add('open');
      input.value = '';
      // Always open on Jump mode.
      mode = 'jump';
      var tj = document.getElementById('qjmTabJump');
      var ta = document.getElementById('qjmTabAsk');
      if (tj){ tj.classList.add('active'); tj.setAttribute('aria-selected', true); }
      if (ta){ ta.classList.remove('active'); ta.setAttribute('aria-selected', false); }
      if (toolsEl) toolsEl.hidden = false;
      if (list)     list.hidden = false;
      if (answerEl) answerEl.hidden = true;
      input.placeholder = 'Jump to a verse, Strong\u2019s number, or topic\u2026';
      results = computeResults('');
      selIdx = 0;
      renderTools();
      render();
      setTimeout(function () { input.focus(); }, 10);
    });
  }
  function close() {
    overlay.classList.remove('open');
    if (askCtl){ try{askCtl.abort();}catch(_e){} askCtl=null; }
  }

  // Tabs: Jump keeps the existing browse-to-a-verse behavior. Ask runs an
  // in-panel AI Q&A against /api/ask so users don't lose their place by
  // navigating away to the Explorer page.
  var tabJump = document.getElementById('qjmTabJump');
  var tabAsk  = document.getElementById('qjmTabAsk');
  if (tabAsk)  tabAsk.addEventListener('click', function(){ setMode('ask'); });
  if (tabJump) tabJump.addEventListener('click', function(){ setMode('jump'); });

  input.addEventListener('input', function(){
    // In Ask mode the input is just a question buffer \u2014 don't run jump search.
    if (mode === 'ask') return;
    refresh();
  });
  input.addEventListener('keydown', function (e) {
    if (mode === 'ask') {
      if (e.key === 'Enter') {
        e.preventDefault();
        var q = input.value.trim();
        if (q) askStreamStart(q);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // First Escape cancels a running stream; second closes the palette.
        if (askCtl){ try{askCtl.abort();}catch(_e){} askCtl=null;
          answerEl.innerHTML = '<span class="qjm-ans-hint">Cancelled. Press Esc again to close.</span>';
        } else {
          close();
        }
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); selIdx = Math.min(selIdx + 1, results.length - 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selIdx = Math.max(selIdx - 1, 0); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); runIdx(selIdx); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });

  document.addEventListener('keydown', function (e) {
    var k = e.key ? e.key.toLowerCase() : '';
    if ((e.metaKey || e.ctrlKey) && k === 'k') {
      e.preventDefault();
      if (overlay.classList.contains('open')) close(); else open();
    }
  });

  // preload META in the background so the first keystroke is instant
  ensureMeta(function () {});

  window.QuickJump = { open: open, close: close };

  // ---- Left-side floating quick-jump FAB (mirrors the right-side FAB stack) ----
  // Injects a compact circular button at bottom-left on every page so people
  // always have a discoverable entry point to search / jump. The topbar
  // center-slot magnifier is hidden on mobile via CSS — this FAB replaces it.
  function mountQjFab(){
    if (document.getElementById('bpQjFab')) return;
    // Some special surfaces don't want the FAB (chat overlays, embed splits).
    if (document.body && document.body.classList.contains('embed-split')) return;
    var st = document.getElementById('bp-qj-fab-style');
    if (!st){
      st = document.createElement('style');
      st.id = 'bp-qj-fab-style';
      st.textContent = ''
        + '.bp-qj-fab{position:fixed;left:16px;bottom:16px;z-index:9997;'
        +   'width:44px;height:44px;border-radius:50%;background:var(--surface,#fff);'
        +   'color:var(--ink-2,#4a4238);border:1px solid var(--border,#e5e0d8);cursor:pointer;'
        +   'box-shadow:var(--shadow-2,0 6px 20px rgba(20,17,15,.12));display:flex;'
        +   'align-items:center;justify-content:center;font-size:1.3rem;line-height:1;'
        +   'transition:background 160ms,color 160ms,border-color 160ms,transform 160ms;'
        +   'font-family:var(--font-sans,-apple-system,system-ui,sans-serif)}'
        + '.bp-qj-fab:hover{background:var(--surface-2);color:var(--accent);border-color:var(--accent);transform:translateY(-1px)}'
        + '.bp-qj-fab:active{transform:translateY(0)}'
        + '@media (max-width:620px){.bp-qj-fab{width:40px;height:40px;left:12px;bottom:12px;font-size:1.2rem}}'
        + 'body.embed-split .bp-qj-fab{display:none}';
      document.head.appendChild(st);
    }
    var btn = document.createElement('button');
    btn.id = 'bpQjFab';
    btn.type = 'button';
    btn.className = 'bp-qj-fab';
    btn.setAttribute('aria-label','Quick Jump (search)');
    btn.setAttribute('title','Quick Jump (⌘K)');
    btn.textContent = '⌕';
    btn.addEventListener('click', function(){ open(); });
    document.body.appendChild(btn);
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', mountQjFab);
  } else {
    mountQjFab();
  }
})();
