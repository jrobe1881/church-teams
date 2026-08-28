/* topbar.js — Unified top-bar Tools dropdown for every Bible Parlor hub page.
   Depends on nothing. Idempotent. Runs after DOMContentLoaded and enhances
   the existing <header class="hub-topbar"> markup instead of rewriting it,
   so pages keep working if this script fails to load.

   What it does:
     1. For every .hub-topbar it finds, locates the right cluster (.hub-tb-r).
     2. Identifies tool-navigation anchors (Reader / Explorer / Strong's /
        Lexicon / Atlas / Builder / Connect) and removes them from the cluster.
     3. Inserts a single "Tools ▾" button that opens a labelled dropdown menu
        containing those same destinations, with the current tool disabled and
        marked as the active tool.
     4. Leaves #btnTheme, rail-toggles, sign-in fab, and everything else alone.

   Design goals:
     - Idempotent: mounting twice is a no-op.
     - Non-invasive: if the page has custom top-bar behavior, it still works.
     - Accessible: dropdown uses proper aria-* attributes and closes on Esc /
       outside-click. */

(function(){
  if (window.__BshTopbarMounted) return;
  window.__BshTopbarMounted = true;

  /* Canonical tool list. Order matters — this is the reading order for the
     dropdown. Icons stay Unicode for now (Wave 3 replaces them with SVG).
     Labels are resolved at render time via BpI18n so they update on lang switch. */
  var TOOLS = [
    { key:'reader',   labelKey:'nav.reader',    icon:'✦', href:'/read/' },
    { key:'explorer', labelKey:'nav.explorer',  icon:'✧', href:'/explorer/' },
    { key:'strongs',  labelKey:'nav.strongs',   icon:'§', href:'/strongs/' },
    { key:'lexicon',  labelKey:'nav.lexicon',   icon:'✎', href:'/wordstudy/' },
    { key:'atlas',    labelKey:'nav.atlas',     icon:'◈', href:'/atlas/' },
    { key:'builder',  labelKey:'nav.builder',   icon:'⊞', href:'/builder/' },
    { key:'connect',  labelKey:'nav.connect',   icon:'◉', href:'/connect/' },
    { key:'teams',    labelKey:'nav.teams',     icon:'❖', href:'/teams/', gate:'teams', badgeSource:'teams_pending' },
    { key:'journey',  labelKey:'nav.journey',   icon:'⌖', href:'/journey/' }
  ];

  /* Access University always appears in the Tools dropdown, for every
     visitor (public and signed-in). The AU landing page itself gates
     access by role, so there is no security concern in always listing it. */
  var AU_TOOL = { key:'access', labelKey:'nav.access', icon:'AU', href:'/access/' };

  /* Hardcoded English fallbacks used when the locale cache isn't loaded yet. */
  var LABEL_FALLBACKS = {
    'nav.reader':'Reader','nav.explorer':'Explorer',"nav.strongs":"Strong's",
    'nav.lexicon':'Lexicon','nav.atlas':'Atlas','nav.builder':'Builder',
    'nav.connect':'Connect','nav.teams':'Teams','nav.journey':'My Journey',
    'nav.access':'Access University',
    'nav.tools':'Tools','nav.current':'Current','nav.splitView':'Split view',
    'topbar.language':'Language',
    'topbar.myJourney':'My Study Journey',
    'topbar.activeStudy':'Active study: {title} \u2014 click to change'
  };

  /* Helper: resolve a label — uses i18n only when the locale is actually cached.
     Falls back to hardcoded English so the topbar never shows raw key strings. */
  function tLabel(t) {
    var I18N = window.BpI18n;
    if (I18N && I18N.t && window.__i18nCache && window.__i18nCache[I18N.lang]) {
      return I18N.t(t.labelKey);
    }
    return LABEL_FALLBACKS[t.labelKey] || t.labelKey;
  }

  /* Same guard for plain key lookups (not tool objects). */
  function tKey(key) {
    var I18N = window.BpI18n;
    if (I18N && I18N.t && window.__i18nCache && window.__i18nCache[I18N.lang]) {
      return I18N.t(key);
    }
    return LABEL_FALLBACKS[key] || key;
  }

  /* Detect the current tool from either a data attribute on <body> or the
     URL path. Data attribute wins so pages can override. */
  function currentTool(){
    var b = document.body;
    if (b && b.dataset && b.dataset.tool) return b.dataset.tool;
    var p = (location.pathname || '').toLowerCase();
    if (p.indexOf('/read/') === 0    || p === '/read')     return 'reader';
    if (p.indexOf('/explorer/') === 0|| p === '/explorer') return 'explorer';
    if (p.indexOf('/strongs/') === 0 || p === '/strongs')  return 'strongs';
    if (p.indexOf('/wordstudy/') === 0|| p === '/wordstudy')return 'lexicon';
    if (p.indexOf('/atlas/') === 0   || p === '/atlas')    return 'atlas';
    if (p.indexOf('/builder/') === 0 || p === '/builder')  return 'builder';
    if (p.indexOf('/connect/') === 0 || p === '/connect')  return 'connect';
    if (p.indexOf('/access/') === 0  || p === '/access')   return 'access';
    if (p.indexOf('/teams/') === 0   || p === '/teams')    return 'teams';
    if (p.indexOf('/journey/') === 0 || p === '/journey')  return 'journey';
    return '';
  }

  /* Match a link that navigates to one of the tools. Handles absolute (/read/),
     relative (../read/), and same-dir (index.html) paths. */
  function toolKeyOfHref(href){
    if (!href) return '';
    var h = String(href).toLowerCase();
    if (h.indexOf('/read')     !== -1) return 'reader';
    if (h.indexOf('/explorer') !== -1) return 'explorer';
    if (h.indexOf('/strongs')  !== -1) return 'strongs';
    if (h.indexOf('/wordstudy')!== -1) return 'lexicon';
    if (h.indexOf('/atlas')    !== -1) return 'atlas';
    if (h.indexOf('/builder')  !== -1) return 'builder';
    if (h.indexOf('/connect')  !== -1) return 'connect';
    if (h.indexOf('/access')   !== -1) return 'access';
    if (h.indexOf('/teams')    !== -1) return 'teams';
    if (h.indexOf('/journey')  !== -1) return 'journey';
    return '';
  }

  function closeAllMenus(except){
    document.querySelectorAll('.hub-tools-menu.open').forEach(function(m){
      if (m === except) return;
      m.classList.remove('open');
      var btn = m.previousElementSibling;
      if (btn && btn.classList.contains('hub-tools-btn')) {
        btn.setAttribute('aria-expanded','false');
      }
    });
  }

  /* Teams gating: Teams is its own independent tool. The icon is visible to
     ANY signed-in user (Bible Connect model) so they can register a church
     or join one. Signed-out users don't see it. Church admins get a numeric
     pending-approvals badge. AU membership does NOT grant Teams visibility;
     Teams membership does NOT grant AU visibility. Cached on window per session. */
  var SITE_ADMIN_ID = '91d864d1-5472-4c9c-9079-ca3f263f3995';
  function getTeamsGateState(){
    if (window.__bshTeamsGateState) return window.__bshTeamsGateState;
    var promise = (function(){
      if (!window.CloudAccount || !window.CloudAccount.ready) return Promise.resolve({ visible:false, pendingCount:0 });
      return window.CloudAccount.ready.then(function(){
        var user = window.CloudAccount.getUser ? window.CloudAccount.getUser() : null;
        if (!user) return { visible:false, pendingCount:0 };
        // Signed in → always show Teams. Compute badge for church admins.
        var sb = window.CloudAccount.getSupabaseClient ? window.CloudAccount.getSupabaseClient() : null;
        if (!sb) return { visible:true, pendingCount:0 };
        return sb.from('bst_members').select('id,role,status,church_id').eq('user_id', user.id).then(function(res){
          var rows = res.error ? [] : (res.data || []);
          var churchIds = rows.filter(function(m){ return m.role === 'church_admin' && m.status === 'active'; }).map(function(m){ return m.church_id; });
          if (!churchIds.length) return { visible:true, pendingCount:0 };
          return sb.from('bst_members').select('id', { count:'exact', head:true }).in('church_id', churchIds).eq('status','pending').then(function(cres){
            return { visible:true, pendingCount: cres.error ? 0 : (cres.count || 0) };
          });
        });
      }).catch(function(){ return { visible:true, pendingCount:0 }; });
    })();
    window.__bshTeamsGateState = promise;
    return promise;
  }

  function buildDropdown(cur){
    var wrap = document.createElement('div');
    wrap.className = 'hub-tools-wrap';

    var toolsBtnLabel = tKey('nav.tools');
    var currentBadge  = tKey('nav.current');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hub-icon-btn hub-tools-btn';
    btn.setAttribute('aria-haspopup','menu');
    btn.setAttribute('aria-expanded','false');
    btn.setAttribute('title', toolsBtnLabel);
    btn.setAttribute('aria-label', toolsBtnLabel);
    btn.innerHTML = '<span class="hub-tools-btn-lbl">' + toolsBtnLabel + '</span><span class="hub-tools-btn-caret" aria-hidden="true">▾</span>';

    var menu = document.createElement('div');
    menu.className = 'hub-tools-menu';
    menu.setAttribute('role','menu');
    menu.setAttribute('aria-label', toolsBtnLabel);

    TOOLS.concat([AU_TOOL]).forEach(function(t){
      if (t.gate === 'teams') return; // inserted asynchronously below once gate state resolves
      var isCur = t.key === cur;
      var row = document.createElement(isCur ? 'span' : 'a');
      row.className = 'hub-tools-item' + (isCur ? ' is-current' : '');
      row.setAttribute('role','menuitem');
      if (isCur){
        row.setAttribute('aria-current','page');
        row.setAttribute('tabindex','-1');
      } else {
        row.href = t.href;
        row.setAttribute('tabindex','0');
      }
      row.innerHTML =
        '<span class="hub-tools-item-icon" aria-hidden="true">' + t.icon + '</span>' +
        '<span class="hub-tools-item-lbl">' + tLabel(t) + '</span>' +
        (isCur ? '<span class="hub-tools-item-badge">' + currentBadge + '</span>' : '');
      menu.appendChild(row);
    });

    var teamsTool = TOOLS.filter(function(t){ return t.gate === 'teams'; })[0];
    if (teamsTool) {
      getTeamsGateState().then(function(state){
        if (!state.visible) return;
        var isCur = teamsTool.key === cur;
        var row = document.createElement(isCur ? 'span' : 'a');
        row.className = 'hub-tools-item' + (isCur ? ' is-current' : '');
        row.setAttribute('role','menuitem');
        if (isCur){
          row.setAttribute('aria-current','page');
          row.setAttribute('tabindex','-1');
        } else {
          row.href = teamsTool.href;
          row.setAttribute('tabindex','0');
        }
        var curBadge = tKey('nav.current');
        var badge = isCur
          ? '<span class="hub-tools-item-badge">' + curBadge + '</span>'
          : (state.pendingCount > 0 ? '<span class="hub-tools-item-badge hub-tools-item-badge-count">' + state.pendingCount + '</span>' : '');
        row.innerHTML =
          '<span class="hub-tools-item-icon" aria-hidden="true">' + teamsTool.icon + '</span>' +
          '<span class="hub-tools-item-lbl">' + tLabel(teamsTool) + '</span>' +
          badge;
        menu.appendChild(row);
      });
    }

    btn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      var wasOpen = menu.classList.contains('open');
      closeAllMenus(menu);
      if (wasOpen){
        menu.classList.remove('open');
        btn.setAttribute('aria-expanded','false');
      } else {
        menu.classList.add('open');
        btn.setAttribute('aria-expanded','true');
      }
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    wrap._menu = menu;
    return wrap;
  }

  function enhanceTopbar(header){
    if (!header || header.dataset.topbarEnhanced === '1') return;
    header.dataset.topbarEnhanced = '1';

    var right = header.querySelector('.hub-tb-r');
    if (!right) return;

    var cur = currentTool();

    /* Remove existing tool-navigation links from .hub-tb-r. Do NOT touch
       #btnTheme, rail-toggles, sign-in fab, or anything without a href
       matching a tool. */
    var removed = 0;
    Array.prototype.slice.call(right.children).forEach(function(child){
      if (child.tagName !== 'A') return;
      var href = child.getAttribute('href') || '';
      if (!toolKeyOfHref(href)) return;
      right.removeChild(child);
      removed++;
    });

    /* Also remove the redundant "back to Reader" ⌂ home button from the LEFT
       cluster on tool pages — its function is now covered by the Tools menu. */
    var left = header.querySelector('.hub-tb-l');
    if (left){
      Array.prototype.slice.call(left.children).forEach(function(child){
        if (child.classList && child.classList.contains('hub-home-btn')){
          left.removeChild(child);
        }
      });
    }

    /* Build a fixed anchor <span> as the first child of .hub-tb-r.
       All JS-injected items (Tools, Split, Journey) are inserted relative to
       this anchor so their visual order never depends on insertion timing:
         [anchor] [Tools ▾] [Split] [Journey] … [theme] [acct] [rail-toggle]
       The anchor itself is invisible (zero size) and carries no semantics. */
    var anchor = document.createElement('span');
    anchor.className = 'hub-tb-anchor';
    anchor.setAttribute('aria-hidden', 'true');
    right.insertBefore(anchor, right.firstChild);

    /* Tools dropdown — always sits immediately after the anchor. */
    var dd = buildDropdown(cur);
    anchor.insertAdjacentElement('afterend', dd);

    /* Language switcher — temporarily hidden; translation files are ready
       but the switcher UI is disabled until the full rollout. */
    // injectLangSwitcher(right);

    /* Split View button — desktop / tablet only. Suppress when we ARE the
       split shell or when embedded inside an iframe (split panes).
       Inserted after Tools so it always sits in slot 2. */
    var inSplitShell = /^\/split\/?/.test(location.pathname);
    var inIframe = false;
    try { inIframe = window.self !== window.top; } catch (_e) { inIframe = true; }
    if (!inSplitShell && !inIframe) {
      var splitViewLabel = tKey('nav.splitView');
      var splitBtn = document.createElement('button');
      splitBtn.type = 'button';
      splitBtn.className = 'hub-split-btn';
      splitBtn.setAttribute('aria-label', splitViewLabel);
      splitBtn.title = splitViewLabel;
      splitBtn.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<rect x="3"  y="5" width="7.5" height="14" rx="1.6"/>' +
          '<rect x="13.5" y="5" width="7.5" height="14" rx="1.6"/>' +
        '</svg>' +
        '<span class="hub-split-btn-lbl">' + splitViewLabel + '</span>';
      splitBtn.addEventListener('click', function(){
        var here = location.pathname + location.search + location.hash;
        var url = '/split/#L=' + encodeURIComponent(here) + '&R=/explorer/';
        location.href = url;
      });
      dd.insertAdjacentElement('afterend', splitBtn);
    }

    /* Journey icon button — signed-in only, hidden on the Journey page itself.
       Inserted after Split (or Tools if no Split) so it always sits in slot 3.
       Uses a placeholder <span> so the slot is reserved immediately and the
       button appearing async never shifts Tools or Split. */
    var journeyPlaceholder = null;
    var onJourneyPage = /^\/journey\/?/.test(location.pathname);
    if (!onJourneyPage && !inIframe) {
      // Reserve the journey slot right away so async auth never shifts earlier items
      journeyPlaceholder = document.createElement('span');
      journeyPlaceholder.className = 'hub-journey-slot';
      journeyPlaceholder.setAttribute('aria-hidden', 'true');
      var splitBtnEl = right.querySelector('.hub-split-btn');
      (splitBtnEl || dd).insertAdjacentElement('afterend', journeyPlaceholder);

      function ensureJourneyBtn(){
        var already = right.querySelector('.hub-journey-btn');
        var signedIn = !!(window.CloudAccount && window.CloudAccount.isSignedIn && window.CloudAccount.isSignedIn());
        if (signedIn && !already){
          var j = document.createElement('a');
          j.className = 'hub-journey-btn hub-icon-btn';
          j.href = '/journey/';
          var journeyLabel = tKey('topbar.myJourney');
          j.title = journeyLabel;
          j.setAttribute('aria-label', journeyLabel);
          // Compass rose — distinct from Explorer/Reader star icons.
          j.innerHTML =
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<circle cx="12" cy="12" r="9"/>' +
              '<polygon points="12,6 14.2,12 12,18 9.8,12" fill="currentColor" stroke="none"/>' +
              '<circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>' +
            '</svg>';
          // Replace the placeholder with the real button
          if (journeyPlaceholder && journeyPlaceholder.parentNode) {
            journeyPlaceholder.parentNode.replaceChild(j, journeyPlaceholder);
            journeyPlaceholder = j;
          } else {
            (splitBtnEl || dd).insertAdjacentElement('afterend', j);
          }
        } else if (!signedIn && already){
          // Replace button back with placeholder so the slot stays reserved
          var ph = document.createElement('span');
          ph.className = 'hub-journey-slot';
          ph.setAttribute('aria-hidden', 'true');
          already.parentNode.replaceChild(ph, already);
          journeyPlaceholder = ph;
        }
      }
      ensureJourneyBtn();
      if (window.CloudAccount) {
        if (window.CloudAccount.ready && window.CloudAccount.ready.then) {
          window.CloudAccount.ready.then(ensureJourneyBtn).catch(function(){});
        }
        if (window.CloudAccount.onAuthChange) window.CloudAccount.onAuthChange(ensureJourneyBtn);
      }
      // Also try again after account.js finishes bootstrapping
      setTimeout(ensureJourneyBtn, 800);
      setTimeout(ensureJourneyBtn, 2000);

      /* Active Study pill — floats left of the Journey button.
         Shows the active study name; click opens StudyPicker.openSelector().
         Only injected when study-picker.js is loaded on the page. */
      function ensureActiveStudyPill(){
        var pill = right.querySelector('.hub-active-study-pill');
        var JS = window.JourneyStudies;
        var SP = window.StudyPicker;
        if (!JS || !SP) return;   // study-picker not loaded on this page
        var active = JS.getActive && JS.getActive();
        if (!active) {
          if (pill) pill.remove();
          return;
        }
        if (!pill) {
          pill = document.createElement('button');
          pill.type = 'button';
          pill.className = 'hub-active-study-pill';
          pill.addEventListener('click', function (e) {
            e.stopPropagation();
            SP.openSelector();
          });
          // Insert before the journey slot/button (placeholder or real btn)
          var jSlot = right.querySelector('.hub-journey-btn, .hub-journey-slot');
          right.insertBefore(pill, jSlot || right.querySelector('#btnTheme') || right.firstChild);
        }
        var pillLabel = tKey('topbar.activeStudy').replace('{title}', active.title);
        pill.title = pillLabel;
        pill.setAttribute('aria-label', 'Active study: ' + active.title);
        pill.innerHTML =
          '<span class="hub-asp-dot" aria-hidden="true"></span>' +
          '<span class="hub-asp-name">' + (active.title.length > 22
            ? active.title.slice(0, 20) + '\u2026'
            : active.title) + '</span>';
      }

      // Inject pill CSS once
      if (!document.getElementById('hub-asp-style')) {
        var aspStyle = document.createElement('style');
        aspStyle.id = 'hub-asp-style';
        aspStyle.textContent = [
          '.hub-active-study-pill{display:inline-flex;align-items:center;gap:5px;',
          'padding:5px 10px 5px 8px;',
          'background:var(--surface,#fff);color:var(--ink-2,#555);',
          'border:1px solid var(--border,#e5e5e5);border-radius:999px;',
          'font:600 11px/1 var(--font-sans,"Inter",system-ui);',
          'cursor:pointer;max-width:22ch;overflow:hidden;',
          'transition:border-color .13s,background .13s,color .13s;',
          'white-space:nowrap;}',
          '.hub-active-study-pill:hover{border-color:var(--accent,#7a1f2b);',
          'background:rgba(122,31,43,.06);color:var(--accent,#7a1f2b);}',
          '.hub-asp-dot{width:6px;height:6px;border-radius:50%;',
          'background:var(--accent,#7a1f2b);flex:0 0 auto;}',
          '.hub-asp-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
          '@media(max-width:700px){.hub-active-study-pill{display:none;}}'
        ].join('');
        document.head.appendChild(aspStyle);
      }

      // Wire updates: re-check when JourneyStudies fires onChange
      function wireStudyPill() {
        ensureActiveStudyPill();
        if (window.JourneyStudies && window.JourneyStudies.onChange) {
          window.JourneyStudies.onChange(ensureActiveStudyPill);
        }
      }
      setTimeout(wireStudyPill, 500);
      setTimeout(wireStudyPill, 1500);
    }
  }

  /* ---- Language Switcher ---- */
  function buildLangMenu(){
    var I18N = window.BpI18n;
    var locales = I18N ? I18N.LOCALES : [
      { code:'en', nativeName:'English' },
      { code:'es', nativeName:'Español' }
    ];
    var curLang = I18N ? I18N.lang : (function(){ try{ return localStorage.getItem('bsh_lang_v1')||'en'; }catch(e){return 'en';} })();

    var wrap = document.createElement('div');
    wrap.className = 'hub-lang-wrap';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hub-icon-btn hub-lang-btn';
    btn.setAttribute('aria-haspopup','menu');
    btn.setAttribute('aria-expanded','false');
    var langLabel = tKey('topbar.language');
    btn.setAttribute('title', langLabel);
    btn.setAttribute('aria-label', langLabel);
    // Globe icon (Unicode)
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>';

    var menu = document.createElement('div');
    menu.className = 'hub-lang-menu';
    menu.setAttribute('role','menu');
    menu.setAttribute('aria-label', langLabel);

    locales.forEach(function(loc){
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'bp-lang-item hub-tools-item' + (loc.code === curLang ? ' is-active' : '');
      item.dataset.langCode = loc.code;
      item.dataset.langName = loc.nativeName;
      item.setAttribute('role','menuitemradio');
      item.setAttribute('aria-checked', loc.code === curLang ? 'true' : 'false');
      item.setAttribute('tabindex','0');
      item.innerHTML =
        '<span class="hub-tools-item-lbl">' + (loc.code === curLang ? '✓ ' : '') + loc.nativeName + '</span>';
      item.addEventListener('click', function(){
        // BpI18n.setLang saves to localStorage and reloads — full page re-render in new language
        if (window.BpI18n) { window.BpI18n.setLang(loc.code); }
        else { try{ localStorage.setItem('bsh_lang_v1', loc.code); }catch(e){} location.reload(); }
      });
      menu.appendChild(item);
    });

    function closeLangMenu(){
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded','false');
    }
    btn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      var wasOpen = menu.classList.contains('open');
      closeAllMenus();
      if (wasOpen){
        closeLangMenu();
      } else {
        menu.classList.add('open');
        btn.setAttribute('aria-expanded','true');
      }
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    return wrap;
  }

  function injectLangSwitcher(right){
    if (right.querySelector('.hub-lang-wrap')) return; // already present
    var langWrap = buildLangMenu();
    // Place it just before #btnTheme if present, otherwise before end
    var themeBtn = right.querySelector('#btnTheme');
    if (themeBtn) {
      right.insertBefore(langWrap, themeBtn);
    } else {
      right.appendChild(langWrap);
    }
  }

  function isEmbeddedInSplit(){
    try {
      if (/[?&]embed=split\b/.test(location.search)) return true;
      if (window.self !== window.top) {
        // Direct parent is the split shell?
        var ref = document.referrer || '';
        if (/^https?:\/\/[^/]+\/split\/?/.test(ref)) return true;
      }
    } catch (_e) {}
    return false;
  }

  function mountAll(){
    if (isEmbeddedInSplit()){
      // In split-view panes the split shell owns the chrome so we don't want
      // the full site topbar.  But the topbar also carries the mobile rail-
      // toggle buttons (hub-mobile-menu), which are the only way to open
      // sidebars in a narrow embedded pane.
      // Solution: collapse the topbar to a slim rail-only strip and hide
      // everything inside it except the toggle buttons.
      document.querySelectorAll('header.hub-topbar').forEach(function(h){
        h.classList.add('bp-embed-topbar');
      });
      document.documentElement.classList.add('bp-embed-split');
      // Also add embed-split to <body> so Quick Jump FAB / notebook drawer
      // hide rules (which check body.embed-split) work correctly.
      document.body.classList.add('embed-split');
      return;
    }
    document.querySelectorAll('header.hub-topbar').forEach(enhanceTopbar);
  }

  document.addEventListener('click', function(e){
    if (e.target.closest && e.target.closest('.hub-tools-menu')) return;
    if (e.target.closest && e.target.closest('.hub-tools-btn')) return;
    if (e.target.closest && e.target.closest('.hub-lang-menu')) return;
    if (e.target.closest && e.target.closest('.hub-lang-btn')) return;
    closeAllMenus();
    document.querySelectorAll('.hub-lang-menu.open').forEach(function(m){
      m.classList.remove('open');
      var b = m.previousElementSibling;
      if (b) b.setAttribute('aria-expanded','false');
    });
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') closeAllMenus();
  });

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }

  /* When the i18n locale finishes loading (async fetch), re-render the topbar
     so labels that were built with empty cache now show translated text. */
  document.addEventListener('i18n:changed', function(){
    document.querySelectorAll('header.hub-topbar[data-topbar-enhanced="1"]').forEach(function(h){
      delete h.dataset.topbarEnhanced;
      h.querySelectorAll('.hub-tb-anchor,.hub-journey-slot,.hub-tools-wrap,.hub-split-btn,.hub-lang-wrap,.hub-journey-btn,.hub-active-study-pill').forEach(function(el){ el.remove(); });
    });
    document.querySelectorAll('header.hub-topbar').forEach(enhanceTopbar);
  });

})();
