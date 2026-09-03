/* /teams/admin/admin.js — Advanced Church Admin Console
   15 major features:
   1.  Dashboard Stats Bar
   2.  Tabbed Navigation (Overview · Members · Teams · Schedule · Analytics · Audit)
   3.  Pending Approvals (bulk select + approve/reject)
   4.  Church Settings (password, approval toggle)
   5.  Weekly Schedule Defaults (cultivation + service slots)
   6.  Member Directory (search, filter, inline edit, role, deactivate, remove, CSV)
   7.  Team Management (create/edit/delete + member assignment)
   8.  Caseload Overview (per-teacher with status chips + roster link)
   9.  Overdue Follow-ups (full list with teacher, channel, age)
   10. Invite Link Generator (copy shareable join URL)
   11. Activity Log (last 50 admin actions)
   12. Batch Re-assign Students (move students between teachers)
   13. Analytics Panel (student status chart + teacher efficiency)
   14. Role & Permission Summary (read-only access table)
   15. Danger Zone (export all data, clear pending, with confirmation gates)
*/
(function(){
  var root = document.getElementById('adminRoot');
  var tabbarSlot = document.getElementById('teamsTabbarSlot');

  function esc(s){
    return (window.TeamsCtx && window.TeamsCtx.esc)
      ? window.TeamsCtx.esc(s)
      : String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
          return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
        });
  }

  // ── State ──────────────────────────────────────────────────────────────────
  var state = {
    church: null, settings: null, churchSlots: [],
    members: [], teams: [], teamMembers: [],
    overdue: [], students: {}, adminStudents: [],
    activeTab: 'overview'
  };
  var memberFilter = { search: '', showDeactivated: false };

  // ── Data load ──────────────────────────────────────────────────────────────
  function load(){
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;
    return Promise.all([
      sb.from('bst_churches').select('*').eq('id', churchId).maybeSingle(),
      sb.from('bst_members').select('*').eq('church_id', churchId).order('created_at', { ascending: true }),
      sb.from('bst_teams').select('*').eq('church_id', churchId),
      sb.from('bst_team_members').select('*'),
      sb.from('bst_followups').select('*').eq('church_id', churchId).eq('status', 'overdue').order('due_date', { ascending: true }),
      sb.from('bst_church_settings').select('*').eq('church_id', churchId).maybeSingle(),
      sb.from('bst_church_service_slots').select('*').eq('church_id', churchId)
        .order('sort_order', { ascending: true })
        .order('dow', { ascending: true })
        .order('service_time', { ascending: true }),
      sb.from('bst_students').select('id,assigned_teacher_id,status,full_name').eq('church_id', churchId).neq('status', 'dropped')
    ]).then(function(results){
      state.church    = results[0].data || null;
      state.members   = results[1].error ? [] : (results[1].data || []);
      state.teams     = results[2].error ? [] : (results[2].data || []);
      state.teamMembers = results[3].error ? [] : (results[3].data || []);
      state.overdue   = results[4].error ? [] : (results[4].data || []);
      state.settings  = (results[5] && !results[5].error) ? (results[5].data || null) : null;
      state.churchSlots = (results[6] && !results[6].error) ? (results[6].data || []) : [];
      state.adminStudents = (results[7] && !results[7].error) ? (results[7].data || []) : [];
      // Build student name map from adminStudents (includes full_name now)
      state.students = {};
      state.adminStudents.forEach(function(s){ if (s.full_name) state.students[s.id] = s.full_name; });
      // Also fetch names for overdue students not already in adminStudents
      var overdueIds = state.overdue.map(function(f){ return f.student_id; }).filter(Boolean);
      var missing = overdueIds.filter(function(id){ return !state.students[id]; });
      if (!missing.length) return;
      return sb.from('bst_students').select('id,full_name').in('id', missing).then(function(sres){
        (sres.data || []).forEach(function(s){ state.students[s.id] = s.full_name; });
      });
    });
  }

  function memberName(id){
    var m = state.members.filter(function(x){ return x.id === id; })[0];
    return m ? (m.full_name || '') : '';
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  function showToast(msg, isError){
    var toast = document.createElement('div');
    toast.className = 'teams-toast show';
    toast.textContent = msg;
    if (isError){ toast.style.background = '#b91c1c'; toast.style.color = '#fff'; }
    document.body.appendChild(toast);
    setTimeout(function(){ toast.classList.remove('show'); setTimeout(function(){ toast.remove(); }, 300); }, 3500);
  }

  // ── Overlay helper ─────────────────────────────────────────────────────────
  function overlay(innerHtml){
    var ov = document.createElement('div');
    ov.className = 'teams-overlay open';
    ov.innerHTML = '<div class="teams-sheet">' + innerHtml + '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if (e.target === ov) ov.remove(); });
    return ov;
  }

  // ── Confirm overlay ────────────────────────────────────────────────────────
  function confirmOverlay(message, dangerLabel, onConfirm){
    var ov = overlay(
      '<button class="teams-sheet-close" type="button" aria-label="Close">\u2715</button>' +
      '<h2 style="color:var(--accent)">Are you sure?</h2>' +
      '<p style="font-size:var(--t-sm);color:var(--ink-3);margin:0 0 var(--s-5)">' + esc(message) + '</p>' +
      '<div style="display:flex;gap:var(--s-3)">' +
        '<button class="teams-btn teams-btn-block" id="ovConfirmBtn" style="background:#b91c1c;border-color:#b91c1c" type="button">' + esc(dangerLabel) + '</button>' +
        '<button class="teams-btn teams-btn-secondary teams-btn-block" id="ovCancelBtn" type="button">Cancel</button>' +
      '</div>'
    );
    ov.querySelector('#ovCancelBtn').addEventListener('click', function(){ ov.remove(); });
    ov.querySelector('.teams-sheet-close').addEventListener('click', function(){ ov.remove(); });
    ov.querySelector('#ovConfirmBtn').addEventListener('click', function(){ ov.remove(); onConfirm(); });
  }

  // ── Feature 1: Stats Bar ───────────────────────────────────────────────────
  function renderStatsBar(){
    var active = state.members.filter(function(m){ return m.status !== 'pending' && m.active !== false; });
    var pending = state.members.filter(function(m){ return m.status === 'pending'; });
    var teachers = active.filter(function(m){ return m.role === 'teacher' || (m.role === 'church_admin' && m.also_teaches); });
    var totalStudents = state.adminStudents.length;
    var overdueCount = state.overdue.length;
    var stats = [
      { label: 'Members',  value: active.length },
      { label: 'Pending',  value: pending.length,  warn: pending.length > 0 },
      { label: 'Teachers', value: teachers.length },
      { label: 'Teams',    value: state.teams.length },
      { label: 'Students', value: totalStudents },
      { label: 'Overdue',  value: overdueCount, warn: overdueCount > 0 }
    ];
    return '<div class="adm-stats-bar">' +
      stats.map(function(s){
        return '<div class="adm-stat' + (s.warn ? ' adm-stat--warn' : '') + '">' +
          '<div class="adm-stat-val">' + s.value + '</div>' +
          '<div class="adm-stat-label">' + esc(s.label) + '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  // ── Feature 2: Tab Navigation ──────────────────────────────────────────────
  var TABS = [
    { id: 'overview',   label: 'Overview' },
    { id: 'members',    label: 'Members' },
    { id: 'teams',      label: 'Teams' },
    { id: 'schedule',   label: 'Schedule' },
    { id: 'analytics',  label: 'Analytics' },
    { id: 'audit',      label: 'Audit' }
  ];

  function renderTabs(){
    return '<div class="adm-tabs" role="tablist">' +
      TABS.map(function(t){
        var active = state.activeTab === t.id;
        return '<button class="adm-tab' + (active ? ' adm-tab--active' : '') + '" role="tab" ' +
          'aria-selected="' + active + '" data-tab="' + esc(t.id) + '" type="button">' +
          esc(t.label) + '</button>';
      }).join('') +
    '</div>';
  }

  function wireTabs(){
    Array.prototype.forEach.call(root.querySelectorAll('[data-tab]'), function(btn){
      btn.addEventListener('click', function(){
        state.activeTab = btn.getAttribute('data-tab');
        renderTabContent();
      });
    });
  }

  // ── Feature 3: Pending Approvals ──────────────────────────────────────────
  function renderPending(){
    var pending = state.members.filter(function(m){ return m.status === 'pending'; });
    var body;
    if (pending.length) {
      var rows = pending.map(function(m){
        return '<div class="teams-row" data-pending-id="' + esc(m.id) + '" style="align-items:center;gap:var(--s-3)">' +
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:none">' +
            '<input type="checkbox" class="pending-cb" data-cbid="' + esc(m.id) + '" style="width:16px;height:16px" />' +
          '</label>' +
          '<div style="flex:1;min-width:0">' +
            '<strong style="font-size:var(--t-sm)">' + esc(m.full_name || 'Unnamed') + '</strong>' +
            '<div class="teams-card-desc">Requested ' + esc(new Date(m.created_at).toLocaleDateString()) + '</div>' +
            (m.email ? '<div class="teams-card-desc">' + esc(m.email) + '</div>' : '') +
          '</div>' +
          '<div style="display:flex;gap:6px">' +
            '<button class="teams-btn teams-btn-sm" data-approve="' + esc(m.id) + '" type="button">Approve</button>' +
            '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-reject="' + esc(m.id) + '" type="button">Reject</button>' +
          '</div>' +
        '</div>';
      }).join('');
      body = '<div class="adm-bulk-bar" id="pendingBulkBar">' +
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--t-sm)">' +
            '<input type="checkbox" id="pendingSelectAll" style="width:16px;height:16px" /> Select all' +
          '</label>' +
          '<button class="teams-btn teams-btn-sm" id="bulkApproveBtn" type="button" style="display:none">Approve selected (<span id="bulkCount">0</span>)</button>' +
          '<button class="teams-btn teams-btn-sm teams-btn-secondary" id="bulkRejectBtn" type="button" style="display:none">Reject selected</button>' +
        '</div>' + rows;
    } else {
      body = '<div class="teams-empty" style="padding:var(--s-6) var(--s-5)">' +
        '<span class="teams-empty-glyph">\u2714\uFE0F</span>' +
        '<p>No pending requests.</p>' +
      '</div>';
    }
    var pendingCount = state.members.filter(function(m){ return m.status === 'pending'; }).length;
    return '<section class="teams-card adm-section" id="sectionPending">' +
      '<h3 class="teams-card-label">Pending Approvals' +
        (pendingCount ? ' <span class="adm-badge">' + pendingCount + '</span>' : '') +
      '</h3>' + body + '</section>';
  }

  function wirePending(){
    Array.prototype.forEach.call(root.querySelectorAll('[data-approve]'), function(btn){
      btn.addEventListener('click', function(){
        btn.disabled = true; btn.textContent = 'Approving\u2026';
        window.TeamsCtx.sb.rpc('bst_approve_pending_member', { p_member: btn.getAttribute('data-approve') }).then(function(res){
          if (res.error){ showToast('Could not approve: ' + res.error.message, true); btn.disabled = false; btn.textContent = 'Approve'; return; }
          logAction('Approved member');
          load().then(render);
        });
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-reject]'), function(btn){
      btn.addEventListener('click', function(){
        btn.disabled = true; btn.textContent = 'Rejecting\u2026';
        window.TeamsCtx.sb.rpc('bst_reject_pending_member', { p_member: btn.getAttribute('data-reject') }).then(function(res){
          if (res.error){ showToast('Could not reject: ' + res.error.message, true); btn.disabled = false; btn.textContent = 'Reject'; return; }
          logAction('Rejected member');
          load().then(render);
        });
      });
    });
    var selectAllCb = document.getElementById('pendingSelectAll');
    var bulkApproveBtn = document.getElementById('bulkApproveBtn');
    var bulkRejectBtn = document.getElementById('bulkRejectBtn');
    var bulkCountEl = document.getElementById('bulkCount');
    function updateBulkBar(){
      var checked = root.querySelectorAll('.pending-cb:checked');
      var n = checked.length;
      if (bulkApproveBtn) bulkApproveBtn.style.display = n > 0 ? '' : 'none';
      if (bulkRejectBtn)  bulkRejectBtn.style.display  = n > 0 ? '' : 'none';
      if (bulkCountEl)    bulkCountEl.textContent = n;
    }
    if (selectAllCb){
      selectAllCb.addEventListener('change', function(){
        Array.prototype.forEach.call(root.querySelectorAll('.pending-cb'), function(cb){ cb.checked = selectAllCb.checked; });
        updateBulkBar();
      });
    }
    Array.prototype.forEach.call(root.querySelectorAll('.pending-cb'), function(cb){
      cb.addEventListener('change', function(){
        var all = root.querySelectorAll('.pending-cb');
        if (selectAllCb) selectAllCb.checked = Array.prototype.every.call(all, function(c){ return c.checked; });
        updateBulkBar();
      });
    });
    function bulkAction(rpcName, actionLabel){
      var checked = Array.prototype.slice.call(root.querySelectorAll('.pending-cb:checked'));
      if (!checked.length) return;
      var ids = checked.map(function(cb){ return cb.getAttribute('data-cbid'); });
      if (bulkApproveBtn) bulkApproveBtn.disabled = true;
      if (bulkRejectBtn)  bulkRejectBtn.disabled  = true;
      Promise.all(ids.map(function(id){ return window.TeamsCtx.sb.rpc(rpcName, { p_member: id }); }))
        .then(function(results){
          var errors = results.filter(function(r){ return r.error; });
          if (errors.length) showToast(errors.length + ' item(s) could not be ' + actionLabel + '.', true);
          else { logAction('Bulk ' + actionLabel + ' (' + ids.length + ' members)'); }
          load().then(render);
        });
    }
    if (bulkApproveBtn) bulkApproveBtn.addEventListener('click', function(){ bulkAction('bst_approve_pending_member', 'approved'); });
    if (bulkRejectBtn)  bulkRejectBtn.addEventListener('click',  function(){ bulkAction('bst_reject_pending_member',  'rejected'); });
  }

  // ── Feature 4: Church Settings ────────────────────────────────────────────
  function renderSettings(){
    var c = state.church || {};
    return '<section class="teams-card adm-section">' +
      '<h3 class="teams-card-label">Church Settings</h3>' +
      '<div class="adm-settings-grid">' +
        '<div class="teams-field">' +
          '<label>Church name</label>' +
          '<div class="teams-card-desc adm-readonly-val">' + esc(c.name || '\u2014') + '</div>' +
        '</div>' +
        '<div class="teams-field">' +
          '<label>URL slug</label>' +
          '<div class="teams-card-desc adm-readonly-val" style="font-family:monospace">' + esc(c.slug || '\u2014') + '</div>' +
        '</div>' +
        '<div class="teams-field" style="grid-column:1/-1">' +
          '<label for="setPassword">Join password</label>' +
          '<input id="setPassword" type="text" autocomplete="off" placeholder="Leave blank for no password" style="font-size:16px" />' +
          '<div class="teams-field teams-hint">Current password is never shown. Enter a new value to change it, or leave blank to remove it.</div>' +
        '</div>' +
      '</div>' +
      '<div class="teams-checkbox-row">' +
        '<input type="checkbox" id="setApproval"' + (c.requires_approval ? ' checked' : '') + ' />' +
        '<label for="setApproval">Require admin approval for new joiners</label>' +
      '</div>' +
      '<div id="setErr"></div>' +
      '<button class="teams-btn teams-btn-sm" id="setSaveBtn" type="button">Save settings</button>' +
    '</section>';
  }

  function wireSettings(){
    var btn = document.getElementById('setSaveBtn');
    var errEl = document.getElementById('setErr');
    if (!btn) return;
    btn.addEventListener('click', function(){
      errEl.innerHTML = '';
      var password = document.getElementById('setPassword').value;
      var approval = document.getElementById('setApproval').checked;
      btn.disabled = true; btn.textContent = 'Saving\u2026';
      window.TeamsCtx.sb.rpc('bst_set_church_password', {
        p_church: window.TeamsCtx.activeChurchId,
        p_new_password: password || null,
        p_requires_approval: approval
      }).then(function(res){
        btn.disabled = false; btn.textContent = 'Save settings';
        if (res.error){ errEl.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Something went wrong.') + '</div>'; return; }
        logAction('Updated church settings');
        showToast('Settings saved.', false);
        load().then(render);
      });
    });
  }

  // ── Feature 5: Weekly Schedule Defaults ───────────────────────────────────
  var DAY_OPTS = [
    { v: '', label: 'Not set' },
    { v: 0, label: 'Sunday' }, { v: 1, label: 'Monday' }, { v: 2, label: 'Tuesday' },
    { v: 3, label: 'Wednesday' }, { v: 4, label: 'Thursday' }, { v: 5, label: 'Friday' }, { v: 6, label: 'Saturday' }
  ];
  function dayOptionsHtml(sel){
    return DAY_OPTS.map(function(o){
      var isSel = String(sel == null ? '' : sel) === String(o.v);
      return '<option value="' + o.v + '"' + (isSel ? ' selected' : '') + '>' + esc(o.label) + '</option>';
    }).join('');
  }
  function timeVal(t){ return t ? String(t).slice(0, 5) : ''; }

  function renderChurchSlotRow(slot){
    var id = slot.id || '';
    return '<div class="teams-row" data-slot-row="' + esc(id) + '" style="gap:8px;flex-wrap:wrap">' +
      '<input class="wdSlotLabel" type="text" placeholder="Label (optional)" value="' + esc(slot.label || '') + '" style="flex:2;min-width:140px;font-size:16px" />' +
      '<select class="wdSlotDow" style="flex:1;min-width:140px;font-size:16px">' + dayOptionsHtml(slot.dow) + '</select>' +
      '<input class="wdSlotTime" type="time" value="' + esc(timeVal(slot.service_time)) + '" style="flex:0 0 120px;font-size:16px" />' +
      '<button class="teams-btn teams-btn-sm teams-btn-secondary wdSlotRemove" type="button" aria-label="Remove">Remove</button>' +
    '</div>';
  }

  function renderWeeklyDefaults(){
    var s = state.settings || {};
    var slots = state.churchSlots || [];
    var slotsHtml = slots.map(renderChurchSlotRow).join('');
    return '<section class="teams-card adm-section">' +
      '<h3 class="teams-card-label">Weekly Schedule Defaults</h3>' +
      '<p class="teams-card-desc" style="margin-bottom:var(--s-4)">Set recurring day and time for cultivation and church services. Scheduling forms will pre-fill to the next occurrence.</p>' +
      '<div class="teams-field"><label>Cultivation <span class="teams-card-desc" style="font-weight:400">(one per week)</span></label>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<select id="wdCultDow" style="flex:1;min-width:140px;font-size:16px">' + dayOptionsHtml(s.cultivation_dow) + '</select>' +
          '<input id="wdCultTime" type="time" value="' + esc(timeVal(s.cultivation_time)) + '" style="flex:0 0 120px;font-size:16px" />' +
        '</div>' +
      '</div>' +
      '<div id="wdCultErr"></div>' +
      '<div id="wdCultOk" class="teams-card-desc" style="font-size:var(--t-xs);min-height:16px"></div>' +
      '<button class="teams-btn teams-btn-sm" id="wdCultSaveBtn" type="button" style="margin-bottom:var(--s-5)">Save cultivation</button>' +
      '<div class="teams-field"><label>Church services <span class="teams-card-desc" style="font-weight:400">(add as many as you hold each week)</span></label>' +
        '<div id="wdSlots">' + (slotsHtml || '<div class="teams-card-desc">No church services yet.</div>') + '</div>' +
        '<div style="margin-top:8px"><button class="teams-btn teams-btn-sm teams-btn-secondary" id="wdSlotAdd" type="button">+ Add service</button></div>' +
      '</div>' +
      '<div id="wdChErr"></div>' +
      '<div id="wdChOk" class="teams-card-desc" style="font-size:var(--t-xs);min-height:16px"></div>' +
      '<button class="teams-btn teams-btn-sm" id="wdChSaveBtn" type="button">Save church services</button>' +
    '</section>';
  }

  function wireWeeklyDefaults(){
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;
    var cultBtn = document.getElementById('wdCultSaveBtn');
    if (cultBtn){
      cultBtn.addEventListener('click', function(){
        var errEl = document.getElementById('wdCultErr');
        var okEl  = document.getElementById('wdCultOk');
        errEl.innerHTML = ''; okEl.textContent = '';
        var dowRaw  = document.getElementById('wdCultDow').value;
        var timeRaw = document.getElementById('wdCultTime').value;
        var payload = {
          church_id: churchId,
          cultivation_dow:  dowRaw === '' ? null : parseInt(dowRaw, 10),
          cultivation_time: timeRaw || null,
          updated_at: new Date().toISOString()
        };
        cultBtn.disabled = true; cultBtn.textContent = 'Saving\u2026';
        sb.from('bst_church_settings').upsert(payload, { onConflict: 'church_id' }).then(function(res){
          cultBtn.disabled = false; cultBtn.textContent = 'Save cultivation';
          if (res.error){ errEl.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Could not save.') + '</div>'; return; }
          if (!state.settings) state.settings = {};
          state.settings.cultivation_dow  = payload.cultivation_dow;
          state.settings.cultivation_time = payload.cultivation_time;
          logAction('Updated cultivation schedule');
          okEl.textContent = 'Saved.';
          setTimeout(function(){ okEl.textContent = ''; }, 3000);
        });
      });
    }
    var addBtn    = document.getElementById('wdSlotAdd');
    var slotsWrap = document.getElementById('wdSlots');
    if (!slotsWrap) return;
    function attachRowHandlers(row){
      var rb = row.querySelector('.wdSlotRemove');
      if (rb) rb.addEventListener('click', function(){
        row.remove();
        if (!slotsWrap.querySelector('[data-slot-row]')) slotsWrap.innerHTML = '<div class="teams-card-desc">No church services yet.</div>';
      });
    }
    Array.prototype.forEach.call(slotsWrap.querySelectorAll('[data-slot-row]'), attachRowHandlers);
    if (addBtn){
      addBtn.addEventListener('click', function(){
        if (!slotsWrap.querySelector('[data-slot-row]')) slotsWrap.innerHTML = '';
        var tmp = document.createElement('div');
        tmp.innerHTML = renderChurchSlotRow({});
        var row = tmp.firstChild;
        slotsWrap.appendChild(row);
        attachRowHandlers(row);
      });
    }
    var chBtn = document.getElementById('wdChSaveBtn');
    if (chBtn){
      chBtn.addEventListener('click', function(){
        var errEl = document.getElementById('wdChErr');
        var okEl  = document.getElementById('wdChOk');
        errEl.innerHTML = ''; okEl.textContent = '';
        var rows = slotsWrap.querySelectorAll('[data-slot-row]');
        var rowsData = []; var bad = false;
        Array.prototype.forEach.call(rows, function(r, idx){
          var id      = r.getAttribute('data-slot-row') || '';
          var label   = r.querySelector('.wdSlotLabel').value.trim();
          var dowRaw  = r.querySelector('.wdSlotDow').value;
          var timeRaw = r.querySelector('.wdSlotTime').value;
          if (dowRaw === '' || !timeRaw){ bad = true; return; }
          rowsData.push({ id: id || null, label: label || null, dow: parseInt(dowRaw, 10), service_time: timeRaw, sort_order: idx });
        });
        if (bad){ errEl.innerHTML = '<div class="teams-error">Every service needs a day and a time.</div>'; return; }
        chBtn.disabled = true; chBtn.textContent = 'Saving\u2026';
        var keepIds = rowsData.filter(function(r){ return r.id; }).map(function(r){ return r.id; });
        var toDelete = (state.churchSlots || []).filter(function(s){ return keepIds.indexOf(s.id) === -1; }).map(function(s){ return s.id; });
        var toUpsert = rowsData.map(function(r){
          var row = { church_id: churchId, label: r.label, dow: r.dow, service_time: r.service_time, sort_order: r.sort_order, updated_at: new Date().toISOString() };
          if (r.id) row.id = r.id;
          return row;
        });
        var deletePromise = toDelete.length ? sb.from('bst_church_service_slots').delete().in('id', toDelete) : Promise.resolve({ error: null });
        deletePromise.then(function(delRes){
          if (delRes && delRes.error) throw delRes.error;
          if (!toUpsert.length) return { error: null };
          return sb.from('bst_church_service_slots').upsert(toUpsert);
        }).then(function(upRes){
          chBtn.disabled = false; chBtn.textContent = 'Save church services';
          if (upRes && upRes.error){ errEl.innerHTML = '<div class="teams-error">' + esc(upRes.error.message || 'Could not save.') + '</div>'; return; }
          logAction('Updated church service slots');
          okEl.textContent = 'Saved.';
          load().then(render);
        }).catch(function(err){
          chBtn.disabled = false; chBtn.textContent = 'Save church services';
          errEl.innerHTML = '<div class="teams-error">' + esc((err && err.message) || 'Could not save.') + '</div>';
        });
      });
    }
  }

  // ── Feature 6: Member Directory ───────────────────────────────────────────
  function renderMembers(){
    var active = state.members.filter(function(m){ return m.status !== 'pending'; });
    var adminCount = active.filter(function(m){ return m.role === 'church_admin' && m.active !== false; }).length;
    var myMemberId = (window.TeamsCtx.activeMember && window.TeamsCtx.activeMember.id) || null;
    var q = memberFilter.search.toLowerCase();
    var visible = active.filter(function(m){
      if (!memberFilter.showDeactivated && m.active === false) return false;
      if (q && (m.full_name || '').toLowerCase().indexOf(q) === -1 &&
               (m.email || '').toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var searchHtml =
      '<div class="adm-search-row">' +
        '<input type="search" id="memberSearch" placeholder="Search by name or email\u2026" value="' + esc(memberFilter.search) + '" style="flex:1;min-width:180px;font-size:16px" />' +
        '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--t-sm);white-space:nowrap">' +
          '<input type="checkbox" id="showDeactivated"' + (memberFilter.showDeactivated ? ' checked' : '') + ' /> Show deactivated' +
        '</label>' +
      '</div>';
    var body = visible.length
      ? visible.map(function(m){
          var isMe    = (m.id === myMemberId);
          var isAdmin = (m.role === 'church_admin');
          var canDemote = isAdmin && adminCount > 1;
          var canRemove = !isMe && !(isAdmin && adminCount <= 1);
          var caseloadCount = state.adminStudents.filter(function(s){ return s.assigned_teacher_id === m.id; }).length;
          var promoteBtn = isAdmin
            ? '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-set-role="teacher" data-mid="' + esc(m.id) + '" type="button"' + (canDemote ? '' : ' disabled title="Cannot demote last admin"') + '>Make teacher</button>'
            : '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-set-role="church_admin" data-mid="' + esc(m.id) + '" type="button">Make admin</button>';
          var toggleBtn = '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-toggle-active="' + esc(m.id) + '" data-active="' + (m.active !== false) + '" type="button"' + (isMe ? ' disabled' : '') + '>' + (m.active === false ? 'Reactivate' : 'Deactivate') + '</button>';
          var alsoTeachesBtn = isAdmin
            ? '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-toggle-also-teaches="' + esc(m.id) + '" data-also="' + (m.also_teaches === true) + '" type="button">' + (m.also_teaches ? 'Remove teacher duties' : 'Also serve as teacher') + '</button>'
            : '';
          var removeBtn = '<button class="teams-btn teams-btn-sm" data-remove-member="' + esc(m.id) + '" data-rname="' + esc(m.full_name || 'this member') + '" type="button" style="color:#b91c1c;border-color:#fca5a5;background:transparent"' + (!canRemove ? ' disabled' : '') + '>Remove</button>';
          var roleLabel = isAdmin ? (m.also_teaches ? 'Admin + teacher' : 'Church admin') : 'Teacher';
          var caseloadBadge = (m.role === 'teacher' || (isAdmin && m.also_teaches))
            ? '<span class="teams-chip is-neutral" style="font-size:var(--t-xs)">' + caseloadCount + ' student' + (caseloadCount === 1 ? '' : 's') + '</span>'
            : '';
          return '<div class="teams-row adm-member-row" data-member-row="' + esc(m.id) + '">' +
            '<div class="adm-member-avatar">' + esc((m.full_name || '?').charAt(0).toUpperCase()) + '</div>' +
            '<div style="flex:1;min-width:180px">' +
              '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
                '<strong style="font-size:var(--t-sm)">' + esc(m.full_name || 'Unnamed') + (isMe ? ' <span class="teams-card-desc" style="display:inline">(you)</span>' : '') + '</strong>' +
                caseloadBadge +
              '</div>' +
              '<div class="teams-card-desc">' + esc(roleLabel) + (m.active === false ? ' \u00b7 Deactivated' : '') + '</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">' +
                '<label style="grid-column:1/-1">' +
                  '<span class="teams-card-desc" style="display:block;margin-bottom:2px">Mobile</span>' +
                  '<input class="teams-mem-phone" data-mid="' + esc(m.id) + '" type="tel" placeholder="+1 (555) 123-4567" value="' + esc(m.phone || '') + '" style="font-size:16px;width:100%" />' +
                '</label>' +
                '<label style="grid-column:1/-1">' +
                  '<span class="teams-card-desc" style="display:block;margin-bottom:2px">Email</span>' +
                  '<input class="teams-mem-email" data-mid="' + esc(m.id) + '" type="email" placeholder="you@example.com" value="' + esc(m.email || '') + '" style="font-size:16px;width:100%" />' +
                '</label>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;grid-column:1/-1">' +
                  '<button class="teams-btn teams-btn-sm" data-save-contact="' + esc(m.id) + '" type="button">Save contact</button>' +
                  '<span class="teams-mem-status" data-status-for="' + esc(m.id) + '" style="align-self:center"></span>' +
                '</div>' +
                '<details class="teams-mem-lang" data-mid="' + esc(m.id) + '" style="grid-column:1/-1;margin-top:4px">' +
                  '<summary style="cursor:pointer;font-size:var(--t-sm);color:var(--c-fg)">Languages ' + (Array.isArray(m.languages) && m.languages.length ? '(' + m.languages.length + ')' : '<span class="teams-card-desc">(none)</span>') + '</summary>' +
                  '<div style="margin-top:6px">' +
                    (window.TeamsLanguages ? window.TeamsLanguages.checkboxesHtml('memLang_' + m.id, m.languages || []) : '<div class="teams-card-desc">Language selector unavailable.</div>') +
                    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
                      '<button class="teams-btn teams-btn-sm" data-save-languages="' + esc(m.id) + '" type="button">Save languages</button>' +
                      '<span class="teams-mem-lang-status" data-lang-status-for="' + esc(m.id) + '" style="align-self:center"></span>' +
                    '</div>' +
                  '</div>' +
                '</details>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;gap:var(--s-2);flex-wrap:wrap;align-self:flex-start">' + promoteBtn + alsoTeachesBtn + toggleBtn + removeBtn + '</div>' +
          '</div>';
        }).join('')
      : '<div class="teams-card-desc">No members match your filter.</div>';
    return '<section class="teams-card adm-section" data-members-section>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:var(--s-3);margin-bottom:var(--s-3);flex-wrap:wrap">' +
        '<h3 class="teams-card-label" style="margin:0">Teachers &amp; Members <span class="adm-count">' + active.length + '</span></h3>' +
        '<div style="display:flex;gap:var(--s-2)">' +
          '<button class="teams-btn teams-btn-sm teams-btn-secondary" id="exportMembersBtn" type="button">Export CSV</button>' +
        '</div>' +
      '</div>' +
      searchHtml + body +
    '</section>';
  }

  function wireMembers(){
    var searchEl = document.getElementById('memberSearch');
    if (searchEl){
      searchEl.addEventListener('input', function(e){
        memberFilter.search = e.target.value;
        rerenderMembersSection();
      });
    }
    var showDeactCb = document.getElementById('showDeactivated');
    if (showDeactCb){
      showDeactCb.addEventListener('change', function(){
        memberFilter.showDeactivated = showDeactCb.checked;
        rerenderMembersSection();
      });
    }
    var exportBtn = document.getElementById('exportMembersBtn');
    if (exportBtn){
      exportBtn.addEventListener('click', function(){
        var rows = [['Full Name','Role','Status','Phone','Email','Students','Also Teaches']];
        state.members.filter(function(m){ return m.status !== 'pending'; }).forEach(function(m){
          rows.push([
            m.full_name || '', m.role === 'church_admin' ? 'Church Admin' : 'Teacher',
            m.active === false ? 'Deactivated' : 'Active', m.phone || '', m.email || '',
            state.adminStudents.filter(function(s){ return s.assigned_teacher_id === m.id; }).length,
            m.role === 'church_admin' ? (m.also_teaches ? 'Yes' : 'No') : ''
          ]);
        });
        var csv = rows.map(function(r){ return r.map(function(cell){ return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
        var blob = new Blob([csv], { type: 'text/csv' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href = url; a.download = 'members.csv';
        document.body.appendChild(a); a.click();
        setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      });
    }
    Array.prototype.forEach.call(root.querySelectorAll('[data-toggle-active]'), function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-toggle-active');
        var isActive = btn.getAttribute('data-active') === 'true';
        btn.disabled = true;
        window.TeamsCtx.sb.from('bst_members').update({ active: !isActive }).eq('id', id).then(function(res){
          if (res.error){ showToast('Could not update member.', true); btn.disabled = false; return; }
          logAction((isActive ? 'Deactivated' : 'Reactivated') + ' member');
          load().then(render);
        });
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-set-role]'), function(btn){
      btn.addEventListener('click', function(){
        var id   = btn.getAttribute('data-mid');
        var role = btn.getAttribute('data-set-role');
        var label = role === 'church_admin' ? 'promote to church admin' : 'change to teacher';
        var ph = document.createElement('div');
        ph.style.cssText = 'display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap';
        ph.innerHTML = '<span style="font-size:var(--t-xs);color:var(--ink-2)">' + esc(label.charAt(0).toUpperCase() + label.slice(1)) + '?</span>' +
          '<button class="teams-btn teams-btn-sm" data-confirm-role type="button">Yes</button>' +
          '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-cancel-role type="button">Cancel</button>';
        btn.parentNode.replaceChild(ph, btn);
        ph.querySelector('[data-cancel-role]').addEventListener('click', function(){ load().then(render); });
        ph.querySelector('[data-confirm-role]').addEventListener('click', function(){
          var cb = ph.querySelector('[data-confirm-role]');
          cb.disabled = true; cb.textContent = 'Saving\u2026';
          window.TeamsCtx.sb.from('bst_members').update({ role: role }).eq('id', id).then(function(res){
            if (res.error){ showToast('Could not change role.', true); load().then(render); return; }
            logAction('Changed member role to ' + role);
            load().then(render);
          });
        });
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-toggle-also-teaches]'), function(btn){
      btn.addEventListener('click', function(){
        var id   = btn.getAttribute('data-toggle-also-teaches');
        var isOn = btn.getAttribute('data-also') === 'true';
        btn.disabled = true;
        window.TeamsCtx.sb.from('bst_members').update({ also_teaches: !isOn }).eq('id', id).then(function(res){
          if (res.error){ showToast('Could not update.', true); btn.disabled = false; return; }
          load().then(render);
        });
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-save-contact]'), function(btn){
      btn.addEventListener('click', function(){
        var id  = btn.getAttribute('data-save-contact');
        var phi = root.querySelector('.teams-mem-phone[data-mid="' + id + '"]');
        var emi = root.querySelector('.teams-mem-email[data-mid="' + id + '"]');
        var stEl = root.querySelector('.teams-mem-status[data-status-for="' + id + '"]');
        var phone = (phi ? phi.value : '').trim();
        var email = (emi ? emi.value : '').trim();
        if (phone && !/^\+?[0-9\s().-]{7,25}$/.test(phone)){ stEl.innerHTML = '<span class="teams-error" style="display:inline">Phone looks invalid.</span>'; return; }
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ stEl.innerHTML = '<span class="teams-error" style="display:inline">Email looks invalid.</span>'; return; }
        btn.disabled = true; var prev = btn.textContent; btn.textContent = 'Saving\u2026'; stEl.innerHTML = '';
        window.TeamsCtx.sb.from('bst_members').update({ phone: phone || null, email: email || null, updated_at: new Date().toISOString() }).eq('id', id).then(function(res){
          btn.disabled = false; btn.textContent = prev;
          if (res.error){ stEl.innerHTML = '<span class="teams-error" style="display:inline">' + esc(res.error.message || 'Could not save.') + '</span>'; return; }
          stEl.innerHTML = '<span class="teams-note" style="display:inline">Saved.</span>';
          for (var i = 0; i < state.members.length; i++){
            if (state.members[i].id === id){ state.members[i].phone = phone || null; state.members[i].email = email || null; break; }
          }
          setTimeout(function(){ if (stEl) stEl.innerHTML = ''; }, 3000);
        });
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-save-languages]'), function(btn){
      btn.addEventListener('click', function(){
        var id  = btn.getAttribute('data-save-languages');
        var det = root.querySelector('.teams-mem-lang[data-mid="' + id + '"]');
        var stEl = root.querySelector('.teams-mem-lang-status[data-lang-status-for="' + id + '"]');
        if (!det || !window.TeamsLanguages) return;
        var langs = window.TeamsLanguages.readCheckboxes(det);
        btn.disabled = true; var prev = btn.textContent; btn.textContent = 'Saving\u2026'; stEl.innerHTML = '';
        window.TeamsCtx.sb.from('bst_members').update({ languages: langs, updated_at: new Date().toISOString() }).eq('id', id).then(function(res){
          btn.disabled = false; btn.textContent = prev;
          if (res.error){ stEl.innerHTML = '<span class="teams-error" style="display:inline">' + esc(res.error.message || 'Could not save.') + '</span>'; return; }
          stEl.innerHTML = '<span class="teams-note" style="display:inline">Saved.</span>';
          var mb = state.members.filter(function(x){ return x.id === id; })[0];
          if (mb) mb.languages = langs;
          setTimeout(function(){ stEl.innerHTML = ''; }, 2000);
        });
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-remove-member]'), function(btn){
      btn.addEventListener('click', function(){
        if (btn.disabled) return;
        var id   = btn.getAttribute('data-remove-member');
        var name = btn.getAttribute('data-rname') || 'this member';
        var bg   = btn.parentNode;
        var orig = bg.innerHTML;
        bg.innerHTML =
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<span style="font-size:var(--t-xs);color:var(--ink-2)">Remove &ldquo;' + esc(name) + '&rdquo;? Cannot be undone.</span>' +
            '<button class="teams-btn teams-btn-sm" data-confirm-remove style="background:#b91c1c;border-color:#b91c1c;color:#fff" type="button">Yes, remove</button>' +
            '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-cancel-remove type="button">Cancel</button>' +
          '</div>';
        bg.querySelector('[data-cancel-remove]').addEventListener('click', function(){ bg.innerHTML = orig; wireMembers(); });
        bg.querySelector('[data-confirm-remove]').addEventListener('click', function(){
          var cb = bg.querySelector('[data-confirm-remove]');
          cb.disabled = true; cb.textContent = 'Removing\u2026';
          var sb = window.TeamsCtx.sb;
          sb.from('bst_team_members').delete().eq('member_id', id).then(function(r1){
            if (r1.error){ showToast('Could not remove team assignments.', true); bg.innerHTML = orig; wireMembers(); return; }
            sb.from('bst_members').delete().eq('id', id).then(function(r2){
              if (r2.error){ showToast('Could not remove member.', true); bg.innerHTML = orig; wireMembers(); return; }
              logAction('Removed member: ' + name);
              showToast(name + ' removed.', false);
              load().then(render);
            });
          });
        });
      });
    });
  }

  function rerenderMembersSection(){
    var oldSec = root.querySelector('[data-members-section]');
    if (!oldSec) return; // section not currently visible — no-op
    var tmp = document.createElement('div');
    tmp.innerHTML = renderMembers();
    var newSec = tmp.firstElementChild;
    if (newSec){ oldSec.parentNode.replaceChild(newSec, oldSec); wireMembers(); }
  }

  // ── Feature 7: Team Management ────────────────────────────────────────────
  function renderTeams(){
    var body = state.teams.length
      ? state.teams.map(function(t){
          var members = state.teamMembers.filter(function(tm){ return tm.team_id === t.id; });
          var names = members.map(function(tm){ return memberName(tm.member_id); }).filter(Boolean).join(', ') || 'No members assigned';
          return '<div class="teams-row" style="flex-wrap:wrap;gap:var(--s-2)">' +
            '<div style="flex:1;min-width:0">' +
              '<strong style="font-size:var(--t-sm)">' + esc(t.name || 'Team') + '</strong>' +
              '<div class="teams-card-desc">' + esc(members.length) + ' member' + (members.length === 1 ? '' : 's') + ' \u00b7 ' + esc(names) + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
              '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-edit-team="' + esc(t.id) + '" type="button">Edit</button>' +
              '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-delete-team="' + esc(t.id) + '" type="button" style="color:#7a1f2b;border-color:#e5c7cb">Delete</button>' +
            '</div>' +
          '</div>';
        }).join('')
      : '<div class="teams-card-desc">No teams set up yet.</div>';
    return '<section class="teams-card adm-section">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:var(--s-3);margin-bottom:var(--s-3)">' +
        '<h3 class="teams-card-label" style="margin:0">Teams <span class="adm-count">' + state.teams.length + '</span></h3>' +
        '<button class="teams-btn teams-btn-sm" id="newTeamBtn" type="button">+ New Team</button>' +
      '</div>' +
      body +
    '</section>';
  }

  function wireTeams(){
    var nb = document.getElementById('newTeamBtn');
    if (nb) nb.addEventListener('click', function(){ openTeamSheet(null); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-edit-team]'), function(btn){
      btn.addEventListener('click', function(){
        var team = state.teams.filter(function(t){ return t.id === btn.getAttribute('data-edit-team'); })[0];
        if (team) openTeamSheet(team);
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-delete-team]'), function(btn){
      btn.addEventListener('click', function(){
        var id   = btn.getAttribute('data-delete-team');
        var team = state.teams.filter(function(t){ return t.id === id; })[0];
        var name = (team && team.name) || 'this team';
        var bg   = btn.parentNode;
        var orig = bg.innerHTML;
        bg.innerHTML =
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<span style="font-size:var(--t-xs);color:var(--ink-2)">Delete &ldquo;' + esc(name) + '&rdquo;?</span>' +
            '<button class="teams-btn teams-btn-sm teams-btn-danger" data-confirm-del type="button">Yes, delete</button>' +
            '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-cancel-del type="button">Cancel</button>' +
          '</div>';
        bg.querySelector('[data-cancel-del]').addEventListener('click', function(){ bg.innerHTML = orig; wireTeams(); });
        bg.querySelector('[data-confirm-del]').addEventListener('click', function(){
          var cb = bg.querySelector('[data-confirm-del]');
          cb.disabled = true; cb.textContent = 'Deleting\u2026';
          var sb = window.TeamsCtx.sb;
          sb.from('bst_team_members').delete().eq('team_id', id).then(function(r1){
            if (r1.error){ showToast('Could not remove team members.', true); bg.innerHTML = orig; wireTeams(); return; }
            sb.from('bst_teams').delete().eq('id', id).then(function(r2){
              if (r2.error){ showToast('Could not delete team.', true); bg.innerHTML = orig; wireTeams(); return; }
              logAction('Deleted team: ' + name);
              load().then(render);
            });
          });
        });
      });
    });
  }

  function openTeamSheet(existing){
    var sb       = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;
    var t        = existing || {};
    var activeMembers      = state.members.filter(function(m){ return m.status !== 'pending' && m.active !== false; });
    var existingMemberIds  = existing
      ? state.teamMembers.filter(function(tm){ return tm.team_id === existing.id; }).map(function(tm){ return tm.member_id; })
      : [];
    var memberCheckboxes = activeMembers.length
      ? activeMembers.map(function(m){
          var checked = existingMemberIds.indexOf(m.id) !== -1;
          return '<label style="display:flex;align-items:center;gap:8px;font-size:var(--t-sm);padding:4px 0;cursor:pointer">' +
            '<input type="checkbox" name="teamMember" value="' + esc(m.id) + '"' + (checked ? ' checked' : '') + ' style="width:16px;height:16px;flex:none" />' +
            esc(m.full_name || 'Member') + ' <span class="teams-card-desc" style="font-size:var(--t-xs)">(' + esc(m.role === 'church_admin' ? 'Admin' : 'Teacher') + ')</span>' +
          '</label>';
        }).join('')
      : '<div class="teams-card-desc">No active members to assign.</div>';
    var ov = overlay(
      '<button class="teams-sheet-close" type="button" aria-label="Close">\u2715</button>' +
      '<h2>' + (existing ? 'Edit Team' : 'New Team') + '</h2>' +
      '<div class="teams-field"><label for="teamName">Team name</label><input id="teamName" type="text" placeholder="e.g. Evangelism Team" value="' + esc(t.name || '') + '" /></div>' +
      '<div class="teams-field"><label>Members</label>' +
        '<div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r-md);padding:var(--s-3)">' + memberCheckboxes + '</div>' +
      '</div>' +
      '<div id="teamErr"></div>' +
      '<button class="teams-btn teams-btn-block" id="teamSaveBtn" type="button">' + (existing ? 'Save changes' : 'Create team') + '</button>'
    );
    ov.querySelector('.teams-sheet-close').addEventListener('click', function(){ ov.remove(); });
    ov.querySelector('#teamSaveBtn').addEventListener('click', function(){
      var btn   = ov.querySelector('#teamSaveBtn');
      var errEl = ov.querySelector('#teamErr');
      var name  = ov.querySelector('#teamName').value.trim();
      if (!name){ errEl.innerHTML = '<div class="teams-error">Team name is required.</div>'; return; }
      var selectedIds = Array.prototype.slice.call(ov.querySelectorAll('input[name="teamMember"]:checked')).map(function(cb){ return cb.value; });
      btn.disabled = true; btn.textContent = 'Saving\u2026';
      function saveMemberships(teamId){
        sb.from('bst_team_members').delete().eq('team_id', teamId).then(function(delRes){
          if (delRes.error){ errEl.innerHTML = '<div class="teams-error">Could not update members: ' + esc(delRes.error.message) + '</div>'; btn.disabled = false; btn.textContent = existing ? 'Save changes' : 'Create team'; return; }
          if (!selectedIds.length){ ov.remove(); load().then(render); return; }
          sb.from('bst_team_members').insert(selectedIds.map(function(mid){ return { team_id: teamId, member_id: mid }; })).then(function(insRes){
            btn.disabled = false; btn.textContent = existing ? 'Save changes' : 'Create team';
            if (insRes.error){ errEl.innerHTML = '<div class="teams-error">Team saved but members failed: ' + esc(insRes.error.message) + '</div>'; load().then(render); return; }
            logAction((existing ? 'Updated' : 'Created') + ' team: ' + name);
            ov.remove(); load().then(render);
          });
        });
      }
      if (existing){
        sb.from('bst_teams').update({ name: name }).eq('id', existing.id).then(function(res){
          if (res.error){ errEl.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Could not update team.') + '</div>'; btn.disabled = false; btn.textContent = 'Save changes'; return; }
          saveMemberships(existing.id);
        });
      } else {
        sb.from('bst_teams').insert({ church_id: churchId, name: name }).select('id').single().then(function(res){
          if (res.error || !res.data){ errEl.innerHTML = '<div class="teams-error">' + esc((res.error && res.error.message) || 'Could not create team.') + '</div>'; btn.disabled = false; btn.textContent = 'Create team'; return; }
          saveMemberships(res.data.id);
        });
      }
    });
  }

  // ── Feature 8: Caseload Overview ──────────────────────────────────────────
  var CASELOAD_STATUS_LABELS = {
    new_intake: 'New Intake', prospect: 'Prospect', cultivating: 'Cultivating', active: 'Active', paused: 'Paused'
  };
  var CASELOAD_STATUS_ORDER = ['new_intake', 'prospect', 'cultivating', 'active', 'paused'];

  function renderCaseloads(){
    var teachers = state.members.filter(function(m){
      return m.status === 'active' && m.active !== false && (m.role === 'teacher' || (m.role === 'church_admin' && m.also_teaches === true));
    });
    var total = state.adminStudents.length;
    var body = teachers.length
      ? teachers.map(function(t){
          var mine  = state.adminStudents.filter(function(s){ return s.assigned_teacher_id === t.id; });
          var count = mine.length;
          var pct   = total > 0 ? Math.round((count / total) * 100) : 0;
          var chipHtml = '';
          CASELOAD_STATUS_ORDER.forEach(function(sk){
            var cnt = mine.filter(function(s){ return s.status === sk; }).length;
            if (!cnt) return;
            chipHtml += '<span class="teams-chip is-neutral" style="font-size:var(--t-xs)">' + esc(CASELOAD_STATUS_LABELS[sk]) + ': ' + cnt + '</span>';
          });
          return '<div class="teams-row adm-caseload-row">' +
            '<div class="adm-member-avatar">' + esc((t.full_name || '?').charAt(0).toUpperCase()) + '</div>' +
            '<div style="flex:1;min-width:0">' +
              '<strong style="font-size:var(--t-sm)">' + esc(t.full_name) + '</strong>' +
              '<div class="teams-card-desc">' + count + ' student' + (count === 1 ? '' : 's') + ' (' + pct + '% of total)</div>' +
              (chipHtml ? '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">' + chipHtml + '</div>' : '') +
              '<div class="adm-progress-bar" style="margin-top:6px"><div class="adm-progress-fill" style="width:' + pct + '%"></div></div>' +
            '</div>' +
            '<a class="teams-btn teams-btn-sm teams-btn-secondary" href="/students/?teacher=' + esc(t.id) + '" style="align-self:center">View roster \u203a</a>' +
          '</div>';
        }).join('')
      : '<div class="teams-card-desc">No active teachers yet.</div>';
    return '<section class="teams-card adm-section"><h3 class="teams-card-label">Caseloads</h3>' + body + '</section>';
  }

  // ── Feature 9: Overdue Follow-ups ─────────────────────────────────────────
  // Build a student-id -> teacher-id map from adminStudents for teacher lookup
  function buildStudentTeacherMap(){
    var map = {};
    state.adminStudents.forEach(function(s){ map[s.id] = s.assigned_teacher_id; });
    return map;
  }

  function renderOverdue(){
    var now = Date.now();
    var studentTeacher = buildStudentTeacherMap();
    var body = state.overdue.length
      ? state.overdue.map(function(f){
          var name       = state.students[f.student_id] || 'Prospect';
          var teacherId  = studentTeacher[f.student_id] || null;
          var teacher    = teacherId ? memberName(teacherId) : '';
          var dueDate    = f.due_date ? new Date(f.due_date) : null;
          var daysAgo    = dueDate ? Math.floor((now - dueDate.getTime()) / 86400000) : null;
          var ageLabel   = daysAgo !== null ? (daysAgo === 0 ? 'Today' : daysAgo + 'd ago') : '';
          return '<a class="teams-row" href="/student/?id=' + esc(f.student_id) + '" style="text-decoration:none">' +
            '<div style="flex:1;min-width:0">' +
              '<strong style="font-size:var(--t-sm)">' + esc(name) + '</strong>' +
              '<div class="teams-card-desc">' +
                (f.channel ? esc(f.channel) + ' \u00b7 ' : '') +
                (teacher ? 'Teacher: ' + esc(teacher) + ' \u00b7 ' : '') +
                '<span style="color:var(--accent)">' + esc(ageLabel) + '</span>' +
              '</div>' +
            '</div>' +
            '<span class="teams-chip is-danger" style="flex:none">' + esc(ageLabel || 'Overdue') + '</span>' +
          '</a>';
        }).join('')
      : '<div class="teams-empty" style="padding:var(--s-6) var(--s-5)">' +
          '<span class="teams-empty-glyph">\u2714\uFE0F</span>' +
          '<p>No overdue follow-ups. Great work!</p>' +
        '</div>';
    return '<section class="teams-card adm-section"><h3 class="teams-card-label">All Overdue Follow-ups' +
      (state.overdue.length ? ' <span class="adm-badge">' + state.overdue.length + '</span>' : '') +
      '</h3>' + body + '</section>';
  }

  // ── Feature 10: Invite Link Generator ────────────────────────────────────
  function renderInviteLink(){
    var c    = state.church || {};
    var base = window.location.origin + '/join/?church=' + encodeURIComponent(c.slug || c.id || '');
    return '<section class="teams-card adm-section">' +
      '<h3 class="teams-card-label">Invite Link Generator</h3>' +
      '<p class="teams-card-desc" style="margin-bottom:var(--s-3)">Share this link with people you want to invite. They will be directed to join your church on ChurchTeams.</p>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<input id="inviteLinkInput" type="text" readonly value="' + esc(base) + '" style="flex:1;min-width:200px;font-size:14px;font-family:monospace;background:var(--surface-2)" />' +
        '<button class="teams-btn teams-btn-sm" id="copyInviteBtn" type="button">Copy link</button>' +
      '</div>' +
      '<div style="margin-top:var(--s-3)">' +
        '<label style="display:flex;align-items:center;gap:6px;font-size:var(--t-sm);cursor:pointer">' +
          '<input type="checkbox" id="inviteIncludePassword" style="width:16px;height:16px" /> Include join password in link (if set)' +
        '</label>' +
      '</div>' +
      '<div id="inviteCopyStatus" class="teams-card-desc" style="font-size:var(--t-xs);min-height:16px;margin-top:6px"></div>' +
    '</section>';
  }

  function wireInviteLink(){
    var c    = state.church || {};
    var base = window.location.origin + '/join/?church=' + encodeURIComponent(c.slug || c.id || '');
    var input = document.getElementById('inviteLinkInput');
    var copyBtn = document.getElementById('copyInviteBtn');
    var inclPw  = document.getElementById('inviteIncludePassword');
    var statusEl = document.getElementById('inviteCopyStatus');
    if (!copyBtn) return;
    function buildLink(){
      var url = base;
      if (inclPw && inclPw.checked && state.settings && state.settings.join_password){
        url += '&pw=' + encodeURIComponent(state.settings.join_password);
      }
      return url;
    }
    if (inclPw) inclPw.addEventListener('change', function(){ if (input) input.value = buildLink(); });
    copyBtn.addEventListener('click', function(){
      var link = buildLink();
      if (input) input.value = link;
      if (navigator.clipboard){
        navigator.clipboard.writeText(link).then(function(){
          statusEl.textContent = 'Copied to clipboard!';
          setTimeout(function(){ statusEl.textContent = ''; }, 2500);
        }).catch(function(){ fallbackCopy(link); });
      } else { fallbackCopy(link); }
    });
    function fallbackCopy(text){
      if (input){ input.select(); try { document.execCommand('copy'); statusEl.textContent = 'Copied!'; setTimeout(function(){ statusEl.textContent = ''; }, 2500); } catch(e){ statusEl.textContent = 'Could not copy. Please copy manually.'; } }
    }
  }

  // ── Feature 11: Activity Log ──────────────────────────────────────────────
  // Single source of truth — plain module-level array, not on state
  var activityLog = [];
  function logAction(label){
    var myName = (window.TeamsCtx.activeMember && window.TeamsCtx.activeMember.full_name) || 'Admin';
    activityLog.unshift({ label: label, who: myName, ts: new Date() });
    if (activityLog.length > 50) activityLog.length = 50;
  }

  function renderActivityLog(){
    var body = activityLog.length
      ? '<div class="adm-log-list">' + activityLog.map(function(e){
          return '<div class="adm-log-item">' +
            '<div class="adm-log-dot"></div>' +
            '<div style="flex:1">' +
              '<div style="font-size:var(--t-sm)">' + esc(e.label) + '</div>' +
              '<div class="teams-card-desc">' + esc(e.who) + ' \u00b7 ' + esc(e.ts.toLocaleTimeString()) + '</div>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>'
      : '<div class="teams-card-desc">No actions recorded yet this session.</div>';
    return '<section class="teams-card adm-section">' +
      '<h3 class="teams-card-label">Activity Log <span class="teams-card-desc" style="font-weight:400;font-size:var(--t-xs)">(this session)</span></h3>' +
      body +
    '</section>';
  }

  // ── Feature 12: Batch Re-assign Students ─────────────────────────────────
  function renderReassign(){
    var teachers = state.members.filter(function(m){
      return m.status === 'active' && m.active !== false && (m.role === 'teacher' || (m.role === 'church_admin' && m.also_teaches));
    });
    if (teachers.length < 2){
      return '<section class="teams-card adm-section">' +
        '<h3 class="teams-card-label">Batch Re-assign Students</h3>' +
        '<div class="teams-card-desc">Need at least 2 active teachers to re-assign students.</div>' +
      '</section>';
    }
    var teacherOptions = teachers.map(function(t){
      return '<option value="' + esc(t.id) + '">' + esc(t.full_name) + '</option>';
    }).join('');
    return '<section class="teams-card adm-section">' +
      '<h3 class="teams-card-label">Batch Re-assign Students</h3>' +
      '<p class="teams-card-desc" style="margin-bottom:var(--s-3)">Move all students from one teacher to another in one action.</p>' +
      '<div class="adm-reassign-grid">' +
        '<div class="teams-field">' +
          '<label for="raFrom">From teacher</label>' +
          '<select id="raFrom" style="font-size:16px"><option value="">Select teacher\u2026</option>' + teacherOptions + '</select>' +
        '</div>' +
        '<div class="adm-reassign-arrow">\u2192</div>' +
        '<div class="teams-field">' +
          '<label for="raTo">To teacher</label>' +
          '<select id="raTo" style="font-size:16px"><option value="">Select teacher\u2026</option>' + teacherOptions + '</select>' +
        '</div>' +
      '</div>' +
      '<div id="raPreview" class="teams-card-desc" style="margin-bottom:var(--s-3)"></div>' +
      '<div id="raErr"></div>' +
      '<button class="teams-btn teams-btn-sm" id="raBtn" type="button" disabled>Re-assign students</button>' +
    '</section>';
  }

  function wireReassign(){
    var fromSel  = document.getElementById('raFrom');
    var toSel    = document.getElementById('raTo');
    var preview  = document.getElementById('raPreview');
    var raBtn    = document.getElementById('raBtn');
    var raErr    = document.getElementById('raErr');
    if (!fromSel || !toSel || !raBtn) return;
    function updatePreview(){
      var fromId = fromSel.value;
      var toId   = toSel.value;
      if (!fromId || !toId || fromId === toId){ raBtn.disabled = true; preview.textContent = ''; return; }
      var count = state.adminStudents.filter(function(s){ return s.assigned_teacher_id === fromId; }).length;
      var fromName = memberName(fromId);
      var toName   = memberName(toId);
      preview.textContent = 'Will move ' + count + ' student' + (count === 1 ? '' : 's') + ' from ' + fromName + ' to ' + toName + '.';
      raBtn.disabled = count === 0 || fromId === toId;
    }
    fromSel.addEventListener('change', updatePreview);
    toSel.addEventListener('change', updatePreview);
    raBtn.addEventListener('click', function(){
      var fromId = fromSel.value;
      var toId   = toSel.value;
      if (!fromId || !toId || fromId === toId) return;
      var count    = state.adminStudents.filter(function(s){ return s.assigned_teacher_id === fromId; }).length;
      var fromName = memberName(fromId);
      var toName   = memberName(toId);
      confirmOverlay(
        'Move all ' + count + ' student' + (count === 1 ? '' : 's') + ' from ' + fromName + ' to ' + toName + '? This cannot be undone.',
        'Yes, re-assign ' + count + ' student' + (count === 1 ? '' : 's'),
        function(){
          // Snapshot btn reference before render() replaces the DOM
          var btn = document.getElementById('raBtn');
          var err = document.getElementById('raErr');
          if (btn){ btn.disabled = true; btn.textContent = 'Re-assigning\u2026'; }
          window.TeamsCtx.sb.from('bst_students')
            .update({ assigned_teacher_id: toId, updated_at: new Date().toISOString() })
            .eq('assigned_teacher_id', fromId)
            .then(function(res){
              if (res.error){
                if (btn){ btn.disabled = false; btn.textContent = 'Re-assign students'; }
                if (err){ err.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Could not re-assign.') + '</div>'; }
                return;
              }
              logAction('Re-assigned ' + count + ' students from ' + fromName + ' to ' + toName);
              showToast(count + ' student' + (count === 1 ? '' : 's') + ' re-assigned.', false);
              load().then(render);
            });
        }
      );
    });
  }

  // ── Feature 13: Analytics Panel ───────────────────────────────────────────
  function renderAnalytics(){
    var statusCounts = {};
    CASELOAD_STATUS_ORDER.forEach(function(s){ statusCounts[s] = 0; });
    state.adminStudents.forEach(function(s){ if (statusCounts[s.status] !== undefined) statusCounts[s.status]++; });
    var maxCount = Math.max.apply(null, CASELOAD_STATUS_ORDER.map(function(s){ return statusCounts[s]; }).concat([1]));
    var teachers = state.members.filter(function(m){
      return m.status === 'active' && m.active !== false && (m.role === 'teacher' || (m.role === 'church_admin' && m.also_teaches));
    });
    var totalStudents = state.adminStudents.length;
    var overdueCount  = state.overdue.length;
    var overdueRate   = totalStudents > 0 ? Math.round((overdueCount / totalStudents) * 100) : 0;
    // Build student->teacher map to correctly attribute overdue follow-ups
    var studentTeacherMap = buildStudentTeacherMap();
    var barsHtml = CASELOAD_STATUS_ORDER.map(function(s){
      var cnt = statusCounts[s];
      var pct = maxCount > 0 ? Math.round((cnt / maxCount) * 100) : 0;
      return '<div class="adm-bar-item">' +
        '<div class="adm-bar-track"><div class="adm-bar-fill" style="height:' + pct + '%"></div></div>' +
        '<div class="adm-bar-label">' + esc(CASELOAD_STATUS_LABELS[s] || s) + '</div>' +
        '<div class="adm-bar-count">' + cnt + '</div>' +
      '</div>';
    }).join('');
    var teacherRows = teachers.length
      ? teachers.map(function(t){
          var mine  = state.adminStudents.filter(function(s){ return s.assigned_teacher_id === t.id; });
          // Correctly count overdue follow-ups via student->teacher map
          var over  = state.overdue.filter(function(f){ return studentTeacherMap[f.student_id] === t.id; });
          var pct   = totalStudents > 0 ? Math.round((mine.length / totalStudents) * 100) : 0;
          var overRate = mine.length > 0 ? Math.round((over.length / mine.length) * 100) : 0;
          return '<tr>' +
            '<td style="padding:8px 0"><strong>' + esc(t.full_name) + '</strong></td>' +
            '<td style="text-align:right;padding:8px">' + mine.length + '</td>' +
            '<td style="text-align:right;padding:8px">' + pct + '%</td>' +
            '<td style="text-align:right;padding:8px">' + over.length + '</td>' +
            '<td style="text-align:right;padding:8px;color:' + (overRate > 20 ? 'var(--accent)' : 'var(--ink-3)') + '">' + overRate + '%</td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="5" style="padding:8px;color:var(--ink-3)">No teachers yet.</td></tr>';
    return '<section class="teams-card adm-section">' +
      '<h3 class="teams-card-label">Analytics</h3>' +
      '<div class="adm-analytics-summary">' +
        '<div class="adm-analytics-stat"><div class="adm-stat-val">' + totalStudents + '</div><div class="adm-stat-label">Total Students</div></div>' +
        '<div class="adm-analytics-stat"><div class="adm-stat-val">' + teachers.length + '</div><div class="adm-stat-label">Active Teachers</div></div>' +
        '<div class="adm-analytics-stat"><div class="adm-stat-val">' + overdueCount + '</div><div class="adm-stat-label" style="color:' + (overdueCount > 0 ? 'var(--accent)' : 'inherit') + '">Overdue</div></div>' +
        '<div class="adm-analytics-stat"><div class="adm-stat-val">' + overdueRate + '%</div><div class="adm-stat-label">Overdue Rate</div></div>' +
      '</div>' +
      '<h4 style="font-size:var(--t-xs);font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin:var(--s-4) 0 var(--s-3)">Students by Status</h4>' +
      '<div class="adm-bar-chart">' + barsHtml + '</div>' +
      '<h4 style="font-size:var(--t-xs);font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin:var(--s-5) 0 var(--s-3)">Teacher Efficiency</h4>' +
      '<div style="overflow-x:auto"><table class="adm-table" style="width:100%">' +
        '<thead><tr>' +
          '<th style="text-align:left;padding:8px 0">Teacher</th>' +
          '<th style="text-align:right;padding:8px">Students</th>' +
          '<th style="text-align:right;padding:8px">Share</th>' +
          '<th style="text-align:right;padding:8px">Overdue</th>' +
          '<th style="text-align:right;padding:8px">Rate</th>' +
        '</tr></thead>' +
        '<tbody>' + teacherRows + '</tbody>' +
      '</table></div>' +
    '</section>';
  }

  // ── Feature 14: Role & Permission Summary ─────────────────────────────────
  function renderPermissions(){
    var PERM_MAP = [
      { role: 'Church Admin', access: 'Full access to all admin features, settings, members, teams, students and analytics.' },
      { role: 'Teacher',      access: 'View own student roster, log sessions, schedule follow-ups, and update student profiles.' }
    ];
    var permRows = PERM_MAP.map(function(p){
      return '<tr>' +
        '<td style="padding:10px 0;font-weight:600">' + esc(p.role) + '</td>' +
        '<td style="padding:10px 8px;color:var(--ink-3);font-size:var(--t-sm)">' + esc(p.access) + '</td>' +
      '</tr>';
    }).join('');
    var active = state.members.filter(function(m){ return m.status !== 'pending' && m.active !== false; });
    var memberRows = active.map(function(m){
      var isAdmin  = m.role === 'church_admin';
      var roleLabel = isAdmin ? (m.also_teaches ? 'Admin + Teacher' : 'Church Admin') : 'Teacher';
      var caseload = state.adminStudents.filter(function(s){ return s.assigned_teacher_id === m.id; }).length;
      var teams    = state.teamMembers.filter(function(tm){ return tm.member_id === m.id; }).map(function(tm){
        var t = state.teams.filter(function(t){ return t.id === tm.team_id; })[0];
        return t ? t.name : '';
      }).filter(Boolean).join(', ') || '\u2014';
      return '<tr>' +
        '<td style="padding:8px 0"><strong>' + esc(m.full_name || 'Unnamed') + '</strong></td>' +
        '<td style="padding:8px"><span class="teams-chip ' + (isAdmin ? 'is-warn' : 'is-info') + '">' + esc(roleLabel) + '</span></td>' +
        '<td style="padding:8px;font-size:var(--t-sm);color:var(--ink-3)">' + esc(teams) + '</td>' +
        '<td style="text-align:right;padding:8px">' + caseload + '</td>' +
      '</tr>';
    }).join('');
    return '<section class="teams-card adm-section">' +
      '<h3 class="teams-card-label">Role &amp; Permission Summary</h3>' +
      '<h4 style="font-size:var(--t-xs);font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin:0 0 var(--s-3)">Permission levels</h4>' +
      '<div style="overflow-x:auto"><table class="adm-table" style="width:100%"><tbody>' + permRows + '</tbody></table></div>' +
      '<h4 style="font-size:var(--t-xs);font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin:var(--s-5) 0 var(--s-3)">Current member access</h4>' +
      '<div style="overflow-x:auto"><table class="adm-table" style="width:100%">' +
        '<thead><tr>' +
          '<th style="text-align:left;padding:8px 0">Name</th>' +
          '<th style="text-align:left;padding:8px">Role</th>' +
          '<th style="text-align:left;padding:8px">Teams</th>' +
          '<th style="text-align:right;padding:8px">Students</th>' +
        '</tr></thead>' +
        '<tbody>' + memberRows + '</tbody>' +
      '</table></div>' +
    '</section>';
  }

  // ── Feature 15: Danger Zone ───────────────────────────────────────────────
  function renderDangerZone(){
    return '<section class="teams-card adm-section adm-danger-zone">' +
      '<h3 class="teams-card-label" style="color:var(--accent)">\u26A0\uFE0F Danger Zone</h3>' +
      '<p class="teams-card-desc" style="margin-bottom:var(--s-4)">These actions are irreversible. Proceed with caution.</p>' +
      '<div class="adm-danger-actions">' +
        '<div class="adm-danger-item">' +
          '<div>' +
            '<strong style="font-size:var(--t-sm)">Export all church data</strong>' +
            '<div class="teams-card-desc">Download a CSV of all students, members, and sessions.</div>' +
          '</div>' +
          '<button class="teams-btn teams-btn-sm teams-btn-secondary" id="exportAllBtn" type="button">Export all data</button>' +
        '</div>' +
        '<div class="adm-danger-item">' +
          '<div>' +
            '<strong style="font-size:var(--t-sm)">Clear all pending requests</strong>' +
            '<div class="teams-card-desc">Permanently reject and delete all pending membership requests.</div>' +
          '</div>' +
          '<button class="teams-btn teams-btn-sm" id="clearPendingBtn" type="button" style="background:#b91c1c;border-color:#b91c1c">Clear all pending</button>' +
        '</div>' +
        '<div class="adm-danger-item">' +
          '<div>' +
            '<strong style="font-size:var(--t-sm)">Reset all overdue statuses</strong>' +
            '<div class="teams-card-desc">Mark all overdue follow-ups as snoozed to clear the overdue list.</div>' +
          '</div>' +
          '<button class="teams-btn teams-btn-sm" id="resetOverdueBtn" type="button" style="background:#b91c1c;border-color:#b91c1c">Reset overdue</button>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function wireDangerZone(){
    var exportAllBtn = document.getElementById('exportAllBtn');
    if (exportAllBtn){
      exportAllBtn.addEventListener('click', function(){
        var rows = [['Type','ID','Name','Status','Teacher','Phone','Email','Created']];
        state.adminStudents.forEach(function(s){
          var teacher = memberName(s.assigned_teacher_id);
          rows.push(['student', s.id, s.full_name || '', s.status || '', teacher, '', '', '']);
        });
        state.members.forEach(function(m){
          rows.push(['member', m.id, m.full_name || '', m.role || '', '', m.phone || '', m.email || '', m.created_at ? new Date(m.created_at).toLocaleDateString() : '']);
        });
        var csv = rows.map(function(r){ return r.map(function(cell){ return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
        var blob = new Blob([csv], { type: 'text/csv' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href = url; a.download = 'church-export.csv';
        document.body.appendChild(a); a.click();
        setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        logAction('Exported all church data');
        showToast('Export downloaded.', false);
      });
    }
    var clearPendingBtn = document.getElementById('clearPendingBtn');
    if (clearPendingBtn){
      clearPendingBtn.addEventListener('click', function(){
        var pending = state.members.filter(function(m){ return m.status === 'pending'; });
        if (!pending.length){ showToast('No pending requests to clear.', false); return; }
        confirmOverlay(
          'This will permanently reject and delete all ' + pending.length + ' pending membership requests. This cannot be undone.',
          'Yes, clear all ' + pending.length + ' requests',
          function(){
            var ids = pending.map(function(m){ return m.id; });
            Promise.all(ids.map(function(id){ return window.TeamsCtx.sb.rpc('bst_reject_pending_member', { p_member: id }); }))
              .then(function(){
                logAction('Cleared all pending requests (' + ids.length + ')');
                showToast('All pending requests cleared.', false);
                load().then(render);
              });
          }
        );
      });
    }
    var resetOverdueBtn = document.getElementById('resetOverdueBtn');
    if (resetOverdueBtn){
      resetOverdueBtn.addEventListener('click', function(){
        var count = state.overdue.length;
        if (!count){ showToast('No overdue follow-ups to reset.', false); return; }
        confirmOverlay(
          'Mark all ' + count + ' overdue follow-up' + (count === 1 ? '' : 's') + ' as snoozed? This cannot be undone.',
          'Yes, reset ' + count + ' overdue',
          function(){
            var ids = state.overdue.map(function(f){ return f.id; });
            window.TeamsCtx.sb.from('bst_followups')
              .update({ status: 'snoozed', updated_at: new Date().toISOString() })
              .in('id', ids)
              .then(function(res){
                if (res.error){ showToast('Could not reset overdue.', true); return; }
                logAction('Reset all overdue follow-ups (' + count + ')');
                showToast('Overdue follow-ups reset.', false);
                load().then(render);
              });
          }
        );
      });
    }
  }

  // ── Tab content renderer ──────────────────────────────────────────────────
  function renderTabContent(){
    var tabStrip = root.querySelector('.adm-tabs');
    if (tabStrip){
      tabStrip.innerHTML = TABS.map(function(t){
        var active = state.activeTab === t.id;
        return '<button class="adm-tab' + (active ? ' adm-tab--active' : '') + '" role="tab" aria-selected="' + active + '" data-tab="' + esc(t.id) + '" type="button">' + esc(t.label) + '</button>';
      }).join('');
      wireTabs();
    }
    var content = root.querySelector('.adm-tab-content');
    if (!content) return;
    var tab = state.activeTab;
    var html = '';
    if (tab === 'overview'){
      html = renderPending() + renderCaseloads() + renderOverdue();
    } else if (tab === 'members'){
      html = renderMembers() + renderPermissions();
    } else if (tab === 'teams'){
      html = renderTeams();
    } else if (tab === 'schedule'){
      html = renderWeeklyDefaults() + renderInviteLink();
    } else if (tab === 'analytics'){
      html = renderAnalytics() + renderReassign();
    } else if (tab === 'audit'){
      html = renderSettings() + renderActivityLog() + renderDangerZone();
    }
    content.innerHTML = html;
    // Wire whichever sections are now in the DOM
    if (tab === 'overview'){ wirePending(); }
    if (tab === 'members'){ wireMembers(); }
    if (tab === 'teams'){ wireTeams(); }
    if (tab === 'schedule'){ wireWeeklyDefaults(); wireInviteLink(); }
    if (tab === 'analytics'){ wireReassign(); }
    if (tab === 'audit'){ wireSettings(); wireDangerZone(); }
  }

  // ── Master render ─────────────────────────────────────────────────────────
  function render(){
    tabbarSlot.innerHTML = window.TeamsCtx.bottomTabs('admin');
    root.innerHTML =
      renderStatsBar() +
      renderTabs() +
      '<div class="adm-tab-content"></div>';
    wireTabs();
    renderTabContent();
  }

  window.TeamsCtx.ready.then(function(){
    if (!window.TeamsCtx.requireAccess(root, { adminOnly: true })) return;
    load().then(render);
  });
})();
