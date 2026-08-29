/* /teams/baptisms/baptisms.js — Admin-only baptism planning. Baptisms are
   NOT linked to students; person_name is the only required field beyond the
   NOT NULL baptism_date column. RLS on bst_baptisms has admin_insert/
   admin_update/admin_delete policies, so this page writes directly to the
   table (no RPC needed for baptisms). Columns: baptism_date (date, NOT
   NULL), service (legacy text), service_slot (new text), notes, status. */
(function(){
  var root = document.getElementById('baptismsRoot');
  var actionsEl = document.getElementById('baptismsActions');
  var tabbarSlot = document.getElementById('teamsTabbarSlot');
  function esc(s){ return (window.TeamsCtx && window.TeamsCtx.esc) ? window.TeamsCtx.esc(s) : String(s == null ? '' : s); }

  var STATUS_LABELS = { planned: 'Planned', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' };
  var STATUS_CHIP_CLASS = { planned: 'is-info', confirmed: 'is-warn', completed: 'is-success', cancelled: 'is-neutral' };
  var state = { baptisms: [] };

  function renderActions(){
    actionsEl.innerHTML = '<button class="teams-btn teams-btn-sm" id="newBaptismBtn" type="button">+ New Baptism</button>';
    document.getElementById('newBaptismBtn').addEventListener('click', function(){ openComposer(null); });
  }

  function fmtDate(d){ return d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' }) : 'Unscheduled'; }

  function load(){
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;
    return sb.from('bst_baptisms').select('*').eq('church_id', churchId).order('baptism_date', { ascending: true }).then(function(res){
      state.baptisms = res.error ? [] : (res.data || []);
      if (res.error) console.error('[Teams baptisms] load error', res.error);
    });
  }

  function row(b){
    var name = b.person_name || 'Unnamed';
    var chipClass = STATUS_CHIP_CLASS[b.status] || 'is-neutral';
    return '<div class="teams-row" data-baptism-id="' + esc(b.id) + '" style="cursor:pointer">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
          '<span class="teams-chip ' + chipClass + '">' + esc(STATUS_LABELS[b.status] || b.status) + '</span>' +
          '<strong style="font-size:var(--t-sm)">' + esc(name) + '</strong>' +
        '</div>' +
        '<div class="teams-card-desc" style="margin-top:4px">' + esc(fmtDate(b.baptism_date)) + (b.service_slot ? ' \u00b7 ' + esc(b.service_slot) : '') + '</div>' +
      '</div>' +
      '<span aria-hidden="true">\u203a</span>' +
    '</div>';
  }

  function render(){
    tabbarSlot.innerHTML = window.TeamsCtx.bottomTabs('baptisms');
    root.innerHTML = state.baptisms.length
      ? state.baptisms.map(row).join('')
      : '<div class="teams-empty"><span class="teams-empty-glyph" aria-hidden="true">\u25F7</span><h2>No baptisms planned</h2><p>Add a name to start planning a baptism service.</p></div>';
    Array.prototype.forEach.call(root.querySelectorAll('[data-baptism-id]'), function(r){
      r.addEventListener('click', function(){
        var b = state.baptisms.filter(function(x){ return x.id === r.getAttribute('data-baptism-id'); })[0];
        if (b) openComposer(b);
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

  function openComposer(existing){
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;
    var b = existing || {};
    var deleteSection = existing
      ? '<div id="bapDeleteSection" style="margin-top:var(--s-4);border-top:1px solid var(--border);padding-top:var(--s-4)">' +
          '<button class="teams-btn teams-btn-sm teams-btn-secondary" id="bapDeleteBtn" type="button" style="color:var(--accent);border-color:var(--accent)">Delete this record</button>' +
        '</div>'
      : '';
    var ov = overlay(
      '<button class="teams-sheet-close" type="button" aria-label="Close">\u2715</button>' +
      '<h2>' + (existing ? 'Edit Baptism' : 'New Baptism') + '</h2>' +
      '<div class="teams-field"><label for="bapName">Name</label><input id="bapName" type="text" value="' + esc(b.person_name || '') + '" /></div>' +
      '<div class="teams-field"><label for="bapDate">Date</label><input id="bapDate" type="date" value="' + esc(b.baptism_date || '') + '" /></div>' +
      '<div class="teams-field"><label for="bapSlot">Service</label><input id="bapSlot" type="text" placeholder="e.g. Sunday evening" value="' + esc(b.service_slot || '') + '" /></div>' +
      '<div class="teams-field"><label for="bapStatus">Status</label><select id="bapStatus">' +
        Object.keys(STATUS_LABELS).map(function(k){ return '<option value="' + k + '"' + ((b.status || 'planned') === k ? ' selected' : '') + '>' + STATUS_LABELS[k] + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="teams-field"><label for="bapNotes">Notes</label><textarea id="bapNotes">' + esc(b.notes || '') + '</textarea></div>' +
      '<div id="bapErr"></div>' +
      '<button class="teams-btn teams-btn-block" id="bapSaveBtn" type="button">' + (existing ? 'Save changes' : 'Add baptism') + '</button>' +
      deleteSection
    );
    ov.querySelector('.teams-sheet-close').addEventListener('click', function(){ ov.remove(); });

    // Delete with inline confirm
    var deleteBtn = ov.querySelector('#bapDeleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function(){
        var section = ov.querySelector('#bapDeleteSection');
        section.innerHTML =
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<span class="teams-card-desc" style="font-size:var(--t-xs)">Delete this baptism record? This cannot be undone.</span>' +
            '<button class="teams-btn teams-btn-sm teams-btn-danger" id="bapDeleteConfirm" type="button">Yes, delete</button>' +
            '<button class="teams-btn teams-btn-sm teams-btn-secondary" id="bapDeleteCancel" type="button">Cancel</button>' +
          '</div>';
        section.querySelector('#bapDeleteCancel').addEventListener('click', function(){ ov.remove(); openComposer(existing); });
        section.querySelector('#bapDeleteConfirm').addEventListener('click', function(){
          var confirmBtn = section.querySelector('#bapDeleteConfirm');
          confirmBtn.disabled = true; confirmBtn.textContent = 'Deleting\u2026';
          sb.from('bst_baptisms').delete().eq('id', existing.id).then(function(res){
            confirmBtn.disabled = false; confirmBtn.textContent = 'Yes, delete';
            if (res.error) { section.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Could not delete.') + '</div>'; return; }
            ov.remove();
            load().then(render);
          });
        });
      });
    }

    ov.querySelector('#bapSaveBtn').addEventListener('click', function(){
      var btn = ov.querySelector('#bapSaveBtn');
      var errEl = ov.querySelector('#bapErr');
      var name = ov.querySelector('#bapName').value.trim();
      var dateVal = ov.querySelector('#bapDate').value;
      var slot = ov.querySelector('#bapSlot').value.trim();
      var status = ov.querySelector('#bapStatus').value;
      var notes = ov.querySelector('#bapNotes').value.trim();
      if (!name) { errEl.innerHTML = '<div class="teams-error">Name is required.</div>'; return; }
      if (!dateVal) { errEl.innerHTML = '<div class="teams-error">Date is required.</div>'; return; }
      var payload = {
        person_name: name,
        baptism_date: dateVal,
        service_slot: slot || null,
        status: status,
        notes: notes || null,
        church_id: churchId
      };
      btn.disabled = true; btn.textContent = 'Saving\u2026';
      var op = existing ? sb.from('bst_baptisms').update(payload).eq('id', existing.id) : sb.from('bst_baptisms').insert(payload);
      op.then(function(res){
        btn.disabled = false; btn.textContent = existing ? 'Save changes' : 'Add baptism';
        if (res.error) { errEl.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Something went wrong.') + '</div>'; return; }
        ov.remove();
        load().then(render);
      });
    });
  }

  window.TeamsCtx.ready.then(function(){
    if (!window.TeamsCtx.requireAccess(root, { adminOnly: true })) return;
    renderActions();
    load().then(render);
  });
})();
