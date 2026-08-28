/* /teams/sop/sop.js — Standard operating procedures list/detail. bst_sops
   only has a SELECT RLS policy in this project, so creating/editing an SOP
   is attempted but will surface a permission error until an INSERT/UPDATE
   policy or RPC is added (see DB gaps in the build report). */
(function(){
  var root = document.getElementById('sopRoot');
  var actionsEl = document.getElementById('sopActions');
  var tabbarSlot = document.getElementById('teamsTabbarSlot');
  function esc(s){ return (window.TeamsCtx && window.TeamsCtx.esc) ? window.TeamsCtx.esc(s) : String(s == null ? '' : s); }

  var state = { sops: [], openId: null };

  function renderActions(){
    if (!(window.TeamsCtx.isChurchAdmin || window.TeamsCtx.isSiteAdmin)) { actionsEl.innerHTML = ''; return; }
    actionsEl.innerHTML = '<button class="teams-btn teams-btn-sm" id="newSopBtn" type="button">+ New SOP</button>';
    document.getElementById('newSopBtn').addEventListener('click', openComposer);
  }

  function load(){
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;
    return sb.from('bst_sops').select('*').eq('church_id', churchId).order('title', { ascending: true }).then(function(res){
      state.sops = res.error ? [] : (res.data || []);
      if (res.error) console.error('[Teams sop] load error', res.error);
    });
  }

  function sopRow(s){
    var open = state.openId === s.id;
    return '<div class="teams-card" style="margin-bottom:var(--s-3)">' +
      '<div data-sop-id="' + esc(s.id) + '" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;gap:var(--s-2)">' +
        '<strong>' + esc(s.title || 'Untitled SOP') + '</strong>' +
        '<span aria-hidden="true">' + (open ? '\u2304' : '\u203a') + '</span>' +
      '</div>' +
      (open ? '<div class="teams-card-desc" style="margin-top:8px;white-space:pre-wrap">' + esc(s.body || '') + '</div>' : '') +
    '</div>';
  }

  function render(){
    tabbarSlot.innerHTML = window.TeamsCtx.bottomTabs('sop');
    root.innerHTML = state.sops.length
      ? state.sops.map(sopRow).join('')
      : '<div class="teams-empty"><span class="teams-empty-glyph" aria-hidden="true">\u25F7</span><h2>No SOPs yet</h2><p>Standard operating procedures for cultivation, intake, and follow-up will appear here.</p></div>';
    Array.prototype.forEach.call(root.querySelectorAll('[data-sop-id]'), function(row){
      row.addEventListener('click', function(){
        var id = row.getAttribute('data-sop-id');
        state.openId = state.openId === id ? null : id;
        render();
      });
    });
  }

  function overlay(innerHtml){
    var ov = document.createElement('div');
    ov.className = 'teams-overlay open';
    ov.innerHTML = '<div class="teams-sheet">' + innerHtml + '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if (e.target === ov) ov.remove(); });
    return ov;
  }

  function openComposer(){
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;
    var ov = overlay(
      '<button class="teams-sheet-close" type="button" aria-label="Close">\u2715</button>' +
      '<h2>New SOP</h2>' +
      '<div class="teams-field"><label for="sopTitle">Title</label><input id="sopTitle" type="text" /></div>' +
      '<div class="teams-field"><label for="sopBody">Body</label><textarea id="sopBody" rows="8"></textarea></div>' +
      '<div id="sopErr"></div>' +
      '<button class="teams-btn teams-btn-block" id="sopSaveBtn" type="button">Save SOP</button>'
    );
    ov.querySelector('.teams-sheet-close').addEventListener('click', function(){ ov.remove(); });
    ov.querySelector('#sopSaveBtn').addEventListener('click', function(){
      var btn = ov.querySelector('#sopSaveBtn');
      var errEl = ov.querySelector('#sopErr');
      var title = ov.querySelector('#sopTitle').value.trim();
      var body = ov.querySelector('#sopBody').value.trim();
      if (!title) { errEl.innerHTML = '<div class="teams-error">Title is required.</div>'; return; }
      btn.disabled = true; btn.textContent = 'Saving\u2026';
      sb.from('bst_sops').insert({ church_id: churchId, title: title, body: body || null }).then(function(res){
        btn.disabled = false; btn.textContent = 'Save SOP';
        if (res.error) {
          errEl.innerHTML = '<div class="teams-error">Could not save: ' + esc(res.error.message || 'permission denied') + '</div>';
          return;
        }
        ov.remove();
        load().then(render);
      });
    });
  }

  window.TeamsCtx.ready.then(function(){
    if (!window.TeamsCtx.requireAccess(root)) return;
    renderActions();
    load().then(render);
  });
})();
