/* hover-verses.js — Auto-detect Bible references in page text and show a
   floating verse preview card on hover / focus. Uses the sermon/v/*.json
   verse files (same data path all tools already share via META.books).

   Public API:
     BshHoverVerse.scan(rootEl?)      — annotate references inside rootEl
     BshHoverVerse.show(refStr, anchorEl)
     BshHoverVerse.hide()
*/
(function(){
  if (window.BshHoverVerse) return;

  /* ---------- styles (Builder tokens; overrides hub-modern's .bsh-vhover) ---------- */
  (function(){
    var st = document.createElement('style');
    st.id = 'bsh-vhover-style';
    st.textContent = `
.bsh-vhover{
  position:fixed;z-index:11000;max-width:420px;min-width:280px;
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:var(--r-md);
  box-shadow:var(--shadow-2);
  padding:14px 16px;
  font-family:var(--font-sans);
  color:var(--ink);
  animation:bsh-vh-in var(--dur-2) var(--ease-out);
  pointer-events:auto;
}
@keyframes bsh-vh-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.bsh-vhover .vh-ref{font-family:var(--font-sans);font-size:var(--t-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--accent);font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:8px}
body.theme-dark .bsh-vhover .vh-ref{color:var(--accent)}
.bsh-vhover .vh-ref .vh-actions{margin-left:auto;display:flex;gap:4px}
.bsh-vhover .vh-ref .vh-actions a{color:var(--ink-3);text-decoration:none;font-size:var(--t-xs);font-weight:600;padding:2px 8px;border-radius:var(--r-xs);background:var(--surface-2);transition:background var(--dur-1),color var(--dur-1)}
.bsh-vhover .vh-ref .vh-actions a:hover{background:var(--accent-tint);color:var(--accent)}
.bsh-vhover .vh-txt{font-size:var(--t-lg);line-height:1.55;font-family:var(--font-scripture);color:var(--ink)}
.bsh-vhover .vh-loader{color:var(--ink-3);font-style:italic;font-family:var(--font-sans);font-size:var(--t-sm)}

/* auto-detect verse refs — subtle underline */
.bsh-vref{
  border-bottom:1px dotted var(--border-strong);
  cursor:help;
  color:inherit;
}
.bsh-vref:hover{color:var(--accent);border-bottom-style:solid;border-bottom-color:var(--accent)}
body.theme-dark .bsh-vref:hover{color:var(--accent)}
.bsh-vhover .vh-bm{color:var(--ink-3)!important;background:transparent!important}
.bsh-vhover .vh-bm:hover{color:var(--accent)!important;background:var(--accent-tint)!important}
`;
    document.head.appendChild(st);
  })();

  /* verse data path — resolves relative to whichever tool we're in.
     Use root-relative so it works regardless of page depth. */
  function base(){
    return '/sermon/';
  }

  var BOOKS = null; // {id, name, abbr, vfile}
  var BOOK_ALIASES = null; // normalized-key -> id
  function normKey(s){ return s.toLowerCase().replace(/[.\s]/g,''); }

  function loadBooks(){
    if (BOOKS) return Promise.resolve(BOOKS);
    return fetch(base() + 'books.json').then(function(r){ return r.json(); }).then(function(arr){
      BOOKS = arr;
      BOOK_ALIASES = {};
      var alias = {
        GEN:['Genesis','Gen','Ge'], EXO:['Exodus','Exod','Exo','Ex'], LEV:['Leviticus','Lev','Lv'],
        NUM:['Numbers','Num','Nm'], DEU:['Deuteronomy','Deut','Deu','Dt'], JOS:['Joshua','Josh','Jos'],
        JDG:['Judges','Judg','Jdg','Jgs'], RUT:['Ruth','Rut','Ru'],
        '1SA':['1 Samuel','1 Sam','1Sam','1Sa','1S'], '2SA':['2 Samuel','2 Sam','2Sam','2Sa','2S'],
        '1KI':['1 Kings','1 Kgs','1Ki','1Kgs','1Kings','1K'], '2KI':['2 Kings','2 Kgs','2Ki','2Kgs','2Kings','2K'],
        '1CH':['1 Chronicles','1 Chron','1Ch','1Chr'], '2CH':['2 Chronicles','2 Chron','2Ch','2Chr'],
        EZR:['Ezra','Ezr'], NEH:['Nehemiah','Neh'], EST:['Esther','Esth','Est'],
        JOB:['Job','Jb'], PSA:['Psalms','Psalm','Ps','Pss'], PRO:['Proverbs','Prov','Pr','Prv'],
        ECC:['Ecclesiastes','Eccles','Eccl','Ecc','Ec','Qoh'], SNG:['Song of Solomon','Song of Songs','Song','SoS','So','Cant','Canticles'],
        ISA:['Isaiah','Isa','Is'], JER:['Jeremiah','Jer','Je'], LAM:['Lamentations','Lam'],
        EZK:['Ezekiel','Ezek','Eze','Ezk'], DAN:['Daniel','Dan','Dn'],
        HOS:['Hosea','Hos','Ho'], JOL:['Joel','Jl'], AMO:['Amos','Am'],
        OBA:['Obadiah','Obad','Oba','Ob'], JON:['Jonah','Jon','Jnh'], MIC:['Micah','Mi','Mic'],
        NAM:['Nahum','Nah','Na'], HAB:['Habakkuk','Hab'], ZEP:['Zephaniah','Zeph','Zep'],
        HAG:['Haggai','Hag'], ZEC:['Zechariah','Zech','Zec','Zc'], MAL:['Malachi','Mal'],
        MAT:['Matthew','Matt','Mt'], MRK:['Mark','Mk','Mar'], LUK:['Luke','Lk','Lu'],
        JHN:['John','Jn','Joh'], ACT:['Acts','Ac'], ROM:['Romans','Rom','Ro'],
        '1CO':['1 Corinthians','1 Cor','1Cor','1Co'], '2CO':['2 Corinthians','2 Cor','2Cor','2Co'],
        GAL:['Galatians','Gal','Ga'], EPH:['Ephesians','Eph'], PHP:['Philippians','Phil','Php'],
        COL:['Colossians','Col'], '1TH':['1 Thessalonians','1 Thess','1Thess','1Th'], '2TH':['2 Thessalonians','2 Thess','2Thess','2Th'],
        '1TI':['1 Timothy','1 Tim','1Tim','1Ti'], '2TI':['2 Timothy','2 Tim','2Tim','2Ti'],
        TIT:['Titus','Ti'], PHM:['Philemon','Phlm','Phm','Philem'],
        HEB:['Hebrews','Heb'], JAS:['James','Jas','Ja'],
        '1PE':['1 Peter','1 Pet','1Pet','1Pe','1P'], '2PE':['2 Peter','2 Pet','2Pet','2Pe','2P'],
        '1JN':['1 John','1 Jn','1Jn','1Jo'], '2JN':['2 John','2 Jn','2Jn','2Jo'], '3JN':['3 John','3 Jn','3Jn','3Jo'],
        JUD:['Jude','Jud','Jd'], REV:['Revelation','Rev','Rv','Apoc']
      };
      arr.forEach(function(b){ BOOK_ALIASES[normKey(b.name)] = b.id; if (b.abbr) BOOK_ALIASES[normKey(b.abbr)] = b.id; });
      Object.keys(alias).forEach(function(id){ alias[id].forEach(function(a){ BOOK_ALIASES[normKey(a)] = id; }); });
      return BOOKS;
    });
  }

  var _verseCache = {};
  function fetchBook(id){
    var b = (BOOKS||[]).find(function(x){return x.id===id;});
    if (!b) return Promise.resolve(null);
    if (_verseCache[id]) return _verseCache[id];
    _verseCache[id] = fetch(base() + b.vfile).then(function(r){return r.json();});
    return _verseCache[id];
  }

  function parseRef(str){
    if (!str) return null;
    str = String(str).trim().replace(/\s+/g,' ');
    var m = str.match(/^((?:[1-3]\s+)?[A-Za-z]+(?:\s+of\s+[A-Za-z]+)?)\s*\.?\s*(\d[\d:\-,\s]*)$/);
    if (!m) return null;
    var bookPart = m[1].trim();
    var spec = m[2].trim().replace(/\s+/g,'');
    if (!/^\d/.test(spec)) return null;
    if (!BOOK_ALIASES) return null;
    var id = BOOK_ALIASES[normKey(bookPart)];
    if (!id) return null;
    return { id: id, spec: spec };
  }

  function resolveVerses(id, spec){
    return fetchBook(id).then(function(arr){
      if (!arr) return [];
      var out = [];
      // simple parse — first chapter:verse pair or range
      var m = spec.match(/^(\d+)(?::(\d+)(?:-(\d+))?)?/);
      if (!m) return out;
      var c = +m[1]; var v1 = m[2]?+m[2]:null; var v2 = m[3]?+m[3]:v1;
      for (var i=0;i<arr.length;i++){
        var e = arr[i];
        if (e[0] !== c) continue;
        if (v1 == null || (e[1] >= v1 && e[1] <= v2)) out.push({c:e[0], v:e[1], words:e[2]});
        if (out.length > 10) break;
      }
      return out;
    });
  }

  function verseText(words){
    var out=''; var needSpace=false;
    for (var i=0;i<words.length;i++){
      var w = words[i];
      if (w === '¶') continue;
      if (w === '+') break;
      var isPunct = !/[\p{L}\p{N}]/u.test(w);
      var space = (needSpace && !isPunct) ? ' ' : '';
      if (w[0]==='(' && out && !/\s$/.test(out)) space=' ';
      if (out && /\($/.test(out) && !isPunct) space='';
      out += space + w;
      needSpace = true;
    }
    return out;
  }

  /* ---- card ---- */
  var card = null, hideTimer = null;
  function ensureCard(){
    if (card) return card;
    card = document.createElement('div');
    card.className = 'bsh-vhover';
    card.style.display = 'none';
    card.addEventListener('mouseenter', function(){ clearTimeout(hideTimer); });
    card.addEventListener('mouseleave', hideSoon);
    document.body.appendChild(card);
    return card;
  }
  function hideSoon(){ clearTimeout(hideTimer); hideTimer = setTimeout(hide, 180); }
  function hide(){ if (card) card.style.display = 'none'; }

  function bibleUrl(refStr){
    // Always route to the Reader (which parses ?ref=/#ref=), never the
    // homepage — /read/ is an absolute path so it works from any page.
    return '/read/?ref=' + encodeURIComponent(refStr);
  }

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function positionCard(anchor){
    var r = anchor.getBoundingClientRect();
    var c = card.getBoundingClientRect();
    var top = r.bottom + 8;
    var left = r.left;
    if (left + c.width > innerWidth - 12) left = Math.max(12, innerWidth - c.width - 12);
    if (top + c.height > innerHeight - 12) top = Math.max(12, r.top - c.height - 8);
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }

  function show(refStr, anchor){
    if (!refStr || !anchor) return;
    clearTimeout(hideTimer);
    loadBooks().then(function(){
      var parsed = parseRef(refStr);
      if (!parsed) return;
      ensureCard();
      card.innerHTML =
        '<div class="vh-ref">' + esc(refStr) +
          '<span class="vh-actions">' +
            '<a href="'+esc(bibleUrl(refStr))+'" target="_blank" rel="noopener" title="Open in Study Bible">read</a>' +
            (window.BshLibrary ? '<a href="#" class="vh-bm" data-lib-bm title="Bookmark verse">❋</a>' : '') +
          '</span>' +
        '</div>' +
        '<div class="vh-txt vh-loader">Loading…</div>';
      var bm = card.querySelector('[data-lib-bm]');
      if (bm) bm.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); if (window.BshLibrary) window.BshLibrary.toggleBookmark(refStr); });
      card.style.display = 'block';
      positionCard(anchor);
      resolveVerses(parsed.id, parsed.spec).then(function(vs){
        if (card.style.display === 'none') return;
        if (!vs.length) { card.querySelector('.vh-txt').textContent = 'Could not load verse.'; return; }
        var html = vs.map(function(v){ return '<sup style="color:var(--accent);font-weight:600;margin-right:3px">'+v.v+'</sup>'+esc(verseText(v.words)); }).join(' ');
        card.querySelector('.vh-txt').classList.remove('vh-loader');
        card.querySelector('.vh-txt').innerHTML = html;
        positionCard(anchor);
      }).catch(function(){ card.querySelector('.vh-txt').textContent = 'Failed to load.'; });
    });
  }

  /* ---- Auto-detect refs in text ---- */
  var REF_RE = /((?:1st|2nd|3rd|I{1,3}|1|2|3)\s*[.  ]?\s*)?([A-Z][a-z]+(?:\s+of\s+[A-Z][a-z]+)?|[A-Z][a-z]{1,4}\.?)\s+(\d{1,3})(?::(\d{1,3})(?:-(\d{1,3}))?)?/g;

  function scan(root){
    if (!root) root = document.body;
    loadBooks().then(function(){
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function(n){
          if (!n.nodeValue || n.nodeValue.length < 5) return NodeFilter.FILTER_REJECT;
          var p = n.parentNode; if (!p) return NodeFilter.FILTER_REJECT;
          if (p.closest && (p.closest('a, script, style, code, pre, .bsh-vref, .bsh-lib-panel, .acct-modal, .qj-modal, header.app, nav, .verse, .verses, .bn-editor, textarea, input, .refchip, .vcard .txt, .verse-num'))) return NodeFilter.FILTER_REJECT;
          if (!/[A-Za-z]\s*\.?\s*\d/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var batch = [], node;
      while ((node = walker.nextNode())) batch.push(node);
      batch.forEach(function(txt){
        var m, matches = []; REF_RE.lastIndex = 0;
        while ((m = REF_RE.exec(txt.nodeValue))) matches.push({idx:m.index, len:m[0].length, ref:m[0]});
        if (!matches.length) return;
        var frag = document.createDocumentFragment();
        var last = 0, s = txt.nodeValue;
        matches.forEach(function(mm){
          var candidate = mm.ref.trim();
          if (!parseRef(candidate)) return;
          if (last < mm.idx) frag.appendChild(document.createTextNode(s.slice(last, mm.idx)));
          var span = document.createElement('span');
          span.className = 'bsh-vref';
          span.textContent = candidate;
          span.setAttribute('data-ref', candidate);
          frag.appendChild(span);
          last = mm.idx + mm.len;
        });
        if (!frag.childNodes.length) return;
        if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
        try { txt.parentNode.replaceChild(frag, txt); } catch(e){}
      });
    });
  }

  /* Delegated hover handler for detected refs */
  document.addEventListener('mouseover', function(e){
    var t = e.target;
    if (t && t.classList && t.classList.contains('bsh-vref')) {
      show(t.getAttribute('data-ref'), t);
    }
  });
  document.addEventListener('mouseout', function(e){
    var t = e.target;
    if (t && t.classList && t.classList.contains('bsh-vref')) hideSoon();
  });

  /* Auto-scan on load + a lightweight MutationObserver for dynamic content */
  function ready(fn){ if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  ready(function(){
    loadBooks().then(function(){
      scan(document.body);
      var mo = new MutationObserver(function(muts){
        var toScan = new Set();
        muts.forEach(function(m){ m.addedNodes.forEach(function(n){ if (n.nodeType === 1 && n.textContent && n.textContent.length > 5) toScan.add(n); }); });
        if (toScan.size) requestAnimationFrame(function(){ toScan.forEach(function(n){ try { scan(n); } catch(e){} }); });
      });
      try { mo.observe(document.body, {subtree:true, childList:true}); } catch(e){}
    });
  });

  window.BshHoverVerse = { scan: scan, show: show, hide: hide };
})();
