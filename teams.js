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

  function bottomTabs(activeKey){
    var tabs = [
      { key:'dashboard', label:'Dashboard', glyph:'\u2756', href:'/' },
      { key:'students',  label:'Prospects',  glyph:'\u25A4', href:'/students/' },
      { key:'schedule',  label:'Schedule',  glyph:'\u25F7', href:'/schedule/' },
      { key:'notices',   label:'Notices',   glyph:'\u25A3', href:'/notices/' },
      { key:'sop',       label:'SOP',       glyph:'\u2637', href:'/sop/' },
      { key:'tasks',     label:'Tasks',     glyph:'\u2611', href:'/tasks/' }
    ];
    // Church admins (and site admin) see Insights and Admin tabs.
    if (ctx.isChurchAdmin || ctx.isSiteAdmin) {
      tabs.push({ key:'insights', label:'Insights', glyph:'\u25D1', href:'/insights/' });
    }
    if (ctx.isChurchAdmin) {
      tabs.push({ key:'admin', label:'Admin', glyph:'\u25C8', href:'/admin/' });
    }
    var html = '<nav class="teams-tabbar" aria-label="Teams navigation">' + tabs.map(function(t){
      var cur = t.key === activeKey;
      return '<a href="' + t.href + '"' + (cur ? ' aria-current="page"' : '') + '>' +
        '<span class="teams-tab-glyph" aria-hidden="true">' + t.glyph + '</span>' +
        '<span>' + esc(t.label) + '</span>' +
      '</a>';
    }).join('') + '</nav>';
    return html;
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
    bottomTabs: bottomTabs,
    pendingCount: pendingCount,
    reloadMemberships: loadMemberships,
    esc: esc
  };
})();
