/* Account — Supabase-backed sign up / sign in / sign out + per-account cloud
   save sync. v5: removes the manual "Save to Cloud Now" button in favor of a
   live sync status indicator ("Synced · 2s ago" / "Syncing…" / "Offline —
   changes pending"). Every bindSync call still triggers a debounced push on
   notifyLocalChange(); the difference is that the *user-facing surface* is
   passive — no button to press, just observable state.

   Public API:
     CloudAccount.ready                -> Promise, resolves once auth state is known
     CloudAccount.getUser()            -> current user object or null
     CloudAccount.isSignedIn()         -> boolean
     CloudAccount.onAuthChange(fn)     -> fn(user|null)
     CloudAccount.bindSync(tool, {getLocal, setLocal, emptyValue, onRemoteUpdate})
                                       -> {notifyLocalChange()}
     CloudAccount.cloudSaveNow()       -> Promise (still exposed for programmatic flushes)
     CloudAccount.onSyncStatusChange(fn)-> fn({state, pending, lastSyncAt})
     CloudAccount.getSyncStatus()      -> current status object
*/
(function(){
  if (window.CloudAccount) return;

  var SUPABASE_URL = 'https://ysnhgsbujahvlnqyggti.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlzbmhnc2J1amFodmxucXlnZ3RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MTY2NDIsImV4cCI6MjEwMDA5MjY0Mn0.HBmfiyfLIHLTDP7TJ23KYQc-YE9KnYwG9wu7hUx1s08';

  var sb = null;
  var currentUser = null;
  var currentAccessToken = null;
  var currentProfile = null;   // { user_id, email, role, deactivated } or null
  var currentMailbox = null;   // { id, address, display_name } for personal inbox, if assigned
  var authListeners = [];
  var bindings = {};
  var resolveReady;
  var ready = new Promise(function(res){ resolveReady = res; });
  var isEmbedded = false;
  try { isEmbedded = new URLSearchParams(location.search).get('embed') === 'split'; } catch(e){}

  /* Sync status broadcaster.
     states: 'idle' (signed out or nothing to sync), 'syncing', 'synced', 'error', 'offline' */
  var syncStatus = { state:'idle', pending:0, lastSyncAt:null, lastError:null };
  var syncListeners = [];
  function setSyncStatus(patch){
    for (var k in patch) syncStatus[k] = patch[k];
    syncListeners.forEach(function(fn){ try { fn(syncStatus); } catch(e){} });
  }
  function onSyncStatusChange(fn){
    syncListeners.push(fn);
    try { fn(syncStatus); } catch(e){}
    return function(){ syncListeners = syncListeners.filter(function(f){return f!==fn;}); };
  }
  function getSyncStatus(){ return syncStatus; }

  /* offline queue — when a push fails due to network, we mark tool dirty
     and retry when online. Kept in-memory only; local data is already saved
     to safeLS, so no data loss. */
  var offlineQueue = {}; // tool -> true
  function isOnline(){ return typeof navigator === 'undefined' || navigator.onLine !== false; }
  window.addEventListener && window.addEventListener('online', function(){
    if (!currentUser) return;
    Object.keys(offlineQueue).forEach(function(tool){ pushOne(tool); });
  });
  window.addEventListener && window.addEventListener('offline', function(){
    setSyncStatus({ state: currentUser ? 'offline' : 'idle' });
  });

  function loadSDK(cb){
    if (window.supabase && window.supabase.createClient) { cb(); return; }
    var existing = document.querySelector('script[data-bsh-supabase-sdk]');
    if (existing) { existing.addEventListener('load', cb); existing.addEventListener('error', cb); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/dist/umd/supabase.js';
    s.setAttribute('data-bsh-supabase-sdk', '1');
    s.onload = cb;
    s.onerror = function(){ console.error('[Account] Failed to load Supabase SDK'); cb(); };
    document.head.appendChild(s);
  }

  loadSDK(function(){
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storage: window.safeLS || undefined, storageKey: 'bsh-auth-v1' }
      });
    } catch(e){ console.error('[Account] init failed', e); resolveReady(); return; }

    // Root-cause fix: sb.auth.getSession() had no rejection handler, so a
    // rejected (or, in rare storage-corruption cases, permanently pending)
    // promise here left `ready` unresolved forever — every page waiting on
    // BC.ready() (e.g. Bible Connect group pages) would hang on their loading
    // state indefinitely, with no console error since nothing ever threw or
    // logged. We now: (1) always resolveReady() via .catch, and (2) add a
    // hard timeout so a hung/slow getSession() call can't block forever.
    var sessionSettled = false;
    function settleSession(res){
      if (sessionSettled) return; sessionSettled = true;
      var sess = (res && res.data) ? res.data.session : null;
      currentUser = sess ? sess.user : null;
      currentAccessToken = sess ? sess.access_token : null;
      renderWidget();
      resolveReady();
      if (currentUser) { setSyncStatus({state:'synced', lastSyncAt: Date.now()}); handleSignedIn(false); refreshProfile(); }
    }
    setTimeout(function(){
      if (sessionSettled) return;
      sessionSettled = true;
      console.error('[Account] getSession() timed out after 8s — continuing signed-out so the UI is not blocked.');
      currentUser = null; currentAccessToken = null;
      try { renderWidget(); } catch(e){}
      resolveReady();
    }, 8000);
    sb.auth.getSession().then(settleSession).catch(function(err){
      console.error('[Account] getSession() failed', err);
      settleSession(null);
    });

    sb.auth.onAuthStateChange(function(event, session){
      currentUser = session ? session.user : null;
      currentAccessToken = session ? session.access_token : null;
      renderWidget();
      authListeners.forEach(function(fn){ try{ fn(currentUser); }catch(e){} });
      if (event === 'SIGNED_IN' && currentUser) {
        setSyncStatus({state:'syncing', pending: Object.keys(bindings).length});
        handleSignedIn(true);
        refreshProfile();
        // Fire onFirstSignup listeners if a fresh signup marker is present.
        // Delay slightly so binding-driven pulls kick off first.
        setTimeout(function(){ consumeFirstSignupIfPresent(currentUser); }, 250);
      } else if (event === 'SIGNED_OUT') {
        setSyncStatus({state:'idle', pending:0, lastSyncAt:null, lastError:null});
        currentProfile = null;
        currentMailbox = null;
        handleSignedOut();
      }
    });
  });

  function getUser(){ return currentUser; }
  function getProfile(){ return currentProfile; }
  function isSignedIn(){ return !!currentUser; }
  function isAdmin(){ return !!(currentProfile && currentProfile.role === 'admin' && !currentProfile.deactivated); }
  function getAccessToken(){ return currentAccessToken; }
  function getSupabaseClient(){ return sb; }
  function getSupabaseUrl(){ return SUPABASE_URL; }
  function getSupabaseAnonKey(){ return SUPABASE_ANON_KEY; }
  function onAuthChange(fn){ authListeners.push(fn); return function(){ authListeners = authListeners.filter(function(f){return f!==fn;}); }; }

  /* Fetch the current user's profile row (role, deactivated flag). If the row
     doesn't exist yet, upsert one with role='user'. Master-admin promotion is
     handled server-side by the auth trigger — the client never sets role.
     Also handles deactivated accounts by immediately signing them out. */
  function refreshProfile(){
    if (!currentUser || !sb){
      currentProfile = null;
      renderWidget();
      return Promise.resolve(null);
    }
    return fetch(SUPABASE_URL + '/rest/v1/user_profiles?select=user_id,email,role,deactivated&user_id=eq.' + encodeURIComponent(currentUser.id), {
      headers: restHeaders({ 'Accept':'application/json' })
    }).then(function(r){ return r.ok ? r.json() : []; }).then(function(rows){
      if (rows && rows.length){
        currentProfile = rows[0];
      } else {
        // First-touch: create a default 'user' row. Uses upsert so it's safe on races.
        return fetch(SUPABASE_URL + '/rest/v1/user_profiles?on_conflict=user_id', {
          method:'POST',
          headers: restHeaders({ 'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates,return=representation' }),
          body: JSON.stringify([{ user_id: currentUser.id, email: currentUser.email, role: 'user', deactivated: false }])
        }).then(function(r){ return r.ok ? r.json() : []; }).then(function(rows2){
          currentProfile = (rows2 && rows2[0]) || { user_id: currentUser.id, email: currentUser.email, role: 'user', deactivated: false };
        });
      }
    }).catch(function(){ currentProfile = null; }).then(function(){
      // If the account is deactivated, sign them out immediately.
      if (currentProfile && currentProfile.deactivated){
        sb.auth.signOut();
        try { alert('This account has been deactivated. Contact an administrator.'); } catch(e){}
      }
      renderWidget();
      // Fire-and-forget mailbox lookup so the profile dropdown can show the
      // Mail link when a personal address is assigned.
      refreshMailbox().catch(function(){});
      return currentProfile;
    });
  }

  /* Look up whether the current user has been assigned a personal mailbox.
     Populates currentMailbox and re-renders the profile dropdown when the
     answer changes so a newly-assigned inbox surfaces without a hard reload. */
  function refreshMailbox(){
    if (!currentUser || !sb){ currentMailbox = null; renderWidget(); return Promise.resolve(null); }
    return fetch(SUPABASE_URL + '/rest/v1/au_mailboxes?assigned_to_user_id=eq.' + encodeURIComponent(currentUser.id) + '&is_active=eq.true&select=id,address,display_name&limit=1', {
      headers: restHeaders({ 'Accept':'application/json' })
    }).then(function(r){ return r.ok ? r.json() : []; }).then(function(rows){
      var next = (rows && rows[0]) || null;
      var prevAddr = currentMailbox && currentMailbox.address;
      var nextAddr = next && next.address;
      currentMailbox = next;
      if (prevAddr !== nextAddr) renderWidget();
      return currentMailbox;
    }).catch(function(){ currentMailbox = null; });
  }

  function bindSync(tool, opts){
    bindings[tool] = { getLocal: opts.getLocal, setLocal: opts.setLocal, emptyValue: opts.emptyValue, onRemoteUpdate: opts.onRemoteUpdate, timer: null };
    if (currentUser) syncPullOne(tool, false);
    return {
      notifyLocalChange: function(){
        var b = bindings[tool];
        if (!b || !currentUser) return;
        if (b.timer) clearTimeout(b.timer);
        // show "syncing" the moment a change lands, before the debounce fires
        setSyncStatus({state: isOnline() ? 'syncing' : 'offline', pending: syncStatus.pending + 1});
        b.timer = setTimeout(function(){ pushOne(tool); }, 900);
      }
    };
  }

  function handleSignedIn(isFreshSignIn){
    Object.keys(bindings).forEach(function(tool){ syncPullOne(tool, isFreshSignIn); });
  }

  /* Known per-tool localStorage keys that hold synced user data.
     Kept explicit so sign-out wipes them even on pages that never
     loaded the corresponding tool script (e.g. signing out from /read/
     also nukes /sermon/ builder docs). Do NOT include app-preference
     keys (theme, layout) — those are not user data. */
  var USER_DATA_KEYS = [
    'bible_user_notes_v1',      // per-verse study notes (Bible reader)
    'bsh_library_v1',           // universal highlights + bookmarks + recent
    'bible_study_notebook_v1',  // shared notebook drawer
    'bx_docs_v1',               // sermon builder documents
    'bx_snapshots_v1',          // sermon builder snapshots
    'bx_tray_v1',               // sermon builder scripture tray
    'bsh_reading_plans_v1',     // reading plan progress
    'bsh_topic_saved_v1',       // topic explorer saved topics
    'bsh_eov_mem_v1',           // memorize list (Explorer overlay)
    'bsh_eov_journal_v1',       // journal entries (Explorer overlay)
    'bsh_eov_streak_v1',        // reading streak
    'bsh_eov_compare_v1',       // verse compare list
    'bshai_convo_v1',           // Ask AI chat history (shared: full explorer + overlay) [legacy]
    'bp_chat_sessions_v1',      // Unified chat history (Explorer AI + Deep Research)
    'builder_tray',             // legacy builder tray
    'bp_journey_studies_v1',    // Study Journey — user studies & items
    'bp_activity_log_v1',       // Study Journey — activity log
    'bp_active_study_id_v1',    // Study Journey — active study selection
    'bp_builder_tray_v1',       // Builder tray (modern key)
    'bp_reading_plans_v1',      // Reading plans (modern key)
    'bp_builder_docs_v1',       // Sermon builder docs (modern key)
    'bp_bible_user_notes_v1'    // Reader notes (modern key)
  ];

  function handleSignedOut(){
    // First, let each registered binding run its own setLocal+onRemoteUpdate
    // so any live UI on this page re-renders as empty immediately.
    Object.keys(bindings).forEach(function(tool){
      var b = bindings[tool];
      if (b && b.emptyValue !== undefined) {
        try { b.setLocal(b.emptyValue); } catch(e){}
        try { b.onRemoteUpdate && b.onRemoteUpdate(); } catch(e){}
      }
    });
    // Belt-and-suspenders: even if a tool's script isn't loaded on this page,
    // remove its localStorage key so a later navigation to that page doesn't
    // show stale data before its binding runs.
    var store = window.safeLS || window.localStorage;
    if (store) {
      USER_DATA_KEYS.forEach(function(k){
        try { store.removeItem(k); } catch(e){}
      });
    }
  }

  function restHeaders(extra){
    var h = { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
    if (currentAccessToken) h['Authorization'] = 'Bearer ' + currentAccessToken;
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function syncPullOne(tool, isFreshSignIn){
    if (!currentUser || !currentAccessToken) return;
    var b = bindings[tool];
    if (!b) return;
    setSyncStatus({state:'syncing'});
    fetch(SUPABASE_URL + '/rest/v1/user_saves?select=data,updated_at&tool=eq.' + encodeURIComponent(tool), {
      headers: restHeaders()
    }).then(function(r){
      return r.text().then(function(txt){
        var json = null; try { json = txt ? JSON.parse(txt) : null; } catch(e){}
        return { ok: r.ok, json: json };
      });
    }).then(function(res){
      if (!res.ok) { console.error('[Account] pull error', tool, res.json); setSyncStatus({state:'error', lastError:'pull'}); return; }
      var row = Array.isArray(res.json) && res.json.length ? res.json[0] : null;
      if (row && row.data != null) {
        var local = null;
        try { local = b.getLocal(); } catch(e){}
        var localEmpty = local == null ||
          (Array.isArray(local) && local.length === 0) ||
          (typeof local === 'object' && local && Array.isArray(local.notes) && local.notes.length === 0 && !local.activeNoteId) ||
          (typeof local === 'object' && local && Object.keys(local).length === 0) ||
          // journey studies: { studies: [] }
          (typeof local === 'object' && local && Array.isArray(local.studies) && local.studies.length === 0) ||
          // activity log: { events: [] }
          (typeof local === 'object' && local && Array.isArray(local.events) && local.events.length === 0);
        // Always call setLocal on fresh sign-in (binding's own merge handles conflicts)
        // or when local is empty.  This ensures cloud data is never silently ignored.
        if (isFreshSignIn || localEmpty) {
          try { b.setLocal(row.data); } catch(e){ console.error(e); }
          try { b.onRemoteUpdate && b.onRemoteUpdate(); } catch(e){}
        }
        setSyncStatus({state:'synced', lastSyncAt: Date.now(), pending: Math.max(0, syncStatus.pending - 1)});
      } else {
        pushOne(tool);
      }
    }).catch(function(e){
      console.error('[Account] pull failed', tool, e);
      setSyncStatus({state: isOnline()?'error':'offline', lastError:'network'});
    });
  }

  function pushOne(tool){
    if (!currentUser || !currentAccessToken) return Promise.resolve({ok:false, error:'not_signed_in'});
    var b = bindings[tool];
    if (!b) return Promise.resolve({ok:false, error:'not_bound'});
    var data;
    try { data = b.getLocal(); } catch(e){ return Promise.resolve({ok:false, error:'getLocal_failed'}); }
    setSyncStatus({state:'syncing'});
    return fetch(SUPABASE_URL + '/rest/v1/user_saves?on_conflict=user_id,tool', {
      method: 'POST',
      headers: restHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ user_id: currentUser.id, tool: tool, data: data, updated_at: new Date().toISOString() })
    }).then(function(r){
      if (!r.ok) return r.text().then(function(t){ console.error('[Account] push error', tool, t); setSyncStatus({state:'error', lastError:t}); return {ok:false, error:t}; });
      delete offlineQueue[tool];
      setSyncStatus({state:'synced', lastSyncAt: Date.now(), pending: Math.max(0, syncStatus.pending - 1), lastError:null});
      return {ok:true};
    }).catch(function(e){
      console.error('[Account] push failed', tool, e);
      offlineQueue[tool] = true;
      setSyncStatus({state: isOnline()?'error':'offline', lastError:'network'});
      return {ok:false, error:String(e)};
    });
  }

  function cloudSaveNow(){
    if (!currentUser) return Promise.resolve({ok:false, error:'not_signed_in'});
    var tools = Object.keys(bindings);
    return Promise.all(tools.map(pushOne)).then(function(results){
      var ok = results.every(function(r){ return r.ok; });
      return { ok: ok, count: tools.length };
    });
  }

  /* ---------- styles (Builder tokens; matches .hub-btn-secondary / .hub-modal) ---------- */
  var css = ''
  + '.acct-root,.acct-root *{box-sizing:border-box}'
  + '.acct-fab{position:relative;display:inline-flex;align-items:center;flex-shrink:0;font-family:var(--font-sans)}'
  + '.acct-fab.floating{position:fixed;bottom:16px;left:16px;z-index:9997}'
  + '.acct-fab.in-slot{position:static;margin:0}'
  + '.acct-fab.in-slot .acct-btn{height:36px;padding:0 12px;border-radius:var(--r-sm);background:var(--surface-2);border:1px solid var(--border);color:var(--ink);font-size:var(--t-sm);font-weight:500}'
  + '.acct-fab.in-slot .acct-btn:hover{background:var(--surface-3,var(--surface-2))}'
  + '.acct-btn{display:flex;align-items:center;gap:8px;background:var(--surface);color:var(--ink);border:1px solid var(--border);border-radius:var(--r-md);'
  + 'padding:7px 13px;cursor:pointer;font-size:var(--t-sm);font-weight:500;letter-spacing:.2px;white-space:nowrap;'
  + 'transition:background var(--dur-1), border-color var(--dur-1);font-family:inherit}'
  + '.acct-btn:hover{background:var(--surface-2);border-color:var(--border-strong)}'
  + '.acct-btn:active{transform:scale(.98)}'
  + '.acct-fab.floating .acct-btn{background:var(--surface);border:1px solid var(--border);padding:9px 15px;box-shadow:var(--shadow-2)}'
  + '.acct-avatar{width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;'
  + 'justify-content:center;font-size:.72rem;font-weight:700;flex:none;position:relative}'
  + '.acct-avatar .acct-heartbeat{position:absolute;bottom:-1px;right:-1px;width:8px;height:8px;border-radius:50%;background:#4caf50;border:1.5px solid var(--surface);box-shadow:0 0 0 0 rgba(76,175,80,.6);animation:none}'
  + '.acct-avatar .acct-heartbeat.syncing{background:#f5b942;animation:acct-pulse 1s ease-in-out infinite}'
  + '.acct-avatar .acct-heartbeat.error{background:#e05555;animation:acct-pulse 1.5s ease-in-out infinite}'
  + '.acct-avatar .acct-heartbeat.offline{background:var(--ink-muted)}'
  + '@keyframes acct-pulse{0%{box-shadow:0 0 0 0 rgba(245,185,66,.6)}70%{box-shadow:0 0 0 6px rgba(245,185,66,0)}100%{box-shadow:0 0 0 0 rgba(245,185,66,0)}}'
  + '.acct-dd{position:absolute;top:calc(100% + 10px);right:0;min-width:260px;background:var(--surface);border:1px solid var(--border);'
  + 'border-radius:var(--r-lg);box-shadow:var(--shadow-3);padding:14px;display:none;font-size:var(--t-sm);color:var(--ink);z-index:9997}'
  + '.acct-dd.open{display:block;animation:acct-fade var(--dur-2) ease-out}'
  + '@keyframes acct-fade{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}'
  + '.acct-dd .acct-email{font-weight:600;word-break:break-all;margin-bottom:6px;font-size:var(--t-md)}'
  + '.acct-dd .acct-status{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:var(--r-sm);background:var(--surface-2);margin-bottom:10px;font-size:var(--t-xs)}'
  + '.acct-dd .acct-status .dot{width:8px;height:8px;border-radius:50%;flex:none}'
  + '.acct-dd .acct-status.synced .dot{background:#4caf50}'
  + '.acct-dd .acct-status.syncing .dot{background:#f5b942;animation:acct-pulse 1s ease-in-out infinite}'
  + '.acct-dd .acct-status.error .dot{background:#e05555}'
  + '.acct-dd .acct-status.offline .dot{background:var(--ink-muted)}'
  + '.acct-dd .acct-status .lbl{color:var(--ink-2);font-weight:600}'
  + '.acct-dd .acct-status .sub{color:var(--ink-3);font-size:var(--t-xs);margin-left:auto}'
  + '.acct-dd button{width:100%;border-radius:var(--r-sm);border:1px solid var(--border);background:var(--surface);color:var(--ink);padding:9px 10px;'
  + 'font-size:var(--t-sm);font-weight:500;cursor:pointer;margin-bottom:6px;font-family:inherit;transition:background var(--dur-1)}'
  + '.acct-dd button:hover{background:var(--surface-2)}'
  + '.acct-dd .acct-tip{color:var(--ink-3);font-size:var(--t-xs);text-align:center;margin-top:4px;line-height:1.4}'
  + '.acct-dd .acct-admin-link{display:flex;align-items:center;gap:8px;padding:9px 10px;margin-bottom:8px;border-radius:var(--r-sm);background:var(--accent-tint);color:var(--accent);text-decoration:none;font-size:var(--t-sm);font-weight:600;transition:background var(--dur-1)}'
  + '.acct-dd .acct-admin-link:hover{background:var(--accent);color:#fff}'
  + '.acct-dd .acct-admin-link .acct-ic{font-size:1rem;filter:none}'
  + '.acct-overlay{position:fixed;inset:0;z-index:10000;background:rgba(20,19,16,.4);display:none;align-items:center;justify-content:center;padding:16px}'
  + '.acct-overlay.open{display:flex;animation:acct-fade var(--dur-2) ease-out}'
  + '.acct-modal{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow-3);'
  + 'width:100%;max-width:400px;padding:26px 26px 20px;font-family:var(--font-sans);color:var(--ink);position:relative}'
  + '.acct-modal h2{margin:0 0 4px;font-family:var(--font-serif);font-size:var(--t-xl);font-weight:600;color:var(--ink);letter-spacing:.2px}'
  + '.acct-modal .acct-sub{color:var(--ink-3);font-size:var(--t-sm);margin-bottom:18px}'
  + '.acct-tabs{display:flex;gap:4px;margin-bottom:18px;background:var(--surface-2);border-radius:var(--r-md);padding:3px}'
  + '.acct-tab{flex:1;text-align:center;padding:8px 0;border-radius:var(--r-sm);font-size:var(--t-sm);font-weight:600;cursor:pointer;color:var(--ink-3);transition:background var(--dur-1),color var(--dur-1)}'
  + '.acct-tab.active{background:var(--surface);color:var(--accent);box-shadow:var(--shadow-1)}'
  + '.acct-field{margin-bottom:13px}'
  + '.acct-field label{display:block;font-size:var(--t-xs);font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:6px}'
  + '.acct-field input{width:100%;border:1px solid var(--border);border-radius:var(--r-md);padding:12px 12px;font-size:16px;line-height:1.2;font-family:inherit;background:var(--surface);color:var(--ink);transition:border-color var(--dur-1),box-shadow var(--dur-1);min-height:44px}'
  + '.acct-field input:focus{outline:none;border-color:var(--accent);box-shadow:var(--focus)}'
  + '.acct-submit{width:100%;background:var(--accent);color:#fff;border:none;border-radius:var(--r-md);padding:12px;font-size:var(--t-md);'
  + 'font-weight:500;cursor:pointer;margin-top:6px;transition:background var(--dur-1)}'
  + '.acct-submit:hover{background:var(--accent-hover)}'
  + '.acct-submit:active{transform:scale(.99)}'
  + '.acct-submit:disabled{opacity:.6;cursor:default}'
  + '.acct-forgot-row{margin-top:6px;text-align:center;font-size:var(--t-sm)}'
  + '.acct-forgot-row.hide{display:none}'
  + '.acct-forgot{background:none;border:0;padding:10px 14px;min-height:44px;color:var(--accent);cursor:pointer;font:inherit;font-size:var(--t-sm);text-decoration:underline;text-underline-offset:2px;border-radius:var(--r-sm);-webkit-tap-highlight-color:transparent;touch-action:manipulation}'
  + '.acct-forgot:hover{color:var(--accent-hover);background:var(--accent-soft)}'
  + '.acct-forgot:active{background:var(--accent-soft)}'
  + '.acct-forgot:focus-visible{outline:2px solid var(--accent);outline-offset:2px}'
  + '.acct-forgot:disabled{opacity:.6;cursor:default}'
  + '.acct-msg{font-size:var(--t-xs);border-radius:var(--r-sm);padding:9px 11px;margin-bottom:12px;display:none}'
  + '.acct-msg.err{display:block;background:var(--accent-soft);color:var(--accent);border:1px solid var(--border)}'
  + '.acct-msg.ok{display:block;background:#e9f2e3;color:#3a5d2c;border:1px solid #c3dab0}'
  + '.acct-close{position:absolute;top:14px;right:16px;background:none;border:none;font-size:1.2rem;color:var(--ink-3);cursor:pointer;line-height:1}'
  + '.acct-ic{display:none;font-size:.85rem;line-height:1}'
  + '@media (max-width:900px){.acct-btn{padding:6px 9px}.acct-btn .acct-label{display:none}.acct-ic{display:inline}}'
  + '@media (max-width:520px){.acct-fab.floating{bottom:10px;left:10px}}'
  + '.bp-notif{position:relative;display:inline-flex;align-items:center;flex-shrink:0;margin-right:8px;font-family:var(--font-sans)}'
  + '.bp-notif.floating{position:fixed;bottom:16px;left:74px;z-index:9997}'
  + '.bp-notif-btn{position:relative;background:var(--surface-2,#1a1a1a);border:1px solid var(--border,#2a2a2a);color:var(--ink,#f0f0f0);width:36px;height:36px;border-radius:var(--r-sm,6px);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;font-size:18px;line-height:1;font-family:inherit}'
  + '.bp-notif-btn:hover{background:var(--surface-3,var(--surface-2,#222));border-color:#7a1f2b}'
  + '.bp-notif-btn svg{display:block}'
  + '.bp-notif-badge{position:absolute;top:-4px;right:-4px;background:#7a1f2b;color:#fff;font-size:10px;font-weight:600;min-width:16px;height:16px;padding:0 4px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;line-height:1;border:2px solid var(--bg,#050505);box-sizing:content-box}'
  + '.bp-notif-badge[hidden]{display:none !important}'
  + '.bp-notif-dd{position:fixed;width:min(360px,calc(100vw - 24px));max-height:70vh;background:var(--surface,#0a0a0a);border:1px solid var(--border,#2a2a2a);border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.5);display:none;flex-direction:column;z-index:9998;overflow:hidden}'
  + '@media (max-width:640px){.bp-notif-dd{border-radius:10px}}'
  + '.bp-notif-dd.open{display:flex}'
  + '.bp-notif-hd{padding:12px 14px;border-bottom:1px solid var(--border,#2a2a2a);display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:14px;flex-shrink:0}'
  + '.bp-notif-mark{background:transparent;border:0;color:#7a1f2b;font-size:12px;cursor:pointer;padding:0;font-family:inherit}'
  + '.bp-notif-mark:hover{color:#a53848}'
  + '.bp-notif-list{overflow-y:auto;flex:1}'
  + '.bp-notif-item{padding:10px 14px;border-bottom:1px solid var(--border-2,#1a1a1a);cursor:pointer;display:block;color:var(--ink,#f0f0f0);text-decoration:none}'
  + '.bp-notif-item:hover{background:var(--surface-2,#111)}'
  + '.bp-notif-item.unread{background:rgba(122,31,43,.08);border-left:3px solid #7a1f2b;padding-left:11px}'
  + '.bp-notif-item-t{font-weight:600;font-size:13px;margin:0 0 3px;color:var(--ink,#f0f0f0)}'
  + '.bp-notif-item-b{font-size:12px;color:var(--ink-3,#888);margin:0 0 4px;line-height:1.45}'
  + '.bp-notif-item-time{font-size:11px;color:var(--ink-3,#888)}'
  + '.bp-notif-empty{padding:24px 14px;text-align:center;color:var(--ink-3,#888);font-size:13px}'
  + '@media (max-width:520px){.bp-notif.floating{bottom:10px;left:64px}}';
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  var root = document.createElement('div');
  root.className = 'acct-root';
  root.innerHTML =
    '<div class="bp-notif" id="bpNotif" hidden>' +
      '<button class="bp-notif-btn" id="bpNotifBtn" type="button" aria-label="Notifications">' +
        '<span aria-hidden="true">⚑</span>' +
        '<span class="bp-notif-badge" id="bpNotifBadge" hidden>0</span>' +
      '</button>' +
      '<div class="bp-notif-dd" id="bpNotifDd"></div>' +
    '</div>' +
    '<div class="acct-fab" id="acctFab">' +
      '<button class="acct-btn" id="acctBtn" type="button"><span class="acct-ic">\u25CB</span><span class="acct-label">Sign In</span></button>' +
      '<div class="acct-dd" id="acctDd"></div>' +
    '</div>' +
    '<div class="acct-overlay" id="acctOverlay">' +
      '<div class="acct-modal">' +
        '<button class="acct-close" id="acctModalClose" type="button" aria-label="Close">✕</button>' +
        '<h2 id="acctTitle">Welcome</h2>' +
        '<div class="acct-sub" id="acctSub">Sign in to save your notes to the cloud.</div>' +
        '<div class="acct-tabs">' +
          '<div class="acct-tab active" data-tab="signin">Sign In</div>' +
          '<div class="acct-tab" data-tab="signup">Sign Up</div>' +
        '</div>' +
        '<div class="acct-msg" id="acctMsg"></div>' +
        '<form id="acctForm">' +
          '<div class="acct-field"><label>Email</label><input type="email" id="acctEmail" autocomplete="email" required></div>' +
          '<div class="acct-field"><label>Password</label><input type="password" id="acctPassword" autocomplete="current-password" minlength="6" required></div>' +
          '<button type="submit" class="acct-submit" id="acctSubmit">Sign In</button>' +
          '<div class="acct-forgot-row" id="acctForgotRow"><button type="button" class="acct-forgot" id="acctForgot">Forgot password?</button></div>' +
        '</form>' +
      '</div>' +
    '</div>';
  function mountFab(){
    var elFab = document.getElementById('acctFab');
    var elNotif = document.getElementById('bpNotif');
    if (!elFab) return;
    var acctSlot = document.getElementById('acctSlot');
    var headerApp = document.querySelector('header.app');
    if (acctSlot) {
      elFab.classList.remove('floating');
      elFab.classList.add('in-slot');
      if (elNotif){ elNotif.classList.remove('floating'); elNotif.classList.add('in-slot'); acctSlot.appendChild(elNotif); }
      acctSlot.appendChild(elFab);
    } else if (headerApp) {
      elFab.classList.remove('floating');
      var menuBtn = headerApp.querySelector('.menu-btn');
      if (elNotif){ elNotif.classList.remove('floating'); if (menuBtn) headerApp.insertBefore(elNotif, menuBtn); else headerApp.appendChild(elNotif); }
      if (menuBtn) headerApp.insertBefore(elFab, menuBtn); else headerApp.appendChild(elFab);
    } else {
      elFab.classList.add('floating');
      if (elNotif){ elNotif.classList.add('floating'); document.body.appendChild(elNotif); }
      document.body.appendChild(elFab);
    }
  }
  if (!isEmbedded) {
    document.addEventListener('DOMContentLoaded', function(){ document.body.appendChild(root); mountFab(); });
    if (document.body) { document.body.appendChild(root); mountFab(); }
  }

  var elFab = document.getElementById('acctFab') || root.querySelector('#acctFab');
  var elBtn = document.getElementById('acctBtn') || root.querySelector('#acctBtn');
  var elDd = document.getElementById('acctDd') || root.querySelector('#acctDd');
  var elOverlay = root.querySelector('#acctOverlay');
  var elClose = root.querySelector('#acctModalClose');
  var elTabs = root.querySelectorAll('.acct-tab');
  var elForm = root.querySelector('#acctForm');
  var elEmail = root.querySelector('#acctEmail');
  var elPassword = root.querySelector('#acctPassword');
  var elSubmit = root.querySelector('#acctSubmit');
  var elMsg = root.querySelector('#acctMsg');
  var elTitle = root.querySelector('#acctTitle');
  var elSub = root.querySelector('#acctSub');
  var elForgotRow = root.querySelector('#acctForgotRow');
  var elForgot = root.querySelector('#acctForgot');
  var currentTab = 'signin';

  function initial(email){ return (email||'?').charAt(0).toUpperCase(); }

  function relTime(ts){
    if (!ts) return '';
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    return Math.floor(s/3600) + 'h ago';
  }

  function statusLabel(){
    if (!currentUser) return { cls:'idle', lbl:'Not signed in', sub:'' };
    switch (syncStatus.state) {
      case 'syncing': return { cls:'syncing', lbl:'Syncing…', sub:'' };
      case 'synced': return { cls:'synced', lbl:'All changes saved', sub:relTime(syncStatus.lastSyncAt) };
      case 'error': return { cls:'error', lbl:'Sync error', sub:'will retry' };
      case 'offline': return { cls:'offline', lbl:'Offline', sub:'changes will sync when online' };
      default: return { cls:'synced', lbl:'Signed in', sub:'' };
    }
  }

  function renderWidget(){
    if (currentUser) {
      var st = statusLabel();
      var heartCls = st.cls;
      elBtn.innerHTML = '<span class="acct-avatar">' + esc(initial(currentUser.email)) + '<span class="acct-heartbeat ' + heartCls + '"></span></span>';
      var adminLink = isAdmin()
        ? '<a class="acct-admin-link" id="acctAdminLink" href="' + adminHref() + '"><span class="acct-ic">\u2699</span>Admin console</a>'
        : '';
      elDd.innerHTML =
        '<div class="acct-email">' + esc(currentUser.email||'') + '</div>' +
        '<div class="acct-status ' + st.cls + '" id="acctStatus">' +
          '<span class="dot"></span>' +
          '<span class="lbl">' + esc(st.lbl) + '</span>' +
          (st.sub ? '<span class="sub">' + esc(st.sub) + '</span>' : '') +
        '</div>' +
        '<a class="acct-admin-link" id="acctProfileLink" href="/profile/"><span class="acct-ic">\u25CB</span>Profile</a>' +
        adminLink +
        '<button id="acctSignOutBtn" type="button">Sign Out</button>' +
        '<div class="acct-tip">Your notes save automatically as you work.</div>';
      var soBtn = elDd.querySelector('#acctSignOutBtn');
      if (soBtn) soBtn.addEventListener('click', function(){
        elDd.classList.remove('open');
        soBtn.disabled = true;
        soBtn.textContent = 'Signing out\u2026';
        // Wipe first so nothing races with an in-flight sync; then sign out;
        // then hard-reload so the DOM is guaranteed to reflect a clean state.
        try { handleSignedOut(); } catch(e){}
        Promise.resolve(sb.auth.signOut()).catch(function(){}).then(function(){
          try { location.reload(); } catch(e){}
        });
      });
    } else {
      elBtn.innerHTML = '<span class="acct-ic">\u25CB</span><span class="acct-label">Sign In</span>';
      elDd.innerHTML = '';
    }
  }

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  /* Admin console link. Vercel serves it at /admin/ (with clean URLs and a trailing
     slash redirect), so a root-relative href works from every page regardless of
     nesting depth. The old relative-path logic broke on /read/ (which resolved to
     /read/admin/index.html — a Vercel 404) and on any nested content page. */
  function adminHref(){ return '/admin/'; }

  /* Every status change re-renders the avatar heartbeat + dropdown if open */
  onSyncStatusChange(function(){
    if (!currentUser) return;
    var av = elBtn.querySelector('.acct-heartbeat');
    if (av) av.className = 'acct-heartbeat ' + statusLabel().cls;
    if (elDd.classList.contains('open')) {
      var stEl = elDd.querySelector('#acctStatus');
      if (stEl) {
        var st = statusLabel();
        stEl.className = 'acct-status ' + st.cls;
        stEl.innerHTML = '<span class="dot"></span><span class="lbl">' + esc(st.lbl) + '</span>' + (st.sub ? '<span class="sub">' + esc(st.sub) + '</span>' : '');
      }
    }
  });
  /* Refresh the "Xs ago" text once per second while dropdown open */
  setInterval(function(){
    if (currentUser && elDd.classList.contains('open') && syncStatus.state==='synced') {
      var stEl = elDd.querySelector('#acctStatus .sub');
      if (stEl) stEl.textContent = relTime(syncStatus.lastSyncAt);
    }
  }, 1000);

  elBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if (currentUser) { elDd.classList.toggle('open'); return; }
    openModal('signin');
  });
  document.addEventListener('click', function(e){ if (!elFab.contains(e.target)) elDd.classList.remove('open'); });

  function setTab(tab){
    currentTab = tab;
    elTabs.forEach(function(t){ t.classList.toggle('active', t.getAttribute('data-tab') === tab); });
    elMsg.className = 'acct-msg';
    if (tab === 'signin') {
      elTitle.textContent = 'Welcome Back';
      elSub.textContent = 'Sign in to sync your notes across devices.';
      elSubmit.textContent = 'Sign In';
      elPassword.setAttribute('autocomplete', 'current-password');
      if (elForgotRow) elForgotRow.classList.remove('hide');
    } else {
      elTitle.textContent = 'Create Account';
      elSub.textContent = 'Sign up to save your study notes to the cloud.';
      elSubmit.textContent = 'Sign Up';
      elPassword.setAttribute('autocomplete', 'new-password');
      if (elForgotRow) elForgotRow.classList.add('hide');
    }
  }
  elTabs.forEach(function(t){ t.addEventListener('click', function(){ setTab(t.getAttribute('data-tab')); }); });

  // Self-serve password reset from the sign-in modal. Sends the user
  // a Supabase reset email; the link lands on /reset-password/ where
  // they set a new password. Uses only the email input — no login
  // required. Safe to call even if the email doesn't exist (Supabase
  // silently no-ops to prevent account enumeration).
  if (elForgot) {
    elForgot.addEventListener('click', function(){
      if (!sb || !sb.auth || !sb.auth.resetPasswordForEmail) {
        showMsg('Password reset unavailable \u2014 try again in a moment.'); return;
      }
      var email = (elEmail.value || '').trim();
      if (!email) {
        showMsg('Enter your email above first, then click Forgot password.');
        try { elEmail.focus(); } catch(e){}
        return;
      }
      // Basic sanity check
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showMsg('That email address doesn\'t look right.'); return;
      }
      elForgot.disabled = true;
      elForgot.textContent = 'Sending\u2026';
      // Pin the redirect to the canonical origin so the link never
      // crosses a 308 domain-alias redirect (which drops URL fragments
      // and tokens across origins in most browsers).
      var canonicalOrigin = 'https://churchteams.tech';
      var isCanonicalHost = /(^|\.)churchteams\.tech$/i.test(location.hostname);
      var redirectOrigin = isCanonicalHost ? location.origin : canonicalOrigin;
      sb.auth.resetPasswordForEmail(email, { redirectTo: redirectOrigin + '/reset-password/' })
        .then(function(res){
          elForgot.disabled = false;
          elForgot.textContent = 'Forgot password?';
          if (res && res.error) {
            showMsg(res.error.message || 'Could not send reset email.');
            return;
          }
          showMsg('Reset link sent to ' + email + '. Check your inbox.', 'ok');
        })
        .catch(function(err){
          elForgot.disabled = false;
          elForgot.textContent = 'Forgot password?';
          showMsg((err && err.message) || 'Could not send reset email.');
        });
    });
  }

  function openModal(tab){
    setTab(tab || 'signin');
    elMsg.className = 'acct-msg';
    elForm.reset();
    elOverlay.classList.add('open');
    setTimeout(function(){ elEmail.focus(); }, 30);
  }
  function closeModal(){ elOverlay.classList.remove('open'); }
  elClose.addEventListener('click', closeModal);
  elOverlay.addEventListener('click', function(e){ if (e.target === elOverlay) closeModal(); });

  function showMsg(text, kind){ elMsg.textContent = text; elMsg.className = 'acct-msg ' + (kind||'err'); }

  /* ---------- First-signup detection ----------
     We set a localStorage marker as soon as the user completes the signup
     form (whether or not their session is issued immediately). On the next
     SIGNED_IN event we read + clear the marker and fire firstSignupListeners.
     Pages can subscribe via CloudAccount.onFirstSignup(fn) to trigger
     one-time UX like an interactive tutorial. */
  var FIRST_SIGNUP_KEY = 'bsh_first_signup_v1';
  var firstSignupListeners = [];
  function onFirstSignup(fn){ firstSignupListeners.push(fn); return function(){ firstSignupListeners = firstSignupListeners.filter(function(f){return f!==fn;}); }; }
  function markFirstSignup(email){
    try { localStorage.setItem(FIRST_SIGNUP_KEY, JSON.stringify({ email: email, at: Date.now() })); } catch(e){}
  }
  function consumeFirstSignupIfPresent(user){
    var raw = null;
    try { raw = localStorage.getItem(FIRST_SIGNUP_KEY); } catch(e){}
    if (!raw) return;
    var rec = null;
    try { rec = JSON.parse(raw); } catch(e){}
    // Consume: clear the marker before firing so listeners can safely
    // navigate/reload without re-triggering.
    try { localStorage.removeItem(FIRST_SIGNUP_KEY); } catch(e){}
    if (!rec) return;
    // Only fire if this is the same email that just signed up. Prevents
    // stale markers from firing for a different user on the same browser.
    if (user && rec.email && String(user.email||'').toLowerCase() !== String(rec.email).toLowerCase()) return;
    firstSignupListeners.forEach(function(fn){ try{ fn(user); }catch(e){ console.error('[Account] onFirstSignup listener error', e); } });
  }

  elForm.addEventListener('submit', function(e){
    e.preventDefault();
    if (!sb) { showMsg('Still loading — try again in a moment.'); return; }
    var email = elEmail.value.trim();
    var password = elPassword.value;
    var isSignup = currentTab === 'signup';
    elSubmit.disabled = true;
    elSubmit.textContent = isSignup ? 'Signing Up…' : 'Signing In…';
    var op = isSignup
      ? sb.auth.signUp({ email: email, password: password, options: { emailRedirectTo: location.origin + '/' } })
      : sb.auth.signInWithPassword({ email: email, password: password });
    op.then(function(res){
      elSubmit.disabled = false;
      elSubmit.textContent = isSignup ? 'Sign Up' : 'Sign In';
      if (res.error) { showMsg(res.error.message || 'Something went wrong.'); return; }
      if (isSignup) markFirstSignup(email);
      if (isSignup && res.data && !res.data.session) {
        showMsg('Account created! Check your email to confirm, then sign in.', 'ok');
        return;
      }
      closeModal();
    }).catch(function(err){
      elSubmit.disabled = false;
      elSubmit.textContent = isSignup ? 'Sign Up' : 'Sign In';
      showMsg(String(err && err.message || err));
    });
  });

  window.CloudAccount = {
    ready: ready,
    getUser: getUser,
    getProfile: getProfile,
    isSignedIn: isSignedIn,
    isAdmin: isAdmin,
    getMailbox: function(){ return currentMailbox; },
    refreshMailbox: refreshMailbox,
    onAuthChange: onAuthChange,
    onFirstSignup: onFirstSignup,
    bindSync: bindSync,
    cloudSaveNow: cloudSaveNow,
    onSyncStatusChange: onSyncStatusChange,
    getSyncStatus: getSyncStatus,
    openModal: openModal,
    refreshProfile: refreshProfile,
    getAccessToken: getAccessToken,
    getSupabaseClient: getSupabaseClient,
    getSupabaseUrl: getSupabaseUrl,
    getSupabaseAnonKey: getSupabaseAnonKey
  };

  /* ---------- Notification bell ---------- */
  var notifTimer = null;
  function notifEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function notifTimeRel(iso){
    if (!iso) return '';
    var d = new Date(iso), diff = (Date.now() - d.getTime())/1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff/86400) + 'd ago';
    return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
  }
  async function notifRefreshCount(){
    var wrap = document.getElementById('bpNotif');
    var badge = document.getElementById('bpNotifBadge');
    if (!wrap || !badge || !currentUser) return;
    try {
      // Count directly from the notifications table (single source of truth)
      var { count, error } = await sb.from('au_notifications').select('id', { count:'exact', head:true }).is('read_at', null);
      if (error) return;
      var n = count|0;
      if (n > 0){ badge.textContent = n > 99 ? '99+' : String(n); badge.hidden = false; }
      else { badge.hidden = true; }
    } catch(e){}
  }
  async function notifOpen(){
    var dd = document.getElementById('bpNotifDd');
    if (!dd || !currentUser) return;
    dd.innerHTML = '<div class="bp-notif-hd"><span>Notifications</span><button class="bp-notif-mark" id="bpNotifMarkAll">Clear all</button></div><div class="bp-notif-list" id="bpNotifListInner"><div class="bp-notif-empty">Loading…</div></div>';
    dd.classList.add('open');
    function emptyState(){
      var list = document.getElementById('bpNotifListInner');
      if (list) list.innerHTML = '<div class="bp-notif-empty">All caught up.</div>';
      var badge = document.getElementById('bpNotifBadge'); if (badge){ badge.hidden = true; }
    }
    function syncBadge(count){
      var badge = document.getElementById('bpNotifBadge');
      if (!badge) return;
      if (count > 0){ badge.textContent = count > 99 ? '99+' : String(count); badge.hidden = false; }
      else { badge.hidden = true; }
    }
    try {
      // Only show unread notifications — marking as read removes them from the dropdown
      var { data, error } = await sb.from('au_notifications').select('*').is('read_at', null).order('created_at',{ascending:false}).limit(20);
      var list = document.getElementById('bpNotifListInner');
      if (!list) return;
      if (error){ list.innerHTML = '<div class="bp-notif-empty">Error loading.</div>'; return; }
      // Sync badge to actual unread list length (server-side counter can be stale)
      syncBadge((data||[]).length);
      if (!data || !data.length){ emptyState(); return; }
      list.innerHTML = data.map(function(n){
        return '<a class="bp-notif-item unread" href="' + notifEsc(n.url||'#') + '" data-id="' + notifEsc(n.id) + '">' +
          '<div class="bp-notif-item-t">' + notifEsc(n.title||'') + '</div>' +
          (n.body ? '<div class="bp-notif-item-b">' + notifEsc(n.body) + '</div>' : '') +
          '<div class="bp-notif-item-time">' + notifEsc(notifTimeRel(n.created_at)) + '</div>' +
        '</a>';
      }).join('');
      list.querySelectorAll('.bp-notif-item').forEach(function(a){
        a.addEventListener('click', function(e){
          var id = a.getAttribute('data-id');
          // Mark read in DB and drop the row from the dropdown immediately
          sb.from('au_notifications').update({ read_at: new Date().toISOString() }).eq('id', id).then(function(){});
          a.remove();
          var remaining = list.querySelectorAll('.bp-notif-item').length;
          syncBadge(remaining);
          if (!remaining) emptyState();
        });
      });
      var mark = document.getElementById('bpNotifMarkAll');
      if (mark) mark.onclick = async function(){
        mark.disabled = true; mark.textContent = 'Clearing…';
        try { await sb.rpc('au_notify_mark_all_read'); } catch(e){}
        emptyState();
        mark.disabled = false; mark.textContent = 'Clear all';
      };
    } catch(e){}
  }
  function notifPositionDd(){
    var btn = document.getElementById('bpNotifBtn');
    var dd = document.getElementById('bpNotifDd');
    if (!btn || !dd) return;
    var r = btn.getBoundingClientRect();
    var vw = window.innerWidth;
    var isMobile = vw <= 640;
    // Mobile: full-width sheet-style, edge-to-edge with a small margin
    var ddW = isMobile ? (vw - 16) : Math.min(360, vw - 24);
    dd.style.width = ddW + 'px';
    var left;
    if (isMobile){
      left = 8;
    } else {
      // Prefer aligning dd's right edge with btn's right edge, but clamp within viewport
      left = r.right - ddW;
      if (left < 12) left = 12;
      if (left + ddW > vw - 12) left = vw - 12 - ddW;
    }
    dd.style.left = left + 'px';
    dd.style.right = 'auto';
    dd.style.top  = (r.bottom + 6) + 'px';
    dd.style.maxHeight = Math.min(window.innerHeight - r.bottom - 16, isMobile ? 480 : 500) + 'px';
  }
  function notifWire(){
    var btn = document.getElementById('bpNotifBtn');
    var dd = document.getElementById('bpNotifDd');
    if (!btn || !dd) return;
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      if (!currentUser){ openModal('signin'); return; }
      if (dd.classList.contains('open')) dd.classList.remove('open');
      else { notifOpen(); notifPositionDd(); }
    });
    document.addEventListener('click', function(e){
      var wrap = document.getElementById('bpNotif');
      if (wrap && !wrap.contains(e.target) && !dd.contains(e.target)) dd.classList.remove('open');
    });
    window.addEventListener('resize', function(){ if (dd.classList.contains('open')) notifPositionDd(); });
    window.addEventListener('scroll', function(){ if (dd.classList.contains('open')) notifPositionDd(); }, { passive:true });
  }
  function notifShowHide(){
    var wrap = document.getElementById('bpNotif');
    if (!wrap) return;
    if (currentUser){
      wrap.hidden = false;
      notifRefreshCount();
      if (notifTimer) clearInterval(notifTimer);
      notifTimer = setInterval(notifRefreshCount, 60000);
    } else {
      wrap.hidden = true;
      var badge = document.getElementById('bpNotifBadge'); if (badge) badge.hidden = true;
      if (notifTimer){ clearInterval(notifTimer); notifTimer = null; }
    }
  }
  onAuthChange(function(u){ notifShowHide(); });
  // Initial wire once DOM is ready
  function notifBootstrap(){
    if (!document.getElementById('bpNotif')) { setTimeout(notifBootstrap, 100); return; }
    notifWire(); notifShowHide();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', notifBootstrap);
  else notifBootstrap();
})();
