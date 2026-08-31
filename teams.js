/* /teams/teams.js — Shared Teams module context.
   Exposes window.TeamsCtx, used by every /teams/ page.
   Roles: church_admin, teacher (only two — no team_lead, no viewer).
   All DB access goes through existing RPCs or RLS-guarded selects —
   no client-side permission logic decides what data is fetched, only
   what UI is rendered. */
(function(){
  if (window.TeamsCtx) return;

  var SITE_ADMIN_ID = '91d864d1-5472-4c9c-9079-ca3f263f3995';

  var resolveReady;
  var ready = new Promise(function(res){ resolveReady = res; });

  var ctx = {
    ready: ready,
    user: null,
    memberships: [],
    activeChurchId: null,
    activeMember: null,
    isSiteAdmin: false,
    isChurchAdmin: false,
    isTeacher: false,
    hasTeamsAccess: false,
    isPending: false,
    sb: null
  };

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function getSb(){
    if (ctx.sb) return ctx.sb;
    if (window.CloudAccount && window.CloudAccount.getSupabaseClient && window.CloudAccount.getSupabaseClient()){
      ctx.sb = window.CloudAccount.getSupabaseClient();
    }
    return ctx.sb;
  }

  function setActiveChurch(id){
    ctx.activeChurchId = id;
    var m = ctx.memberships.filter(function(x){ return x.church_id === id; })[0] || null;
    ctx.activeMember = m;
    recomputeFlags();
    try { (window.safeLS || localStorage).setItem('teams_active_church_v1', id || ''); } catch(e){}
  }

  function recomputeFlags(){
    ctx.isChurchAdmin = !!(ctx.activeMember && ctx.activeMember.role === 'church_admin' && ctx.activeMember.status === 'active') || ctx.isSiteAdmin;
    ctx.isTeacher = !!(ctx.activeMember && ctx.activeMember.role === 'teacher' && ctx.activeMember.status === 'active');
    ctx.hasTeamsAccess = ctx.isSiteAdmin || ctx.memberships.some(function(m){ return m.active && m.status === 'active'; });
    ctx.isPending = !ctx.hasTeamsAccess && ctx.memberships.some(function(m){ return m.status === 'pending'; });
  }

  function loadMemberships(){
    var sb = getSb();
    if (!sb || !ctx.user) { ctx.memberships = []; recomputeFlags(); return Promise.resolve([]); }
    return sb.from('bst_members')
      .select('id,church_id,role,status,active,user_id,bst_churches!bst_members_church_id_fkey(name,slug)')
      .eq('user_id', ctx.user.id)
      .then(function(res){
        if (res.error) { console.error('[Teams] loadMemberships error', res.error); ctx.memberships = []; recomputeFlags(); return []; }
        ctx.memberships = (res.data || []).map(function(r){
          return {
            id: r.id,
            church_id: r.church_id,
            church_name: r.bst_churches ? r.bst_churches.name : '',
            church_slug: r.bst_churches ? r.bst_churches.slug : '',
            role: r.role,
            status: r.status,
            active: r.active
          };
        });
        // Pick active church: prior choice if still valid, else first active membership, else first membership.
        var stored = null;
        try { stored = (window.safeLS || localStorage).getItem('teams_active_church_v1'); } catch(e){}
        var pick = ctx.memberships.filter(function(m){ return m.church_id === stored; })[0]
          || ctx.memberships.filter(function(m){ return m.active && m.status === 'active'; })[0]
          || ctx.memberships[0]
          || null;
        ctx.activeChurchId = pick ? pick.church_id : null;
        ctx.activeMember = pick || null;
        recomputeFlags();
        return ctx.memberships;
      });
  }

  function injectSubbarProfileLink(){
    // Only inject when the user has an active church membership and is not
    // already on the profile page (we don't need a self-link).
    if (!ctx.hasTeamsAccess) return;
    if ((location.pathname || '').indexOf('/profile') === 0) return;
    var slot = document.querySelector('.teams-subbar-actions');
    if (!slot) return;
    if (slot.querySelector('[data-teams-profile-link]')) return;
    var a = document.createElement('a');
    a.className = 'teams-btn teams-btn-sm teams-btn-secondary';
    a.href = '/profile/';
    a.textContent = 'Profile';
    a.setAttribute('data-teams-profile-link', '1');
    slot.appendChild(a);
  }

  function init(){
    var CA = window.CloudAccount;
    if (!CA) { resolveReady(); return; }
    CA.ready.then(function(){
      ctx.user = CA.getUser();
      ctx.isSiteAdmin = !!(ctx.user && ctx.user.id === SITE_ADMIN_ID);
      var sb = getSb();
      if (!sb) { recomputeFlags(); resolveReady(); return; }
      if (!ctx.user) { recomputeFlags(); resolveReady(); return; }
      loadMemberships().then(function(){
        try { injectSubbarProfileLink(); } catch(e){}
        resolveReady();
      });
    }).catch(function(){ resolveReady(); });

    CA.onAuthChange && CA.onAuthChange(function(user){
      ctx.user = user;
      ctx.isSiteAdmin = !!(user && user.id === SITE_ADMIN_ID);
      if (!user) { ctx.memberships = []; ctx.activeChurchId = null; ctx.activeMember = null; recomputeFlags(); return; }
      loadMemberships();
    });
  }

  function requireAccess(mountEl, opts){
    opts = opts || {};
    if (!ctx.hasTeamsAccess) {
      if (mountEl) mountEl.innerHTML =
        '<div class="teams-empty">' +
          '<span class="teams-empty-glyph" aria-hidden="true">\u2756</span>' +
          '<h2>Teams access needed</h2>' +
          '<p>You need an active church membership to view this page.</p>' +
          '<a class="teams-btn" href="/">Go to Teams</a>' +
        '</div>';
      return false;
    }
    if (opts.adminOnly && !ctx.isChurchAdmin) {
      if (mountEl) mountEl.innerHTML =
        '<div class="teams-empty">' +
          '<span class="teams-empty-glyph" aria-hidden="true">\u2756</span>' +
          '<h2>Admins only</h2>' +
          '<p>This page is only available to church admins.</p>' +
          '<a class="teams-btn" href="/">Go to Teams</a>' +
        '</div>';
      return false;
    }
    return true;
  }

  function buildTabList(activeKey, opts){
    opts = opts || {};
    var tabs = [
      { key:'dashboard', label:'Dashboard', glyph:'\u2756', href:'/dashboard/' },
      { key:'students',  label:'Prospects', glyph:'\u25A4', href:'/students/' },
      { key:'schedule',  label:'Schedule',  glyph:'\u25F7', href:'/schedule/' },
      { key:'notices',   label:'Notices',   glyph:'\u25A3', href:'/notices/' },
      { key:'sop',       label:'SOP',       glyph:'\u2637', href:'/sop/' },
      { key:'tasks',     label:'Tasks',     glyph:'\u2611', href:'/tasks/', badge: opts.tasksBadge || 0 }
    ];
    // Church admins (and site admin) see Baptisms, Insights and Admin tabs.
    if (ctx.isChurchAdmin || ctx.isSiteAdmin) {
      tabs.push({ key:'baptisms', label:'Baptisms', glyph:'\u25CE', href:'/baptisms/' });
      tabs.push({ key:'insights', label:'Insights', glyph:'\u25D1', href:'/insights/' });
    }
    if (ctx.isChurchAdmin) {
      tabs.push({ key:'admin', label:'Admin', glyph:'\u25C8', href:'/admin/', badge: opts.adminBadge || 0 });
    }
    return tabs;
  }

  /* ── Sidebar navigation ──────────────────────────────────────────────────
     Renders a vertical sidebar nav into #teamsTabbarSlot.
     On desktop (>720px) it is always visible as a left-side column.
     On mobile (≤720px) it is hidden and toggled open via .teams-sidenav--open. */
  function sideNav(activeKey, opts){
    var tabs = buildTabList(activeKey, opts);
    var html = '<nav class="teams-sidenav" id="teamsSidenav" aria-label="Teams navigation">' +
      tabs.map(function(t){
        var cur = t.key === activeKey;
        var badgeHtml = (t.badge && t.badge > 0) ? '<span class="teams-nav-badge" aria-label="' + t.badge + ' pending">' + t.badge + '</span>' : '';
        return '<a href="' + t.href + '"' + (cur ? ' aria-current="page"' : '') + '>' +
          '<span class="teams-sidenav-glyph" aria-hidden="true">' + t.glyph + '</span>' +
          '<span class="teams-sidenav-label">' + esc(t.label) + badgeHtml + '</span>' +
        '</a>';
      }).join('') +
    '</nav>' +
    '<div class="teams-sidenav-backdrop" id="teamsSidenavBackdrop" aria-hidden="true"></div>';
    return html;
  }

  /* Backward-compat alias — keeps existing page JS (dashboard.js etc.) working. */
  function bottomTabs(activeKey, opts){
    return sideNav(activeKey, opts);
  }

  /* Inject the hamburger toggle button into the subbar so users can open
     the sidebar on mobile. Called once after the DOM is ready. */
  function injectSidenavToggle(){
    // Avoid double-injection.
    if (document.getElementById('teamsSidenavToggle')) return;
    var subbar = document.querySelector('.teams-subbar');
    if (!subbar) return;
    var btn = document.createElement('button');
    btn.id = 'teamsSidenavToggle';
    btn.className = 'teams-btn teams-btn-secondary teams-btn-sm teams-sidenav-toggle';
    btn.setAttribute('aria-label', 'Open navigation menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'teamsSidenav');
    btn.innerHTML = '<span aria-hidden="true">&#9776;</span>';
    // Prepend so it appears at the far left of the subbar actions area.
    subbar.insertBefore(btn, subbar.firstChild);
    btn.addEventListener('click', openSidenav);
  }

  var _sidenavOpen = false;
  /* Saved scroll position so iOS doesn't jump when we lock/unlock the body */
  var _savedScrollY = 0;

  /* ── Body scroll lock (iOS PWA) ──────────────────────────────────────────
     iOS Safari doesn't respect overflow:hidden on <body> for touch events.
     The standard fix is position:fixed + top offset, then restore on close. */
  function _lockBodyScroll(){
    if (document.body.classList.contains('teams-body-locked')) return;
    _savedScrollY = window.scrollY || window.pageYOffset;
    document.body.style.top = '-' + _savedScrollY + 'px';
    document.body.classList.add('teams-body-locked');
  }

  function _unlockBodyScroll(){
    if (!document.body.classList.contains('teams-body-locked')) return;
    document.body.classList.remove('teams-body-locked');
    document.body.style.top = '';
    // Restore scroll position without visible jump
    window.scrollTo(0, _savedScrollY);
  }

  function openSidenav(){
    var nav = document.getElementById('teamsSidenav');
    var backdrop = document.getElementById('teamsSidenavBackdrop');
    var toggle = document.getElementById('teamsSidenavToggle');
    if (!nav) return;
    // Only lock scroll on mobile (drawer mode); desktop sidebar never locks.
    if (window.innerWidth <= 720) _lockBodyScroll();
    nav.classList.add('teams-sidenav--open');
    if (backdrop) backdrop.classList.add('teams-sidenav-backdrop--open');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    _sidenavOpen = true;
    document.addEventListener('keydown', _sidenavEscHandler);
    // Wire swipe-to-close once the drawer is open.
    _wireSidenavSwipe(nav);
  }

  function closeSidenav(){
    var nav = document.getElementById('teamsSidenav');
    var backdrop = document.getElementById('teamsSidenavBackdrop');
    var toggle = document.getElementById('teamsSidenavToggle');
    if (!nav) return;
    nav.classList.remove('teams-sidenav--open');
    // Reset any inline transform left by a partial swipe.
    nav.style.transform = '';
    if (backdrop) backdrop.classList.remove('teams-sidenav-backdrop--open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    _sidenavOpen = false;
    _unlockBodyScroll();
    document.removeEventListener('keydown', _sidenavEscHandler);
    _unwireSidenavSwipe(nav);
  }

  function _sidenavEscHandler(e){
    if (e.key === 'Escape') closeSidenav();
  }

  /* ── Swipe-to-close gesture ──────────────────────────────────────────────
     Left-swipe on the open drawer closes it. The drawer follows the finger
     in real time; if the user releases past the threshold it snaps shut,
     otherwise it snaps back open.
     · Only active on mobile (innerWidth ≤ 720) to avoid interfering with
       desktop mouse drags.
     · Uses passive:false on touchmove to call preventDefault() and prevent
       the page from also scrolling while the drawer is being swiped. */
  var _swipeStartX = 0, _swipeStartY = 0, _swipeDragging = false;
  /* Track velocity: sample the last two move events to compute px/ms. */
  var _swipePrevX = 0, _swipePrevT = 0, _swipeVelX = 0;

  function _onNavTouchStart(e){
    if (window.innerWidth > 720) return;
    _swipeStartX = _swipePrevX = e.touches[0].clientX;
    _swipeStartY = e.touches[0].clientY;
    _swipePrevT  = Date.now();
    _swipeVelX   = 0;
    _swipeDragging = false;
  }

  function _onNavTouchMove(e){
    if (window.innerWidth > 720) return;
    var nav = document.getElementById('teamsSidenav');
    if (!nav) return;
    var cx = e.touches[0].clientX;
    var dx = cx - _swipeStartX;
    var dy = e.touches[0].clientY - _swipeStartY;
    // Sample instantaneous velocity (px per ms) from successive move events.
    var now = Date.now();
    var dt = now - _swipePrevT;
    if (dt > 0) _swipeVelX = (cx - _swipePrevX) / dt;
    _swipePrevX = cx;
    _swipePrevT = now;
    // Lock into horizontal-swipe mode once the intent is clear (>8px lateral).
    // Bail out if the dominant direction is vertical (user is scrolling the nav).
    if (!_swipeDragging) {
      if (Math.abs(dx) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) return; // vertical scroll intent
      _swipeDragging = true;
    }
    // Only track leftward swipes (closing direction).
    if (dx >= 0) return;
    e.preventDefault(); // stop page scroll while dragging the drawer
    // Follow finger; clamp so the drawer can't go further right than its rest pos.
    nav.style.transition = 'none';
    nav.style.transform = 'translateX(' + Math.max(dx, -nav.offsetWidth) + 'px)';
    // Fade backdrop proportionally with swipe progress.
    var backdrop = document.getElementById('teamsSidenavBackdrop');
    if (backdrop) {
      var progress = 1 + dx / nav.offsetWidth; // 1.0 → 0.0 as dx → -width
      backdrop.style.opacity = Math.max(0, progress) * 0.5;
    }
  }

  function _onNavTouchEnd(e){
    if (window.innerWidth > 720 || !_swipeDragging) return;
    var nav = document.getElementById('teamsSidenav');
    if (!nav) return;
    var dx = e.changedTouches[0].clientX - _swipeStartX;
    _swipeDragging = false;
    nav.style.transition = '';   // re-enable CSS transition
    var backdrop = document.getElementById('teamsSidenavBackdrop');
    if (backdrop) backdrop.style.opacity = ''; // restore CSS transition opacity
    // Close when swiped past 35% of drawer width OR flicked fast to the left.
    // _swipeVelX is px/ms — negative means leftward.
    if (dx < -(nav.offsetWidth * 0.35) || _swipeVelX < -0.4) {
      closeSidenav();
    } else {
      // Snap back to fully open.
      nav.style.transform = 'translateX(0)';
    }
  }

  function _wireSidenavSwipe(nav){
    nav.addEventListener('touchstart',  _onNavTouchStart, { passive:true });
    nav.addEventListener('touchmove',   _onNavTouchMove,  { passive:false });
    nav.addEventListener('touchend',    _onNavTouchEnd,   { passive:true });
    nav.addEventListener('touchcancel', _onNavTouchEnd,   { passive:true });
  }

  function _unwireSidenavSwipe(nav){
    nav.removeEventListener('touchstart',  _onNavTouchStart);
    nav.removeEventListener('touchmove',   _onNavTouchMove);
    nav.removeEventListener('touchend',    _onNavTouchEnd);
    nav.removeEventListener('touchcancel', _onNavTouchEnd);
  }

  /* ── Nav loading overlay ────────────────────────────────────────────────────
     Injects a full-screen overlay with a spinning ❖ diamond.
     - On page ENTER: overlay is visible immediately, then fades out once
       the body finishes its page-in animation.
     - On tab tap (EXIT): overlay reappears before navigation so the user
       sees the spinner instead of a black flash while the next page loads. */
  var _loaderEl = null;

  function getLoader(){
    if (_loaderEl && _loaderEl.parentNode) return _loaderEl;
    _loaderEl = document.createElement('div');
    _loaderEl.className = 'teams-nav-loader';
    _loaderEl.setAttribute('aria-hidden', 'true');
    _loaderEl.innerHTML = '<span class="teams-nav-loader__diamond">❖</span>';
    document.body.appendChild(_loaderEl);
    return _loaderEl;
  }

  function showLoader(){
    var el = getLoader();
    el.classList.remove('teams-nav-loader--done');
    el.style.opacity = '1';
    el.style.transition = 'none'; // instant show
  }

  function hideLoader(){
    var el = getLoader();
    // Re-enable transition then fade out.
    el.style.transition = '';
    el.classList.add('teams-nav-loader--done');
    // Remove from DOM after transition so it can't block taps.
    setTimeout(function(){
      if (el.parentNode) el.parentNode.removeChild(el);
      _loaderEl = null;
    }, 220);
  }

  function injectNavLoader(){
    // Show the overlay immediately so it covers the blank page during paint.
    if (document.body) {
      getLoader(); // creates and appends
    }
    // Dismiss once the body page-in animation finishes.
    var body = document.body;
    function onPageIn(){
      // Small rAF delay so the content is actually painted before we reveal it.
      requestAnimationFrame(function(){ requestAnimationFrame(hideLoader); });
    }
    body.addEventListener('animationend', onPageIn, { once:true });
    // Hard fallback: if animation never fires (e.g. reduced-motion or CSS not
    // loaded yet), dismiss after 600ms.
    setTimeout(function(){
      if (_loaderEl) hideLoader();
    }, 600);
  }

  /* ── Smooth navigation ───────────────────────────────────────────────────
     Intercept sidebar link clicks: close the mobile drawer, show the loading
     overlay, fade out the body, then navigate. */
  function wireNavTransitions(){
    document.addEventListener('click', function(e){
      // Backdrop click closes the sidebar on mobile.
      if (e.target.id === 'teamsSidenavBackdrop') { closeSidenav(); return; }

      var link = e.target.closest('.teams-sidenav a[href]');
      if (!link) return;
      var href = link.getAttribute('href');
      if (!href || href === '#') return;
      // Same page — just close the mobile drawer, no transition needed.
      var dest = href.replace(/\/$/, '') || '/';
      var cur  = location.pathname.replace(/\/$/, '') || '/';
      if (dest === cur) { closeSidenav(); return; }
      e.preventDefault();
      closeSidenav();
      var body = document.body;
      // Persist destination hint for skeleton sidenav on next page.
      try { sessionStorage.setItem('teams_nav_dest', href); } catch(_){}
      // Reduce-motion: skip animation, navigate immediately.
      var noMotion = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
      if (noMotion) { location.href = href; return; }
      // Show spinner overlay immediately, then fade body out, then navigate.
      showLoader();
      body.classList.add('teams-leaving');
      var done = false;
      function go(){ if (!done){ done=true; location.href = href; } }
      body.addEventListener('animationend', go, { once:true });
      setTimeout(go, 220); // hard fallback
    });
  }

  /* Inject a skeleton sidenav placeholder into #teamsTabbarSlot immediately
     so there is no layout pop while TeamsCtx.ready resolves. */
  function injectSkeletonTabbar(){
    var slot = document.getElementById('teamsTabbarSlot');
    if (!slot) return;
    if (slot.querySelector('.teams-sidenav')) return;
    slot.innerHTML = '<nav class="teams-sidenav teams-sidenav-skel" aria-hidden="true"></nav>';
  }

  function pendingCount(){
    var sb = getSb();
    if (!sb || !ctx.activeChurchId || !ctx.isChurchAdmin) return Promise.resolve(0);
    return sb.from('bst_members')
      .select('id', { count:'exact', head:true })
      .eq('church_id', ctx.activeChurchId)
      .eq('status', 'pending')
      .then(function(res){
        if (res.error) { console.error('[Teams] pendingCount error', res.error); return 0; }
        return res.count || 0;
      });
  }

  init();

  // Show loading overlay immediately on every page enter, dismiss on paint.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNavLoader);
  } else {
    injectNavLoader();
  }

  // Inject skeleton sidenav immediately (before auth resolves) to avoid pop-in.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSkeletonTabbar);
  } else {
    injectSkeletonTabbar();
  }

  // Inject the mobile hamburger toggle once the DOM is interactive.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSidenavToggle);
  } else {
    injectSidenavToggle();
  }

  // Wire transition clicks after DOM is interactive.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireNavTransitions);
  } else {
    wireNavTransitions();
  }

  window.TeamsCtx = {
    ready: ready,
    get user(){ return ctx.user; },
    get memberships(){ return ctx.memberships; },
    get activeChurchId(){ return ctx.activeChurchId; },
    get activeMember(){ return ctx.activeMember; },
    get isSiteAdmin(){ return ctx.isSiteAdmin; },
    get isChurchAdmin(){ return ctx.isChurchAdmin; },
    get isTeacher(){ return ctx.isTeacher; },
    get hasTeamsAccess(){ return ctx.hasTeamsAccess; },
    get isPending(){ return ctx.isPending; },
    get sb(){ return getSb(); },
    setActiveChurch: setActiveChurch,
    requireAccess: requireAccess,
    bottomTabs: bottomTabs,   /* kept for compat — renders sideNav */
    sideNav: sideNav,
    pendingCount: pendingCount,
    reloadMemberships: loadMemberships,
    esc: esc
  };
})();
