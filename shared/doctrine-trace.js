/*
  Explorer premium — Doctrine Trace Map.
  Renders a vertical timeline of stages for a doctrine, each grounded in
  KJV verses and corpus witnesses. Verse text is hydrated client-side from
  the same /strongs/v/ book files the reader uses, so the endpoint stays
  fast and the trace UI can enrich verses in-place.

  Entry: window.BpDoctrineTrace.mount(hostElement)
    hostElement receives the trace UI (button, input, result region).
  Optional gate: window.BpDoctrineTrace.isPro = () => boolean.
    Defaults to true (feature unlocked). Flip later when a real
    subscription tier exists.
*/
(function(){
  'use strict';

  // Inline book table — same shape the server uses. Avoids depending on
  // /strongs/meta.js being loaded (its META is a script-scope const, not a
  // window property, so it can't be reused across pages reliably).
  var VERSE_BASE = '/strongs/';
  var BOOKS = [
    ['GEN','Genesis','v/02-GEN.json'],['EXO','Exodus','v/03-EXO.json'],['LEV','Leviticus','v/04-LEV.json'],
    ['NUM','Numbers','v/05-NUM.json'],['DEU','Deuteronomy','v/06-DEU.json'],['JOS','Joshua','v/07-JOS.json'],
    ['JDG','Judges','v/08-JDG.json'],['RUT','Ruth','v/09-RUT.json'],['1SA','1 Samuel','v/10-1SA.json'],
    ['2SA','2 Samuel','v/11-2SA.json'],['1KI','1 Kings','v/12-1KI.json'],['2KI','2 Kings','v/13-2KI.json'],
    ['1CH','1 Chronicles','v/14-1CH.json'],['2CH','2 Chronicles','v/15-2CH.json'],['EZR','Ezra','v/16-EZR.json'],
    ['NEH','Nehemiah','v/17-NEH.json'],['EST','Esther','v/18-EST.json'],['JOB','Job','v/19-JOB.json'],
    ['PSA','Psalms','v/20-PSA.json'],['PRO','Proverbs','v/21-PRO.json'],['ECC','Ecclesiastes','v/22-ECC.json'],
    ['SNG','Song of Solomon','v/23-SNG.json'],['ISA','Isaiah','v/24-ISA.json'],['JER','Jeremiah','v/25-JER.json'],
    ['LAM','Lamentations','v/26-LAM.json'],['EZK','Ezekiel','v/27-EZK.json'],['DAN','Daniel','v/28-DAN.json'],
    ['HOS','Hosea','v/29-HOS.json'],['JOL','Joel','v/30-JOL.json'],['AMO','Amos','v/31-AMO.json'],
    ['OBA','Obadiah','v/32-OBA.json'],['JON','Jonah','v/33-JON.json'],['MIC','Micah','v/34-MIC.json'],
    ['NAM','Nahum','v/35-NAM.json'],['HAB','Habakkuk','v/36-HAB.json'],['ZEP','Zephaniah','v/37-ZEP.json'],
    ['HAG','Haggai','v/38-HAG.json'],['ZEC','Zechariah','v/39-ZEC.json'],['MAL','Malachi','v/40-MAL.json'],
    ['MAT','Matthew','v/70-MAT.json'],['MRK','Mark','v/71-MRK.json'],['LUK','Luke','v/72-LUK.json'],
    ['JHN','John','v/73-JHN.json'],['ACT','Acts','v/74-ACT.json'],['ROM','Romans','v/75-ROM.json'],
    ['1CO','1 Corinthians','v/76-1CO.json'],['2CO','2 Corinthians','v/77-2CO.json'],['GAL','Galatians','v/78-GAL.json'],
    ['EPH','Ephesians','v/79-EPH.json'],['PHP','Philippians','v/80-PHP.json'],['COL','Colossians','v/81-COL.json'],
    ['1TH','1 Thessalonians','v/82-1TH.json'],['2TH','2 Thessalonians','v/83-2TH.json'],['1TI','1 Timothy','v/84-1TI.json'],
    ['2TI','2 Timothy','v/85-2TI.json'],['TIT','Titus','v/86-TIT.json'],['PHM','Philemon','v/87-PHM.json'],
    ['HEB','Hebrews','v/88-HEB.json'],['JAS','James','v/89-JAS.json'],['1PE','1 Peter','v/90-1PE.json'],
    ['2PE','2 Peter','v/91-2PE.json'],['1JN','1 John','v/92-1JN.json'],['2JN','2 John','v/93-2JN.json'],
    ['3JN','3 John','v/94-3JN.json'],['JUD','Jude','v/95-JUD.json'],['REV','Revelation','v/96-REV.json'],
  ];
  var BOOK_META = {}; BOOKS.forEach(function(b){ BOOK_META[b[0]] = { name: b[1], vfile: b[2] }; });
  var BOOK_ALIASES = { PSALM:'PSA', PSALMS:'PSA', PS:'PSA', SONG:'SNG', MARK:'MRK', MATT:'MAT', LUKE:'LUK', JOHN:'JHN', ACTS:'ACT', REVELATION:'REV' };
  var _verseCache = {};            // key: BOOK_CODE -> parsed rows array

  function esc(s){ return String(s==null?'':s).replace(/[&<>\"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  // Given canonical "ACT.2.38" return { book, chapter, verse } or null.
  function parseCanonical(c){
    var m = String(c||'').trim().match(/^([A-Z0-9]{2,10})\.(\d+)\.(\d+)$/i);
    if (!m) return null;
    var book = m[1].toUpperCase();
    if (!BOOK_META[book]) book = BOOK_ALIASES[book] || book;
    if (!BOOK_META[book]) return null;
    return { book: book, chapter: +m[2], verse: +m[3] };
  }

  // Hydrate verse text for a set of canonical refs. Returns a map
  // { "ACT.2.38": "Then Peter said..." }. Reads /strongs/v/<file>.json once
  // per book and caches the parsed rows.
  async function hydrateVerses(canonicals){
    var need = {};
    canonicals.forEach(function(c){
      var p = parseCanonical(c); if (!p) return;
      if (!need[p.book]) need[p.book] = [];
      need[p.book].push(p);
    });
    var out = {};
    var books = Object.keys(need);
    for (var i = 0; i < books.length; i++) {
      var code = books[i];
      var meta = BOOK_META[code];
      if (!meta) continue;
      if (!_verseCache[code]) {
        try {
          var r = await fetch(VERSE_BASE + meta.vfile);
          if (!r.ok) continue;
          _verseCache[code] = await r.json();
        } catch(e){ continue; }
      }
      var rows = _verseCache[code];
      // Verse files are arrays: each row is [chapter, verse, tokens[], strongsMap].
      // We just need chapter, verse, and the token array to reconstruct KJV text.
      need[code].forEach(function(p){
        var row = null;
        for (var j = 0; j < rows.length; j++) {
          var r = rows[j];
          // Support both compact array form and legacy {c,v,text} form.
          if (Array.isArray(r) && r[0] === p.chapter && r[1] === p.verse) { row = r; break; }
          if (r && !Array.isArray(r) && r.c === p.chapter && r.v === p.verse) { row = r; break; }
        }
        if (!row) return;
        var text = '';
        if (Array.isArray(row)) {
          var tokens = row[2] || [];
          // Concatenate tokens; punctuation tokens attach without leading space.
          for (var k = 0; k < tokens.length; k++) {
            var tk = tokens[k];
            if (typeof tk !== 'string') tk = tk && tk.w ? tk.w : '';
            if (!tk) continue;
            if (text && /^[A-Za-z0-9‘’]/.test(tk)) text += ' ';
            text += tk;
          }
        } else {
          text = row.text || row.t || '';
          if (Array.isArray(text)) text = text.map(function(tok){ return typeof tok === 'string' ? tok : (tok.w || ''); }).join(' ');
        }
        out[code + '.' + p.chapter + '.' + p.verse] = String(text).trim();
      });
    }
    return out;
  }

  // Curated doctrines for the picker. Text-first so users can type free-form
  // too. Order matters — most commonly requested first.
  var CURATED = [
    { label: 'Baptism in Jesus\u2019 name',       q: 'water baptism in the name of Jesus Christ' },
    { label: 'The oneness of God',              q: 'the oneness of God (Jesus is Jehovah in the flesh)' },
    { label: 'Holy Ghost baptism with tongues', q: 'the baptism of the Holy Ghost with tongues as initial evidence' },
    { label: 'Repentance and remission of sins', q: 'repentance and the remission of sins (Acts 2:38)' },
    { label: 'The new birth (John 3:5)',        q: 'the new birth of water and Spirit' },
    { label: 'Holiness and separation',         q: 'holiness of life and separation from the world' },
    { label: 'The name above every name',       q: 'the name of Jesus as the one saving name' },
    { label: 'Second coming of Christ',         q: 'the second coming of Jesus Christ' },
    { label: 'Divine healing',                  q: 'divine healing through the name of Jesus' },
    { label: 'The Godhead in Christ',           q: 'the fullness of the Godhead bodily in Christ (Col 2:9)' },
  ];

  function ensureStyles(){
    if (document.getElementById('bp-doctrine-trace-css')) return;
    var css = document.createElement('style');
    css.id = 'bp-doctrine-trace-css';
    css.textContent = [
      '.bpdt-open-btn{background:transparent;border:1px solid var(--border);color:var(--ink-2);padding:6px 12px;border-radius:999px;font:500 12px var(--font-sans);cursor:pointer;display:inline-flex;align-items:center;gap:6px}',
      '.bpdt-open-btn:hover{border-color:var(--accent);color:var(--accent)}',
      '.bpdt-panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:14px 16px;margin-top:12px}',
      '.bpdt-input-row{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap}',
      '.bpdt-input{flex:1;min-width:200px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--ink);font:14px var(--font-sans)}',
      '.bpdt-go{background:var(--accent);color:#fff;border:0;padding:8px 14px;border-radius:8px;font:600 13px var(--font-sans);cursor:pointer}',
      '.bpdt-go:disabled{opacity:.55;cursor:default}',
      '.bpdt-new{background:transparent;color:var(--ink-2,#5c534b);border:1px solid var(--border);padding:8px 12px;border-radius:8px;font:500 13px var(--font-sans);cursor:pointer}',
      '.bpdt-new:hover{border-color:var(--accent);color:var(--accent)}',
      '.bpdt-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}',
      '.bpdt-chip{background:var(--bg);border:1px solid var(--border);color:var(--ink-2);padding:4px 10px;border-radius:999px;font:500 12px var(--font-sans);cursor:pointer}',
      '.bpdt-chip:hover{border-color:var(--accent);color:var(--accent)}',
      '.bpdt-status{font-size:12px;color:var(--ink-3);margin:4px 0}',
      '.bpdt-summary{font:italic 14px/1.55 var(--font-serif);color:var(--ink-2);padding:8px 10px;border-left:2px solid var(--accent);background:var(--bg);border-radius:0 6px 6px 0;margin:8px 0 14px}',
      '.bpdt-timeline{position:relative;padding-left:20px}',
      '.bpdt-timeline::before{content:"";position:absolute;left:6px;top:8px;bottom:8px;width:2px;background:linear-gradient(var(--accent),var(--border))}',
      '.bpdt-stage{position:relative;margin-bottom:16px}',
      '.bpdt-stage::before{content:"";position:absolute;left:-18px;top:6px;width:10px;height:10px;border-radius:999px;background:var(--accent);box-shadow:0 0 0 3px var(--surface)}',
      '.bpdt-stage-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:4px}',
      '.bpdt-stage-title{font:600 15px var(--font-serif);color:var(--ink);margin:0}',
      '.bpdt-stage-era{font:600 10px var(--font-sans);text-transform:uppercase;letter-spacing:.05em;padding:2px 8px;border-radius:999px;background:rgba(122,31,43,.08);color:var(--accent)}',
      '.bpdt-stage-summary{font:14px/1.55 var(--font-sans);color:var(--ink-2);margin:4px 0 8px}',
      '.bpdt-verses{display:flex;flex-direction:column;gap:6px;margin:8px 0}',
      '.bpdt-verse{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 10px}',
      '.bpdt-verse-ref{font:600 12px var(--font-sans);color:var(--accent);margin-right:6px}',
      '.bpdt-verse-text{font:14px/1.5 var(--font-serif);color:var(--ink)}',
      '.bpdt-verse-actions{display:flex;gap:8px;margin-top:4px}',
      '.bpdt-verse-link{font:500 11px var(--font-sans);color:var(--ink-3);text-decoration:none;border-bottom:1px dashed var(--border)}',
      '.bpdt-verse-link:hover{color:var(--accent);border-color:var(--accent)}',
      '.bpdt-witnesses{margin-top:8px}',
      '.bpdt-witnesses-label{font:600 11px var(--font-sans);text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);margin-bottom:4px}',
      '.bpdt-witness{background:var(--surface);border-left:2px solid var(--border);padding:6px 10px;margin:4px 0;font:13px/1.5 var(--font-sans);color:var(--ink-2)}',
      '.bpdt-witness-src{font:600 11px var(--font-sans);color:var(--ink-3);margin-top:3px}',
      '.bpdt-mode-chip{font:600 10px var(--font-sans);padding:2px 8px;border-radius:999px;background:rgba(122,31,43,.12);color:var(--accent);text-transform:uppercase;letter-spacing:.05em}',
      '.bpdt-sources{margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}',
      '.bpdt-sources-label{font:600 11px var(--font-sans);text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);margin-bottom:6px}',
      '.bpdt-source-item{font:13px/1.5 var(--font-sans);color:var(--ink-2);margin-bottom:4px}',
      '.bpdt-source-idx{font:600 11px var(--font-sans);color:var(--accent);margin-right:4px}',
      '.bpdt-error{color:#c1444d;font:14px/1.5 var(--font-sans);padding:10px;background:rgba(193,68,77,.08);border-radius:6px}',
      '@media (max-width: 640px){ .bpdt-input{min-width:0;flex:1 1 100%} .bpdt-go{flex:1} .bpdt-new{flex:1} }',
    ].join('\n');
    document.head.appendChild(css);
  }

  // Given a canonical BOOK.C.V, produce the reader URL. The reader parses
  // location.hash as #b=<CODE>&c=<n>&v=<n>. No dependency on meta.js.
  function readerUrl(canonical){
    var p = parseCanonical(canonical); if (!p) return '/read/';
    return '/read/#b=' + p.book + '&c=' + p.chapter + '&v=' + p.verse;
  }
  function humanRef(canonical, fallback){
    var p = parseCanonical(canonical); if (!p) return fallback || canonical;
    var meta = BOOK_META[p.book];
    var name = meta ? meta.name : p.book;
    return name + ' ' + p.chapter + ':' + p.verse;
  }

  async function renderTrace(host, trace, doctrine){
    // Server hydrates KJV text into v.text. If any are missing (older
    // client cache, network hiccup), fall back to a client-side hydration
    // against /strongs/v/*.json.
    var needClientHydrate = [];
    trace.stages.forEach(function(s){ (s.verses||[]).forEach(function(v){
      if (v && v.canonical && !v.text) needClientHydrate.push(v.canonical);
    }); });
    var verseMap = {};
    if (needClientHydrate.length) {
      try { verseMap = await hydrateVerses(needClientHydrate); } catch(e){}
    }

    var modeLabel = trace.mode === 'scripture_only' ? 'Scripture-only' : (trace.mode === 'hybrid' ? 'Hybrid corpus' : 'Corpus-grounded');
    var modeChip = '<span class="bpdt-mode-chip" title="' + esc(modeLabel === 'Scripture-only' ? 'No corpus match \u2014 built from KJV under Apostolic framing' : (modeLabel === 'Hybrid corpus' ? 'Thin corpus \u2014 supplemented by Scripture' : 'Grounded in Apostolic corpus witnesses')) + '">' + esc(modeLabel) + '</span>';

    var stagesHtml = trace.stages.map(function(s){
      var versesHtml = (s.verses||[]).map(function(v){
        var text = v.text || verseMap[v.canonical] || '';
        var refLabel = v.ref || humanRef(v.canonical, v.ref);
        return (
          '<div class="bpdt-verse">' +
            '<span class="bpdt-verse-ref">' + esc(refLabel) + '</span>' +
            (text ? '<span class="bpdt-verse-text">' + esc(text) + '</span>' : '<span class="bpdt-verse-text" style="color:var(--ink-3);font-style:italic">(verse text unavailable)</span>') +
            '<div class="bpdt-verse-actions">' +
              '<a class="bpdt-verse-link" href="' + esc(readerUrl(v.canonical)) + '" target="_blank" rel="noopener">Open in reader</a>' +
              (window.BuilderTray && window.BuilderTray.pushVerse
                ? '<a class="bpdt-verse-link" href="#" data-push-verse="' + esc(refLabel) + '">Add to Builder</a>'
                : '') +
            '</div>' +
          '</div>'
        );
      }).join('');

      var witnessesHtml = (s.witnesses||[]).length ? (
        '<div class="bpdt-witnesses">' +
          '<div class="bpdt-witnesses-label">Corpus witnesses</div>' +
          s.witnesses.map(function(w){
            var src = (trace.sources || [])[w.sourceIdx - 1];
            var srcLabel = src
              ? (src.author + ' \u2014 ' + src.title + ' (' + src.year + ')')
              : ('Source [' + w.sourceIdx + ']');
            return (
              '<div class="bpdt-witness">' +
                '\u201c' + esc(w.quote) + '\u201d' +
                '<div class="bpdt-witness-src">[' + w.sourceIdx + '] ' + esc(srcLabel) + '</div>' +
              '</div>'
            );
          }).join('') +
        '</div>'
      ) : '';

      return (
        '<div class="bpdt-stage">' +
          '<div class="bpdt-stage-head">' +
            '<h4 class="bpdt-stage-title">' + esc(s.title) + '</h4>' +
            (s.era ? '<span class="bpdt-stage-era">' + esc(s.era) + '</span>' : '') +
          '</div>' +
          '<div class="bpdt-stage-summary">' + esc(s.summary) + '</div>' +
          (versesHtml ? '<div class="bpdt-verses">' + versesHtml + '</div>' : '') +
          witnessesHtml +
        '</div>'
      );
    }).join('');

    var sourcesHtml = (trace.sources || []).length ? (
      '<div class="bpdt-sources">' +
        '<div class="bpdt-sources-label">Sources</div>' +
        trace.sources.map(function(src, i){
          var line = (src.author || 'Unknown') + '. \u201c' + (src.title || 'Untitled') + '.\u201d ' + (src.work_type || 'work') + ', ' + (src.year || 'n.d.') + '.';
          if (src.restricted) line += ' [restricted \u2014 library not viewable]';
          return '<div class="bpdt-source-item"><span class="bpdt-source-idx">[' + (i+1) + ']</span>' + esc(line) + '</div>';
        }).join('') +
      '</div>'
    ) : '';

    host.innerHTML = (
      '<div class="bpdt-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">' +
        '<strong style="font-family:var(--font-serif);font-size:16px">Doctrine Trace \u2014 ' + esc(doctrine) + '</strong>' +
        modeChip +
      '</div>' +
      (trace.summary ? '<div class="bpdt-summary">' + esc(trace.summary) + '</div>' : '') +
      '<div class="bpdt-timeline">' + stagesHtml + '</div>' +
      sourcesHtml
    );

    // Wire "Add to Builder" verse buttons.
    host.querySelectorAll('[data-push-verse]').forEach(function(a){
      a.addEventListener('click', function(ev){
        ev.preventDefault();
        var ref = a.getAttribute('data-push-verse');
        try { window.BuilderTray.pushVerse(ref, 'Doctrine Trace: ' + doctrine); } catch(e){}
        a.textContent = 'Added \u2713';
        setTimeout(function(){ a.textContent = 'Add to Builder'; }, 1600);
      });
    });
  }

  async function runTrace(host, statusEl, doctrine, resultEl){
    if (!doctrine || doctrine.trim().length < 3) {
      statusEl.textContent = 'Enter a doctrine (at least 3 characters).';
      return;
    }
    var q = doctrine.trim();
    if (window.BPSpinner && window.BPSpinner.html) {
      statusEl.innerHTML = window.BPSpinner.html({ size: 22, label: 'Tracing through Scripture and the Apostolic corpus', inline: true });
    } else {
      statusEl.textContent = 'Tracing the doctrine through Scripture and the Apostolic corpus\u2026';
    }
    resultEl.innerHTML = '';
    try {
      var r = await fetch('/api/dr-doctrine-trace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctrine: q }),
      });
      var data = await r.json();
      if (!r.ok || data.error) {
        statusEl.textContent = '';
        resultEl.innerHTML = '<div class="bpdt-error">' + esc(data.error || ('HTTP ' + r.status)) + '</div>';
        return;
      }
      statusEl.textContent = '';
      await renderTrace(resultEl, data, q);
      // Persist to Explorer chat history so it appears in the History drawer
      // and the user can revisit it later. Each successful trace is stored
      // as its own session (startNew) — doctrine traces are one-shot, not
      // conversational.
      try {
        if (window.ChatHistory) {
          window.ChatHistory.startNew('trace');
          window.ChatHistory.saveTurn('trace', { q: q, trace: data });
        }
      } catch(_e) {}
    } catch(e) {
      statusEl.textContent = '';
      resultEl.innerHTML = '<div class="bpdt-error">Trace failed: ' + esc(e.message || String(e)) + '</div>';
    }
  }

  function mount(host){
    if (!host || host.__bpdtMounted) return;
    host.__bpdtMounted = true;
    ensureStyles();

    // Gate stub: when a paywall exists, flip this to consult it.
    var isPro = typeof window.BpDoctrineTrace !== 'undefined' && typeof window.BpDoctrineTrace.isPro === 'function'
      ? window.BpDoctrineTrace.isPro()
      : true;
    if (!isPro) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bpdt-open-btn';
    btn.innerHTML = '<span aria-hidden="true">\u25f4</span> Trace a doctrine';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('title', 'Trace how a doctrine unfolds through Scripture and the Apostolic corpus');
    host.appendChild(btn);

    var panel = document.createElement('div');
    panel.className = 'bpdt-panel';
    panel.hidden = true;
    panel.innerHTML = (
      '<div class="bpdt-input-row">' +
        '<input type="text" class="bpdt-input" placeholder="e.g. baptism in Jesus\u2019 name, oneness of God, second coming\u2026" />' +
        '<button type="button" class="bpdt-go">Trace</button>' +
        '<button type="button" class="bpdt-new" title="Start a new trace">New</button>' +
      '</div>' +
      '<div class="bpdt-chips"></div>' +
      '<div class="bpdt-status"></div>' +
      '<div class="bpdt-result"></div>'
    );
    host.parentNode.insertBefore(panel, host.nextSibling);

    var input  = panel.querySelector('.bpdt-input');
    var go     = panel.querySelector('.bpdt-go');
    var neu    = panel.querySelector('.bpdt-new');
    var chipsW = panel.querySelector('.bpdt-chips');
    var status = panel.querySelector('.bpdt-status');
    var result = panel.querySelector('.bpdt-result');

    // Curated chips.
    CURATED.forEach(function(d){
      var c = document.createElement('button');
      c.type = 'button'; c.className = 'bpdt-chip';
      c.textContent = d.label;
      c.addEventListener('click', function(){
        input.value = d.q;
        runTrace(host, status, d.q, result);
      });
      chipsW.appendChild(c);
    });

    btn.addEventListener('click', function(){
      var open = !panel.hidden;
      panel.hidden = open;
      btn.setAttribute('aria-expanded', String(!open));
      if (!open) setTimeout(function(){ input.focus(); }, 20);
    });

    go.addEventListener('click', function(){ runTrace(host, status, input.value, result); });
    input.addEventListener('keydown', function(ev){
      if (ev.key === 'Enter') { ev.preventDefault(); runTrace(host, status, input.value, result); }
    });
    neu.addEventListener('click', function(){
      input.value = '';
      status.textContent = '';
      result.innerHTML = '';
      try { if (window.ChatHistory) window.ChatHistory.startNew('trace'); } catch(_e) {}
      setTimeout(function(){ input.focus(); }, 20);
    });

    // Expose panel handles so history restore can re-render into this panel.
    host.__bpdt = {
      openPanel: function(){
        panel.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
      },
      closePanel: function(){
        panel.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        status.textContent = '';
        result.innerHTML = '';
        input.value = '';
      },
      setInput: function(v){ input.value = v || ''; },
      renderInto: function(trace, doctrine){
        status.textContent = '';
        return renderTrace(result, trace, doctrine);
      },
    };
  }

  // Listen for History drawer "open trace" events. When the user clicks a
  // saved trace in history, we open the panel and re-render the stored
  // trace data without hitting the network again.
  window.addEventListener('bp:doctrine-trace-open', function(ev){
    var host = document.getElementById('bpdt-mount');
    if (!host) return;
    if (!host.__bpdtMounted) mount(host);
    var api = host.__bpdt;
    if (!api) return;
    var d = ev.detail || {};
    // Empty doctrine signals a clear/reset — just close the panel.
    if (!d.doctrine && !d.trace) {
      api.closePanel();
      return;
    }
    api.openPanel();
    api.setInput(d.doctrine || '');
    if (d.trace) {
      try { api.renderInto(d.trace, d.doctrine || ''); } catch(_e) {}
    }
  });

  // Close the trace panel whenever a non-trace chat session is loaded.
  window.addEventListener('bp:chat-history-open', function(ev){
    var s = ev && ev.detail && ev.detail.session;
    if (s && s.mode === 'trace') return; // trace sessions handled by bp:doctrine-trace-open
    var host = document.getElementById('bpdt-mount');
    if (!host || !host.__bpdt) return;
    host.__bpdt.closePanel();
  });

  window.BpDoctrineTrace = { mount: mount, isPro: function(){ return true; } };

  // Auto-mount if the Explorer host is present. Idempotent — mount() no-ops on
  // a host it has already decorated.
  function autoMount(){
    var host = document.getElementById('bpdt-mount');
    if (host) mount(host);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
})();
