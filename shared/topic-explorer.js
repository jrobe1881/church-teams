/* topic-explorer.js — Advanced topical search & A–Z topic explorer.
   Loads TOPIC_INDEX + TOPICS from ../sermon/topics_index.js + topics.js
   (already used by the builder). Adds:
     - Natural-language search: "verses about forgiving enemies"
     - Boolean AND/OR/NOT
     - Fuzzy matching (levenshtein-like)
     - Category tags (people, places, doctrine, events, virtues, sins)
     - A–Z browser
     - "Topic of the Day"
     - Saved searches

   Public API:
     BshTopicExplorer.open(query?, tab?)
     BshTopicExplorer.close()
     BshTopicExplorer.search(q, filters?)  -> {matches: [...], meta: {...}}
     BshTopicExplorer.categoryOf(name)
     BshTopicExplorer.topicOfTheDay()
*/
(function(){
  if (window.BshTopicExplorer) return;

  function base(){
    // Absolute path is safe from any page — no more relative-path guessing.
    // Kept as a function so the deploy-target-path (Vercel sometimes serves under a prefix in preview)
    // could be swapped here in the future.
    return '/sermon/';
  }

  function fetchJsConst(url, constName){
    return fetch(url).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status + ' loading ' + url);
      return r.text();
    }).then(function(txt){
      // Strip `const NAME = ` prefix and trailing `;`
      var re = new RegExp('^\\s*(?:const|var|let)\\s+' + constName + '\\s*=\\s*');
      var s = txt.replace(re, '').replace(/;\s*$/, '');
      try { return JSON.parse(s); }
      catch(e){ throw new Error('Parse error in ' + url + ': ' + e.message); }
    });
  }

  var TOPIC_INDEX = null, TOPICS_PROMISE = null, INDEX_PROMISE = null;
  function loadIndex(){
    if (TOPIC_INDEX) return Promise.resolve(TOPIC_INDEX);
    if (typeof window.TOPIC_INDEX !== 'undefined') { TOPIC_INDEX = window.TOPIC_INDEX; return Promise.resolve(TOPIC_INDEX); }
    if (INDEX_PROMISE) return INDEX_PROMISE;
    INDEX_PROMISE = fetchJsConst(base() + 'topics_index.js', 'TOPIC_INDEX').then(function(idx){
      TOPIC_INDEX = idx;
      return TOPIC_INDEX;
    }).catch(function(err){
      console.error('[BshTopicExplorer] loadIndex failed:', err);
      INDEX_PROMISE = null; // allow retry
      throw err;
    });
    return INDEX_PROMISE;
  }
  function loadTopics(){
    if (TOPICS_PROMISE) return TOPICS_PROMISE;
    TOPICS_PROMISE = fetchJsConst(base() + 'topics.js', 'TOPICS').catch(function(err){
      console.error('[BshTopicExplorer] loadTopics failed:', err);
      TOPICS_PROMISE = null;
      throw err;
    });
    return TOPICS_PROMISE;
  }

  /* ---- Category classifier ----
     Best-effort heuristic based on topic name shape + a curated known list. */
  var KNOWN_CATS = {
    // doctrine / theology
    doctrine: ['FAITH','GRACE','SALVATION','JUSTIFICATION','SANCTIFICATION','ATONEMENT','REDEMPTION','REPENTANCE','FORGIVENESS','MERCY','LOVE','HOLY SPIRIT','GOD','JESUS','CHRIST','TRINITY','KINGDOM OF GOD','KINGDOM OF HEAVEN','RESURRECTION','JUDGMENT','HEAVEN','HELL','ETERNAL LIFE','PRAYER','BAPTISM','LORD\'S SUPPER','CHURCH','COVENANT','LAW','GOSPEL','SIN','TRUTH','WORD OF GOD','SCRIPTURES','HOLINESS','RIGHTEOUSNESS'],
    virtues: ['LOVE','JOY','PEACE','LONGSUFFERING','GENTLENESS','GOODNESS','MEEKNESS','TEMPERANCE','HOPE','FAITHFULNESS','HUMILITY','PATIENCE','KINDNESS','FORGIVENESS','COMPASSION','CHARITY','WISDOM','COURAGE','FRIENDSHIP','HONESTY','TRUST','THANKFULNESS','SELF-CONTROL','MODESTY','PURITY'],
    sins: ['ADULTERY','ANGER','COVETOUSNESS','ENVY','GLUTTONY','HATRED','IDOLATRY','LYING','MURDER','PRIDE','SLOTH','THEFT','WITCHCRAFT','DRUNKENNESS','BLASPHEMY','FORNICATION','GOSSIP','HYPOCRISY','JEALOUSY','MALICE','REBELLION','SLANDER','STRIFE','UNBELIEF','VANITY','WORLDLINESS'],
    events: ['CREATION','FLOOD','EXODUS','PASSOVER','TABERNACLE','TEMPLE','EXILE','CAPTIVITY','PENTECOST','TRANSFIGURATION','CRUCIFIXION','RESURRECTION','ASCENSION','GREAT COMMISSION','SECOND COMING'],
  };
  var CAT_LOOKUP = null;
  function buildCatLookup(){
    if (CAT_LOOKUP) return CAT_LOOKUP;
    CAT_LOOKUP = {};
    Object.keys(KNOWN_CATS).forEach(function(cat){ KNOWN_CATS[cat].forEach(function(n){ CAT_LOOKUP[n] = cat; }); });
    return CAT_LOOKUP;
  }
  function categoryOf(name){
    if (!name) return 'other';
    buildCatLookup();
    if (CAT_LOOKUP[name]) return CAT_LOOKUP[name];
    // person / place heuristics
    var n = name.replace(/\s.*/, '');
    // ALL CAPS single word ending in typical proper noun shape → person or place
    if (/^[A-Z][A-Z']+$/.test(name) && name.length <= 12 && !name.includes(' ')) {
      // Places often end in -ITE (people from), city names common list
      var places = ['JERUSALEM','SAMARIA','GALILEE','JUDEA','ISRAEL','JUDAH','BABYLON','ROME','CORINTH','ANTIOCH','EPHESUS','ATHENS','DAMASCUS','BETHLEHEM','NAZARETH','JERICHO','TYRE','SIDON','EDOM','MOAB','AMMON','ASSYRIA','EGYPT','CANAAN','PHILISTIA','PERSIA','MEDIA','ARABIA'];
      if (places.indexOf(name) >= 0) return 'places';
      return 'people';
    }
    if (/OFFERING|SACRIFICE|FEAST|FESTIVAL|COMMANDMENT/i.test(name)) return 'worship';
    if (/PROPHECY|PROPHET|VISION|DREAM|SIGN|MIRACLE|WONDER/i.test(name)) return 'prophetic';
    return 'other';
  }

  /* ---- fuzzy match: levenshtein distance ---- */
  function lev(a,b){
    if (a===b) return 0;
    var la = a.length, lb = b.length;
    if (!la) return lb; if (!lb) return la;
    var v0 = new Array(lb+1), v1 = new Array(lb+1);
    for (var i=0;i<=lb;i++) v0[i] = i;
    for (var i=0;i<la;i++){
      v1[0] = i+1;
      for (var j=0;j<lb;j++){
        var cost = a.charCodeAt(i) === b.charCodeAt(j) ? 0 : 1;
        v1[j+1] = Math.min(v1[j]+1, v0[j+1]+1, v0[j]+cost);
      }
      for (var k=0;k<=lb;k++) v0[k] = v1[k];
    }
    return v1[lb];
  }

  /* ---- natural-language keyword extraction ---- */
  // Filler / question words to strip from natural-language queries.
  var STOP = new Set(['a','an','the','of','to','for','in','on','with','by','that','this','is','are','was','were','be','been','being','from','as','at','all','any','some','about','into','over','when','what','which','who','how','why','my','our','your','their','his','her','its','have','has','had','do','does','did','so','if','you','me','we','us','they','them','can','could','will','would','should','may','might','verses','verse','passage','passages','bible','scripture','scriptures','tell','show','find','give','make','get','let','him','she','he','it','way','shall','while','without','tells','show','me','list','give','contains','concerning','regarding','relating','related','relate','related','said','say','says','said','through','out','up','down','more','less','means','mean','meaning','definition','define','say','saying']);
  // Concept-level stems used when scoring. Distinct from STOP because we still
  // want to keep them as fallback keywords when nothing else survives.
  var SOFT_STOP = new Set(['not','no']);

  // Simple English stemmer-ish helper: strip common suffixes so "forgiving" and "forgives" both
  // match FORGIVENESS/FORGIVE.
  function stem(w){
    if (!w) return w;
    if (w.length > 6 && /ness$/.test(w)) w = w.slice(0,-4);
    if (w.length > 5 && /(ing|ers|est|ies|ied)$/.test(w)) w = w.slice(0,-3);
    if (w.length > 4 && /(ed|es|er|ly|al)$/.test(w)) w = w.slice(0,-2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) w = w.slice(0,-1);
    return w;
  }

  function tokenize(q){
    return String(q||'').toLowerCase().split(/[^a-z0-9']+/).filter(function(t){ return t && t.length > 1 && !STOP.has(t); });
  }

  /* ---- Query parser ----
     Returns an object:
       { must: [term...], should: [term...], not: [term...], phrases: [str...], mode: 'AND'|'OR'|'NL' }
     Rules:
       - "quoted phrases" → phrases (required substring match)
       - -word or NOT word → not
       - explicit `AND`/`OR` → sets mode; treat conjuncts accordingly
       - Everything else in a natural-language query → should (any match counts,
         with more matches scoring higher).
  */
  function parseQuery(q){
    q = String(q||'').trim();
    var out = { must:[], should:[], not:[], phrases:[], mode:'NL' };
    if (!q) return out;
    var phrases = [];
    q = q.replace(/"([^"]+)"/g, function(_,p){ phrases.push(p.toLowerCase().trim()); return ' \u0001'+(phrases.length-1)+' '; });
    out.phrases = phrases;

    var hasAND = /\b(and)\b/i.test(q);
    var hasOR  = /\bor\b/i.test(q);
    if (hasOR) out.mode = 'OR';
    else if (hasAND) out.mode = 'AND';

    // remove connectors as literals; "faith and love" → ["faith","love"] should
    q = q.replace(/\b(and|or)\b/gi, ' ');

    q.split(/\s+/).forEach(function(t){
      if (!t) return;
      var neg = false;
      if (t[0]==='-' && t.length>1) { neg = true; t = t.slice(1); }
      else if (/^not$/i.test(t)) return; // NOT flag handled as prefix only
      // phrase placeholder
      var m = /^\u0001(\d+)$/.exec(t);
      if (m) {
        var ph = phrases[+m[1]];
        (neg ? out.not : out.must).push({ tok: ph, phrase: true });
        return;
      }
      t = t.toLowerCase().replace(/[^a-z0-9']/g,'');
      if (!t || t.length < 2) return;
      if (STOP.has(t)) return;
      if (SOFT_STOP.has(t)) return;
      var tok = { tok: t, stem: stem(t) };
      if (neg) out.not.push(tok);
      else if (out.mode === 'AND') out.must.push(tok);
      else out.should.push(tok);
    });

    // If we had explicit AND, must is set; keep should empty (already skipped).
    // If natural-language and only one meaningful term, promote it to must.
    if (out.mode === 'NL' && out.should.length === 1) {
      out.must = out.should; out.should = [];
    }
    return out;
  }

  /* ---- Scoring ----
     Given a topic and a parsed query, return score >= 0 or -1 to exclude.
     Weighted heavily toward exact/prefix matches; fuzzy only when longer input.
  */
  function termScore(term, name, slug, slugWords){
    var needle = term.tok;
    if (!needle) return 0;
    // exact whole-name match
    if (slug === needle) return 200;
    // exact whole-word match anywhere in the slug
    for (var i=0;i<slugWords.length;i++){ if (slugWords[i] === needle) return 100; }
    // prefix at start of slug
    if (slug.indexOf(needle) === 0) return 70;
    // any word starts with needle
    for (var j=0;j<slugWords.length;j++){ if (slugWords[j].indexOf(needle) === 0) return 55; }
    // stem exact-match on a whole word (forgiveness ≠ substr of "forgive", so try stems)
    if (term.stem && term.stem.length >= 4) {
      for (var k=0;k<slugWords.length;k++){
        var sw = slugWords[k];
        if (sw === term.stem) return 60;
        if (sw.indexOf(term.stem) === 0) return 45;
        var sws = stem(sw);
        if (sws && sws === term.stem) return 50;
      }
    }
    // phrase-level substring anywhere — only allow if term is long enough (>=6 chars)
    // to avoid "ang" matching MANGER, STRANGER, etc.
    if (needle.length >= 6 && slug.indexOf(needle) >= 0) return 30;
    // fuzzy edit-distance on a whole word for longer tokens only
    if (needle.length >= 6) {
      var best = 999;
      for (var w=0;w<slugWords.length;w++){
        var word = slugWords[w];
        if (Math.abs(word.length - needle.length) > 2) continue;
        var d = lev(needle, word);
        if (d < best) best = d;
      }
      if (best === 1) return 20;
      if (best === 2 && needle.length >= 8) return 8;
    }
    return 0;
  }

  function scoreTopicParsed(name, slug, q){
    var slugWords = slug.split(/\s+/);
    // Exclusions first
    for (var i=0;i<q.not.length;i++){
      var n = q.not[i];
      var nn = n.tok;
      if (n.phrase) { if (slug.indexOf(nn) >= 0) return -1; }
      else { for (var wi=0;wi<slugWords.length;wi++){ if (slugWords[wi]===nn) return -1; } if (nn.length >= 6 && slug.indexOf(nn) >= 0) return -1; }
    }
    // Required phrases must appear literally
    for (var p=0;p<q.phrases.length;p++){ if (slug.indexOf(q.phrases[p]) < 0) return -1; }
    var score = 0;
    // AND: every must-term must score >0. Sum them.
    for (var m=0;m<q.must.length;m++){
      var mt = q.must[m];
      if (mt.phrase) { if (slug.indexOf(mt.tok) < 0) return -1; score += 40; continue; }
      var ms = termScore(mt, name, slug, slugWords);
      if (ms <= 0) return -1;
      score += ms;
    }
    // OR / natural-language: sum of positive should-terms; bonus for matching >1.
    var hits = 0;
    for (var s=0;s<q.should.length;s++){
      var st = q.should[s];
      var ss = termScore(st, name, slug, slugWords);
      if (ss > 0) { hits++; score += ss; }
    }
    // NL mode requires at least one should-hit (unless there were musts).
    if (q.mode !== 'AND' && q.must.length === 0 && hits === 0) return 0;
    // Multi-hit bonus: matching more concepts is meaningful.
    if (hits >= 2) score += hits * 15;
    return score;
  }

  function search(q, filters){
    filters = filters || {};
    return loadIndex().then(function(idx){
      var parsed = parseQuery(q);
      if (!parsed.must.length && !parsed.should.length && !parsed.phrases.length) {
        return { matches: [], meta:{ query: parsed } };
      }
      var matches = [];
      for (var i=0;i<idx.length;i++){
        var t = idx[i];
        if (filters.category && filters.category !== 'all' && categoryOf(t.n) !== filters.category) continue;
        var s = scoreTopicParsed(t.n, t.s, parsed);
        if (s > 0) matches.push({ name:t.n, refs:t.r, entries:t.e, category:categoryOf(t.n), score:s });
      }
      // AND-fallback: if strict AND yielded nothing, retry as OR so "faith and love" still helps.
      if (!matches.length && parsed.mode === 'AND' && parsed.must.length > 1) {
        var relaxed = { must:[], should:parsed.must.slice(), not:parsed.not.slice(), phrases:parsed.phrases.slice(), mode:'OR' };
        for (var j=0;j<idx.length;j++){
          var t2 = idx[j];
          if (filters.category && filters.category !== 'all' && categoryOf(t2.n) !== filters.category) continue;
          var s2 = scoreTopicParsed(t2.n, t2.s, relaxed);
          if (s2 > 0) matches.push({ name:t2.n, refs:t2.r, entries:t2.e, category:categoryOf(t2.n), score:s2 });
        }
      }
      matches.sort(function(a,b){ return b.score - a.score || b.refs - a.refs; });
      return { matches: matches.slice(0, filters.limit || 60), meta:{ query: parsed } };
    });
  }

  /* ---- Topic of the Day: seeded by date so it's the same for all users on a given day ---- */
  function todaySeed(){ var d = new Date(); return d.getFullYear()*1000 + d.getMonth()*40 + d.getDate(); }
  function topicOfTheDay(){
    return loadIndex().then(function(idx){
      // Filter for the meatier topics
      var pool = idx.filter(function(t){ return t.r >= 6 && t.e >= 3; });
      if (!pool.length) return null;
      var seed = todaySeed();
      var pick = pool[seed % pool.length];
      return pick;
    });
  }

  /* ---- Saved searches ---- */
  var SAVE_KEY = 'bsh_topic_saved_v1';
  function loadSaved(){ try { return JSON.parse((window.safeLS||localStorage).getItem(SAVE_KEY) || '[]') || []; } catch(e){ return []; } }
  function saveSaved(arr){ try { (window.safeLS||localStorage).setItem(SAVE_KEY, JSON.stringify(arr)); } catch(e){} if (savedSync) savedSync.notifyLocalChange(); }
  var savedSync = null;
  function tryBind(){
    if (!window.CloudAccount || savedSync) return;
    savedSync = window.CloudAccount.bindSync('topic_saved_searches', {
      getLocal: loadSaved,
      setLocal: function(d){ try { (window.safeLS||localStorage).setItem(SAVE_KEY, JSON.stringify(d||[])); } catch(e){} },
      emptyValue: [],
      onRemoteUpdate: function(){ if (open) renderPanel(); }
    });
  }
  if (window.CloudAccount) tryBind(); else { var w = setInterval(function(){ if (window.CloudAccount) { tryBind(); clearInterval(w); } }, 300); }

  /* ---- panel UI ---- */
  var overlay = null, panel = null, currentTab = 'search', currentQ = '', currentCat = 'all', currentMatches = [];
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  var STYLE = ''
    + '.bsh-te-overlay{position:fixed;inset:0;z-index:10002;background:rgba(20,19,16,.5);display:none;align-items:center;justify-content:center;padding:16px;font-family:var(--font-sans)}'
    + '.bsh-te-overlay.open{display:flex;animation:bsh-fade var(--dur-2) ease-out}'
    + '@keyframes bsh-fade{from{opacity:0}to{opacity:1}}'
    + '.bsh-te-panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow-3);width:100%;max-width:840px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;color:var(--ink)}'
    + '.bsh-te-head{background:var(--surface-2);border-bottom:1px solid var(--border);color:var(--ink);padding:16px 20px;display:flex;align-items:center;gap:12px}'
    + '.bsh-te-head h3{margin:0;font-family:var(--font-serif);font-weight:600;font-size:var(--t-xl);flex:1;letter-spacing:.2px;color:var(--ink)}'
    + '.bsh-te-head .bsh-te-close{background:transparent;border:none;color:var(--ink-2);border-radius:var(--r-sm);padding:6px 10px;cursor:pointer;font-size:var(--t-md);transition:background var(--dur-1)}'
    + '.bsh-te-head .bsh-te-close:hover{background:var(--surface-3)}'
    + '.bsh-te-tabs{display:flex;padding:12px 18px 0;gap:6px;border-bottom:1px solid var(--border);background:var(--surface)}'
    + '.bsh-te-tab{padding:9px 14px;border-radius:var(--r-sm) var(--r-sm) 0 0;cursor:pointer;font-size:var(--t-xs);font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);border:1px solid transparent;border-bottom:none;transition:background var(--dur-1),color var(--dur-1)}'
    + '.bsh-te-tab:hover{background:var(--surface-2)}'
    + '.bsh-te-tab.active{color:var(--accent);background:var(--accent-tint);border-color:var(--border)}'
    + '.bsh-te-body{flex:1;overflow-y:auto;padding:18px 20px}'
    + '.bsh-te-searchbar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}'
    + '.bsh-te-searchbar input{flex:1;min-width:220px;padding:11px 14px;font-size:var(--t-md);border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface-2);color:var(--ink);font-family:inherit;transition:box-shadow var(--dur-1)}'
    + '.bsh-te-searchbar input:focus{outline:none;box-shadow:var(--focus)}'
    + '.bsh-te-searchbar select{padding:11px 12px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface-2);color:var(--ink);font-family:inherit;font-size:var(--t-sm)}'
    + '.bsh-te-tip{color:var(--ink-3);font-size:var(--t-xs);margin-bottom:10px;padding:8px 10px;background:var(--surface-2);border-radius:var(--r-sm);line-height:1.5}'
    + '.bsh-te-tip code{background:var(--surface-3);padding:1px 5px;border-radius:var(--r-xs);font-size:.9em;font-family:var(--font-mono)}'
    + '.bsh-te-match{background:var(--surface);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:var(--r-md);padding:11px 14px;margin-bottom:8px;cursor:pointer;transition:border-color var(--dur-2),box-shadow var(--dur-2)}'
    + '.bsh-te-match:hover{box-shadow:var(--shadow-1);border-color:var(--border-strong)}'
    + '.bsh-te-match .n{font-family:var(--font-serif);font-weight:600;font-size:var(--t-lg);color:var(--accent)}'
    + '.bsh-te-match .m{color:var(--ink-3);font-size:var(--t-xs);margin-top:2px;display:flex;flex-wrap:wrap;gap:8px}'
    + '.bsh-te-match .m .cat{background:var(--surface-2);padding:1px 8px;border-radius:var(--r-sm);font-weight:600;text-transform:uppercase;letter-spacing:.05em;font-size:var(--t-xs);color:var(--ink-2)}'
    + '.bsh-te-alpha{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:14px}'
    + '.bsh-te-alpha button{background:var(--surface);border:1px solid var(--border);color:var(--ink);width:32px;height:32px;border-radius:var(--r-sm);font-weight:600;font-size:var(--t-sm);cursor:pointer;transition:background var(--dur-1),color var(--dur-1),border-color var(--dur-1)}'
    + '.bsh-te-alpha button:hover,.bsh-te-alpha button.active{background:var(--accent);color:#fff;border-color:var(--accent)}'
    + '.bsh-te-empty{text-align:center;color:var(--ink-3);padding:30px;font-style:italic;font-family:var(--font-scripture)}'
    + '.bsh-te-saved{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:10px 14px;margin-bottom:6px;display:flex;align-items:center;gap:10px}'
    + '.bsh-te-saved .sq{flex:1;font-weight:500;color:var(--ink)}'
    + '.bsh-te-saved button{background:transparent;border:1px solid var(--border);color:var(--ink-3);border-radius:var(--r-sm);padding:4px 10px;font-size:var(--t-xs);cursor:pointer;transition:background var(--dur-1)}'
    + '.bsh-te-saved button:hover{background:var(--surface-2)}'
    + '.bsh-te-cats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}'
    + '.bsh-te-catchip{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-pill);padding:6px 12px;font-size:var(--t-sm);font-weight:600;cursor:pointer;transition:background var(--dur-1),border-color var(--dur-1),color var(--dur-1);color:var(--ink)}'
    + '.bsh-te-catchip:hover{border-color:var(--border-strong)}'
    + '.bsh-te-catchip.active{background:var(--accent);color:#fff;border-color:var(--accent)}'
    + '.bsh-te-otd{background:var(--accent-tint);border:1px solid var(--border);border-radius:var(--r-md);padding:14px 16px;margin-bottom:14px}'
    + '.bsh-te-otd .lbl{font-size:var(--t-xs);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);margin-bottom:4px}'
    + '.bsh-te-otd .name{font-family:var(--font-serif);font-size:var(--t-2xl);font-weight:600;color:var(--ink);margin-bottom:2px}'
    + '.bsh-te-otd .meta{font-size:var(--t-sm);color:var(--ink-3)}';

  function ensureUI(){
    if (overlay) return;
    var st = document.createElement('style'); st.textContent = STYLE; document.head.appendChild(st);
    overlay = document.createElement('div');
    overlay.className = 'bsh-te-overlay';
    overlay.innerHTML = '<div class="bsh-te-panel"><div class="bsh-te-head"><h3>✧ Topical Explorer</h3><button class="bsh-te-close" type="button">✕</button></div>' +
      '<div class="bsh-te-tabs">' +
        '<div class="bsh-te-tab active" data-tab="search">Search</div>' +
        '<div class="bsh-te-tab" data-tab="browse">A–Z Browse</div>' +
        '<div class="bsh-te-tab" data-tab="saved">Saved</div>' +
      '</div>' +
      '<div class="bsh-te-body"></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.bsh-te-close').addEventListener('click', close);
    overlay.addEventListener('click', function(e){ if (e.target === overlay) close(); });
    overlay.querySelectorAll('.bsh-te-tab').forEach(function(t){
      t.addEventListener('click', function(){
        currentTab = t.getAttribute('data-tab');
        overlay.querySelectorAll('.bsh-te-tab').forEach(function(x){ x.classList.toggle('active', x===t); });
        renderPanel();
      });
    });
    document.addEventListener('keydown', function(e){ if (overlay && overlay.classList.contains('open') && e.key==='Escape') close(); });
  }

  function open(q, tab){
    ensureUI();
    if (tab) currentTab = tab;
    if (q) currentQ = q;
    overlay.classList.add('open');
    overlay.querySelectorAll('.bsh-te-tab').forEach(function(x){ x.classList.toggle('active', x.getAttribute('data-tab')===currentTab); });
    renderPanel();
    setTimeout(function(){ var i = overlay.querySelector('.bsh-te-searchbar input'); if (i) i.focus(); }, 60);
  }
  function close(){ if (overlay) overlay.classList.remove('open'); }

  function topicUrl(name){
    var base2 = location.pathname.indexOf('/sermon/')>=0 ? './index.html' : (location.pathname.indexOf('/atlas/')>=0||location.pathname.indexOf('/strongs/')>=0||location.pathname.indexOf('/wordstudy/')>=0 ? '../builder/index.html' : './builder/index.html');
    return base2 + '?topic=' + encodeURIComponent(name);
  }

  function renderPanel(){
    var body = overlay.querySelector('.bsh-te-body');
    if (currentTab === 'search') renderSearchTab(body);
    else if (currentTab === 'browse') renderBrowseTab(body);
    else if (currentTab === 'saved') renderSavedTab(body);
  }

  function renderSearchTab(body){
    body.innerHTML =
      '<div class="bsh-te-searchbar">' +
        '<input type="text" placeholder="Ask a question: try \"forgiving enemies\" or faith AND love" value="'+esc(currentQ)+'"/>' +
        '<select id="bsh-te-cat"><option value="all">All categories</option><option value="doctrine">Doctrine</option><option value="virtues">Virtues</option><option value="sins">Sins</option><option value="people">People</option><option value="places">Places</option><option value="events">Events</option><option value="worship">Worship</option><option value="prophetic">Prophetic</option><option value="other">Other</option></select>' +
        '<button class="btn primary" id="bsh-te-save" style="background:var(--accent);color:#fff;border:none;border-radius:var(--r-md);padding:9px 14px;cursor:pointer;font-weight:600;font-size:var(--t-sm)">☆ Save</button>' +
      '</div>' +
      '<div class="bsh-te-tip"><b>Try:</b> a natural question ("verses about anger and forgiveness"), a keyword ("grace"), <code>AND</code> ("faith AND works"), <code>OR</code> ("joy OR peace"), <code>-exclude</code>, or <code>"quoted phrases"</code>.</div>' +
      '<div id="bsh-te-otd"></div>' +
      '<div id="bsh-te-results"></div>';
    var input = body.querySelector('input');
    var cat = body.querySelector('#bsh-te-cat');
    cat.value = currentCat;
    var timer = null;
    function run(){
      var q = input.value.trim(); currentQ = q; currentCat = cat.value;
      if (!q) { body.querySelector('#bsh-te-results').innerHTML = ''; renderOTD(); return; }
      search(q, { category: cat.value }).then(function(res){
        currentMatches = res.matches;
        var el = body.querySelector('#bsh-te-results');
        if (!res.matches.length) { el.innerHTML = '<div class="bsh-te-empty">No matching topics. Try broader terms or drop filters.</div>'; return; }
        el.innerHTML = '<div style="color:var(--ink-3);font-size:var(--t-sm);margin-bottom:8px">' + res.matches.length + ' topic' + (res.matches.length===1?'':'s') + ' matched</div>' +
          res.matches.map(function(m){
            return '<div class="bsh-te-match" data-name="'+esc(m.name)+'"><div class="n">'+esc(m.name)+'</div><div class="m"><span class="cat">'+esc(m.category)+'</span> · '+ m.refs.toLocaleString() +' references · '+ m.entries +' sub-topics</div></div>';
          }).join('');
        el.querySelectorAll('.bsh-te-match').forEach(function(el2){ el2.addEventListener('click', function(){ window.location.href = topicUrl(el2.getAttribute('data-name')); }); });
      });
    }
    input.addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(run,180); });
    input.addEventListener('keydown', function(e){ if (e.key==='Enter') run(); });
    cat.addEventListener('change', run);
    body.querySelector('#bsh-te-save').addEventListener('click', function(){
      var q = input.value.trim(); if (!q) return;
      var arr = loadSaved();
      if (arr.some(function(x){return x.q===q;})) return;
      arr.unshift({ q:q, cat:cat.value, at:Date.now() });
      arr = arr.slice(0,50);
      saveSaved(arr);
      window.BshLibrary && window.BshLibrary.toast && window.BshLibrary.toast('Search saved');
    });
    if (currentQ) run(); else renderOTD();

    function renderOTD(){
      topicOfTheDay().then(function(t){
        if (!t) return;
        body.querySelector('#bsh-te-otd').innerHTML = '<div class="bsh-te-otd"><div class="lbl">✦ Topic of the Day</div><a href="'+topicUrl(t.n)+'" style="text-decoration:none"><div class="name">'+esc(t.n)+'</div></a><div class="meta">'+t.r.toLocaleString()+' references · '+t.e+' sub-topics · <span class="cat" style="background:var(--surface-2);padding:1px 8px;border-radius:var(--r-sm);font-weight:600;text-transform:uppercase;letter-spacing:.05em;font-size:var(--t-xs)">'+esc(categoryOf(t.n))+'</span></div></div>';
      });
    }
  }

  function renderBrowseTab(body){
    body.innerHTML = '<div class="bsh-te-cats"></div><div class="bsh-te-alpha"></div><div id="bsh-te-letter"></div>';
    var cats = body.querySelector('.bsh-te-cats');
    var alpha = body.querySelector('.bsh-te-alpha');
    ['all','doctrine','virtues','sins','people','places','events','worship','prophetic','other'].forEach(function(c){
      var b = document.createElement('button'); b.className = 'bsh-te-catchip' + (c===currentCat?' active':''); b.textContent = c[0].toUpperCase()+c.slice(1); b.addEventListener('click', function(){ currentCat = c; renderBrowseTab(body); }); cats.appendChild(b);
    });
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    var current = window._bshTeLetter || 'A';
    letters.forEach(function(L){ var b = document.createElement('button'); b.textContent = L; if (L===current) b.classList.add('active'); b.addEventListener('click', function(){ window._bshTeLetter = L; renderBrowseTab(body); }); alpha.appendChild(b); });
    loadIndex().then(function(idx){
      var filtered = idx.filter(function(t){ return t.n[0] === current && (currentCat==='all' || categoryOf(t.n) === currentCat); });
      filtered.sort(function(a,b){ return a.n.localeCompare(b.n); });
      var host = body.querySelector('#bsh-te-letter');
      if (!filtered.length) { host.innerHTML = '<div class="bsh-te-empty">No topics under this letter/category.</div>'; return; }
      host.innerHTML = filtered.map(function(t){
        return '<div class="bsh-te-match" data-name="'+esc(t.n)+'"><div class="n">'+esc(t.n)+'</div><div class="m"><span class="cat">'+esc(categoryOf(t.n))+'</span> · '+ t.r.toLocaleString() +' references</div></div>';
      }).join('');
      host.querySelectorAll('.bsh-te-match').forEach(function(el){ el.addEventListener('click', function(){ window.location.href = topicUrl(el.getAttribute('data-name')); }); });
    });
  }

  function renderSavedTab(body){
    var arr = loadSaved();
    if (!arr.length) { body.innerHTML = '<div class="bsh-te-empty">No saved searches yet. Save one from the Search tab.</div>'; return; }
    body.innerHTML = arr.map(function(s,i){
      return '<div class="bsh-te-saved"><div class="sq">"'+esc(s.q)+'"</div><span style="color:var(--ink-3);font-size:var(--t-xs)">'+esc(s.cat||'all')+'</span><button data-run="'+i+'" type="button">Run</button><button data-del="'+i+'" type="button">✕</button></div>';
    }).join('');
    body.querySelectorAll('[data-run]').forEach(function(b){ b.addEventListener('click', function(){ var s = arr[+b.getAttribute('data-run')]; currentQ = s.q; currentCat = s.cat||'all'; currentTab='search'; renderPanel(); overlay.querySelectorAll('.bsh-te-tab').forEach(function(x){ x.classList.toggle('active', x.getAttribute('data-tab')==='search'); }); }); });
    body.querySelectorAll('[data-del]').forEach(function(b){ b.addEventListener('click', function(){ var i = +b.getAttribute('data-del'); arr.splice(i,1); saveSaved(arr); renderSavedTab(body); }); });
  }

  window.BshTopicExplorer = { open: open, close: close, search: search, categoryOf: categoryOf, topicOfTheDay: topicOfTheDay };
})();
