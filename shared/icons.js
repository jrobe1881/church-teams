/* Bible Parlor — shared icon set (Wave 3a).
 *
 * Small inline SVG icon library. Replaces the Unicode glyphs previously used
 * in top-bar buttons and rail tool navs with clean, uniform stroke icons.
 *
 * Runs after DOM ready. Idempotent (skips already-processed elements via
 * data-icon-wired). Safe to load on every page.
 *
 * Design constraints:
 *  - stroke="currentColor" so icons inherit theme color
 *  - viewBox=24 24, stroke-width=1.75, rounded caps/joins
 *  - fixed 20x20 render size in .hub-icon-btn, 16x16 in rail nav
 *  - never changes button ID, class, event handlers, or aria-label
 */
(function () {
  'use strict';

  /* -------- Icon library (Lucide-style, hand-authored) -------- */
  var SVG = {
    // Book open — Reader/Home
    'book-open':
      '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    // Hash — Strong's
    'hash':
      '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
    // Book with A — Lexicon
    'book-a':
      '<path d="M12 7v14"/><path d="M16 8v-3a1 1 0 0 0-1-1h-3a1 1 0 0 0-1 1v3"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    // Map — Atlas
    'map':
      '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
    // Users — Connect
    'users':
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    // Sparkles — Tray
    'sparkles':
      '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
    // Menu — hamburger
    'menu':
      '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
    // Search
    'search':
      '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    // Sun/moon — theme toggle
    'sun-moon':
      '<path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/><path d="M12 8a4 4 0 1 0 4 4"/>',
    // Download — Export
    'download':
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    // User — sign in
    'user':
      '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    // Panel right — right-rail toggle
    'panel-right':
      '<rect width="18" height="18" x="3" y="3" rx="2"/><line x1="15" x2="15" y1="3" y2="21"/>',
    // Bookmark — bookmarks
    'bookmark':
      '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    // Notebook
    'notebook':
      '<path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M16 2v20"/>',
  };

  function svg(name, size){
    size = size || 20;
    var inner = SVG[name]; if(!inner) return '';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+inner+'</svg>';
  }

  /* -------- Glyph → icon mapping -------- */
  // Match by aria-label first (most reliable), then fall back to textContent.
  // aria-label values are the source of truth in the shared topbar; do NOT
  // change them here.
  var LABEL_MAP = {
    // top-bar
    'reader':'book-open','back to reader':'book-open','home':'book-open',
    "strong's":'hash','strongs':'hash',
    'lexicon':'book-a',
    'atlas':'map',
    'connect':'users',
    'toggle tray and tools panel':'sparkles','tray and tools':'sparkles','tray':'sparkles',
    'toggle outline':'menu','open menu':'menu','toggle rail':'menu','menu':'menu','open sidebar':'menu',
    'search':'search','search (⌘k)':'search','quick jump':'search',
    'toggle theme':'sun-moon','theme':'sun-moon',
    'sign in':'user','account menu':'user',
    // right-rail toggle in Reader/Explorer
    'toggle right rail':'panel-right','open study rail':'panel-right',
    // reader
    'bookmark this verse':'bookmark',
    'open notebook':'notebook','notebook':'notebook',
  };

  var GLYPH_MAP = {
    '\u2302':'book-open',   // ⌂
    '\u00a7':'hash',        // §
    '\u270e':'book-a',      // ✎
    '\u25c8':'map',          // ◈
    '\u25c9':'users',        // ◉
    '\u2727':'sparkles',    // ✧
    '\u2630':'menu',        // ☰
    '\u2315':'search',      // ⌕
    '\u25d0':'sun-moon',    // ◐
    '\u2193':'download',    // ↓
    '\u25cb':'user',        // ○
    '\u2637':'panel-right', // ☷
  };

  function pickIcon(el){
    // 1. aria-label
    var lbl = (el.getAttribute('aria-label')||'').trim().toLowerCase();
    if (lbl && LABEL_MAP[lbl]) return LABEL_MAP[lbl];
    // 2. title attribute
    var t = (el.getAttribute('title')||'').trim().toLowerCase();
    if (t && LABEL_MAP[t]) return LABEL_MAP[t];
    // 3. textContent glyph
    var txt = (el.textContent||'').trim();
    for (var i=0;i<txt.length;i++){
      var ch = txt.charAt(i);
      if (GLYPH_MAP[ch]) return GLYPH_MAP[ch];
    }
    return null;
  }

  function replaceGlyphIn(el, size){
    if (el.dataset.iconWired === '1') return;
    // Don't touch the brand glyph (✦) — it's the site's identity.
    var text = (el.textContent||'').trim();
    if (text === '\u2726' || text === '\u2727') {
      // Only spare ✦ in .hub-brand-glyph; sparkles class ✧ inside toggle should convert.
      if (el.classList.contains('hub-brand-glyph')) { el.dataset.iconWired='1'; return; }
    }
    // Skip buttons that already contain rich SVG or other elements we shouldn't overwrite.
    if (el.querySelector('svg')) { el.dataset.iconWired='1'; return; }
    var name = pickIcon(el);
    if (!name) return;
    el.dataset.originalGlyph = text;
    el.innerHTML = svg(name, size);
    el.dataset.iconWired = '1';
  }

  function upgrade(){
    // 1. All .hub-icon-btn top-bar buttons — 20px SVG
    document.querySelectorAll('.hub-icon-btn').forEach(function(b){ replaceGlyphIn(b, 20); });
    // 2. Rail tool nav <a>/<button> — the leading .tool-glyph span
    document.querySelectorAll('.rail-tools-nav .tool-glyph, .hub-tools-menu-item .hub-tools-menu-ic').forEach(function(g){
      // These wrappers just hold a glyph char; the parent anchor's label determines icon.
      if (g.dataset.iconWired === '1') return;
      var parent = g.closest('a,button');
      if (!parent) return;
      var lbl = (parent.textContent||'').trim().replace(/\s+/g,' ').toLowerCase();
      // Try derive from the parent text after stripping the glyph itself.
      var lookup = null;
      Object.keys(LABEL_MAP).some(function(k){
        if (lbl.indexOf(k) !== -1){ lookup = LABEL_MAP[k]; return true; }
        return false;
      });
      if (!lookup) {
        var raw = (g.textContent||'').trim();
        for (var i=0;i<raw.length;i++){ if(GLYPH_MAP[raw.charAt(i)]){ lookup = GLYPH_MAP[raw.charAt(i)]; break; } }
      }
      if (!lookup) return;
      g.innerHTML = svg(lookup, 16);
      g.classList.add('has-svg');
      g.dataset.iconWired = '1';
    });
    // 3. Rail toggle buttons ([data-rail-toggle], .hub-mobile-menu) already covered by .hub-icon-btn.
  }

  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function(){
    upgrade();
    // Watch for late-mounted topbar/tools items (topbar.js injects .hub-tools-btn after DOMContentLoaded).
    if ('MutationObserver' in window){
      var mo = new MutationObserver(function(){ upgrade(); });
      mo.observe(document.body, {childList:true, subtree:true});
      // Stop observing after 5s to keep this cheap.
      setTimeout(function(){ mo.disconnect(); }, 5000);
    }
  });
})();
