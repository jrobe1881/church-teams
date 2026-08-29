/* /teams/notices/notices.js — Church-wide notices list. bst_notices only
   has a SELECT RLS policy in this project, so posting a new notice is
   attempted but will surface a permission error until an INSERT policy or
   RPC is added (see DB gaps in the build report). */
(function(){
  var root = document.getElementById('noticesRoot');
  var actionsEl = document.getElementById('noticesActions');
  var tabbarSlot = document.getElementById('teamsTabbarSlot');
  function esc(s){ return (window.TeamsCtx && window.TeamsCtx.esc) ? window.TeamsCtx.esc(s) : String(s == null ? '' : s); }

  var state = { notices: [] };

  function renderActions(){
    if (!(window.TeamsCtx.isChurchAdmin || window.TeamsCtx.isSiteAdmin)) { actionsEl.innerHTML = ''; return; }
    actionsEl.innerHTML = '<button class="teams-btn teams-btn-sm" id="newNoticeBtn" type="button">+ New Notice</button>';
    document.getElementById('newNoticeBtn').addEventListener('click', openComposer);
  }

  function fmtDate(d){
    if (!d) return '';
    var date = new Date(d);
    var now = new Date();
    var diffMs = now - date;
    var diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return diffDays + ' days ago';
    return date.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  }

  function load(){
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;
    return sb.from('bst_notices').select('*').eq('church_id', churchId).order('created_at', { ascending: false }).then(function(res){
      state.notices = res.error ? [] : (res.data || []);
      if (res.error) console.error('[Teams notices] load error', res.error);
    });
  }

  function canManage(){
    return !!(window.TeamsCtx.isChurchAdmin || window.TeamsCtx.isSiteAdmin);
  }

  function noticeCard(n){
    var adminActions = canManage()
      ? '<div class="teams-notice-actions" data-notice-id="' + esc(n.id) + '">' +
          '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-delete-notice="' + esc(n.id) + '" type="button" style="color:var(--accent);border-color:var(--accent);background:transparent">Delete</button>' +
        '</div>'
      : '';
    return '<div class="teams-card" style="margin-bottom:var(--s-3)">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--s-2)">' +
        '<strong>' + esc(n.title || 'Notice') + '</strong>' +
        '<span class="teams-card-desc" style="white-space:nowrap;flex-shrink:0">' + esc(fmtDate(n.created_at)) + '</span>' +
      '</div>' +
      (n.body ? '<div class="teams-card-desc" style="margin-top:6px;white-space:pre-wrap">' + esc(n.body) + '</div>' : '') +
      (canManage() ? '<div style="margin-top:var(--s-2)">' + adminActions + '</div>' : '') +
    '</div>';
  }

  function wireDeleteButtons(){
    if (!canManage()) return;
    Array.prototype.forEach.call(root.querySelectorAll('[data-delete-notice]'), function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-delete-notice');
        var actionsWrap = btn.closest('.teams-notice-actions');
        // Replace the button with an inline confirm
        actionsWrap.innerHTML =
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<span class="teams-card-desc" style="font-size:var(--t-xs)">Delete this notice?</span>' +
            '<button class="teams-btn teams-btn-sm teams-btn-danger" data-confirm-delete="' + esc(id) + '" type="button">Yes, delete</button>' +
            '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-cancel-delete type="button">Cancel</button>' +
          '</div>';
        actionsWrap.querySelector('[data-cancel-delete]').addEventListener('click', function(){ render(); });
        actionsWrap.querySelector('[data-confirm-delete]').addEventListener('click', function(){
          var confirmBtn = actionsWrap.querySelector('[data-confirm-delete]');
          confirmBtn.disabled = true; confirmBtn.textContent = 'Deleting\u2026';
          window.TeamsCtx.sb.from('bst_notices').delete().eq('id', id).then(function(res){
            if (res.error){
              render();
              // Show a brief error toast
              var toast = document.createElement('div');
              toast.className = 'teams-toast show';
              toast.textContent = 'Could not delete: ' + (res.error.message || 'permission denied');
              document.body.appendChild(toast);
              setTimeout(function(){ toast.classList.remove('show'); setTimeout(function(){ toast.remove(); }, 300); }, 3000);
              return;
            }
            state.notices = state.notices.filter(function(x){ return x.id !== id; });
            render();
          });
        });
      });
    });
  }

  function render(){
    tabbarSlot.innerHTML = window.TeamsCtx.bottomTabs('notices');
    root.innerHTML = state.notices.length
      ? state.notices.map(noticeCard).join('')
      : '<div class="teams-empty"><span class="teams-empty-glyph" aria-hidden="true">\u25F7</span><h2>No notices yet</h2><p>Church-wide notices will appear here.</p></div>';
    wireDeleteButtons();
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
      '<h2>New Notice</h2>' +
      '<div class="teams-field"><label for="noticeTitle">Title</label><input id="noticeTitle" type="text" /></div>' +
      '<div class="teams-field"><label for="noticeBody">Body</label><textarea id="noticeBody"></textarea></div>' +
      '<div id="noticeErr"></div>' +
      '<button class="teams-btn teams-btn-block" id="noticeSaveBtn" type="button">Post notice</button>'
    );
    ov.querySelector('.teams-sheet-close').addEventListener('click', function(){ ov.remove(); });
    ov.querySelector('#noticeSaveBtn').addEventListener('click', function(){
      var btn = ov.querySelector('#noticeSaveBtn');
      var errEl = ov.querySelector('#noticeErr');
      var title = ov.querySelector('#noticeTitle').value.trim();
      var body = ov.querySelector('#noticeBody').value.trim();
      if (!title) { errEl.innerHTML = '<div class="teams-error">Title is required.</div>'; return; }
      btn.disabled = true; btn.textContent = 'Posting\u2026';
      sb.from('bst_notices').insert({ church_id: churchId, title: title, body: body || null }).then(function(res){
        btn.disabled = false; btn.textContent = 'Post notice';
        if (res.error) {
          errEl.innerHTML = '<div class="teams-error">Could not post: ' + esc(res.error.message || 'permission denied') + '</div>';
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
