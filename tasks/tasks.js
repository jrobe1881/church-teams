/* /teams/tasks/tasks.js — Follow-up task list and the outcome sheet.
   Outcome dropdown is a UI concept (bst_followups has no such enum) and
   intentionally excludes "baptized" per spec. Columns: due_date (date),
   assignee_id, channel, status, origin, note. */
(function(){
  var root = document.getElementById('tasksRoot');
  var actionsEl = document.getElementById('tasksActions');
  var tabbarSlot = document.getElementById('teamsTabbarSlot');
  function esc(s){ return (window.TeamsCtx && window.TeamsCtx.esc) ? window.TeamsCtx.esc(s) : String(s == null ? '' : s); }

  var OUTCOMES = [
    { value: 'connected', label: 'Connected' },
    { value: 'left_message', label: 'Left message' },
    { value: 'no_answer', label: 'No answer' },
    { value: 'scheduled_study', label: 'Scheduled a study' },
    { value: 'needs_reassignment', label: 'Needs reassignment' },
    { value: 'not_interested', label: 'Not interested' }
  ];
  var STATUS_LABELS = { open: 'Open', done: 'Done', skipped: 'Skipped', snoozed: 'Snoozed', overdue: 'Overdue' };

  var state = { followups: [], students: {}, members: {}, filter: 'open' };

  function renderActions(){
    actionsEl.innerHTML =
      '<button class="teams-chip is-selected" data-f="open">Open</button>' +
      '<button class="teams-chip" data-f="today">Today</button>' +
      '<button class="teams-chip" data-f="overdue">Overdue</button>' +
      '<button class="teams-chip" data-f="all">All</button>';
    Array.prototype.forEach.call(actionsEl.querySelectorAll('[data-f]'), function(btn){
      btn.addEventListener('click', function(){
        state.filter = btn.getAttribute('data-f');
        Array.prototype.forEach.call(actionsEl.querySelectorAll('[data-f]'), function(b){ b.classList.toggle('is-selected', b === btn); });
        render();
      });
    });
  }

  function load(){
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;
    var isAdmin = window.TeamsCtx.isChurchAdmin || window.TeamsCtx.isSiteAdmin;
    var q = sb.from('bst_followups').select('*').eq('church_id', churchId).order('due_date', { ascending: true });
    if (!isAdmin && window.TeamsCtx.activeMember) q = q.eq('assignee_id', window.TeamsCtx.activeMember.id);
    return q.then(function(res){
      state.followups = res.error ? [] : (res.data || []);
      if (res.error) { console.error('[Teams tasks] load error', res.error); return; }
      var studentIds = Array.from(new Set(state.followups.map(function(f){ return f.student_id; }).filter(Boolean)));
      var memberIds  = Array.from(new Set(state.followups.map(function(f){ return f.assignee_id; }).filter(Boolean)));
      var promises = [];
      if (studentIds.length) {
        promises.push(sb.from('bst_students').select('id,full_name').in('id', studentIds).then(function(sres){
          state.students = {};
          (sres.data || []).forEach(function(s){ state.students[s.id] = s.full_name; });
        }));
      }
      if (memberIds.length) {
        promises.push(sb.from('bst_members').select('id,full_name').in('id', memberIds).then(function(mres){
          state.members = {};
          (mres.data || []).forEach(function(m){ state.members[m.id] = m.full_name; });
        }));
      }
      return promises.length ? Promise.all(promises) : undefined;
    });
  }

  function filtered(){
    var todayStr = new Date().toISOString().slice(0, 10);
    return state.followups.filter(function(f){
      if (state.filter === 'all') return true;
      if (state.filter === 'overdue') return f.status === 'overdue';
      if (state.filter === 'today') return (f.status === 'open' || f.status === 'overdue') && f.due_date && f.due_date <= todayStr;
      return f.status === 'open' || f.status === 'overdue';
    });
  }

  function fmtDate(d){ return d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month:'short', day:'numeric' }) : ''; }

  function dueDateLabel(f){
    if (!f.due_date) return '';
    var todayStr = new Date().toISOString().slice(0, 10);
    var isOverdue = f.due_date < todayStr;
    var isToday   = f.due_date === todayStr;
    var label = isToday ? 'due today' : (isOverdue ? 'was due ' + fmtDate(f.due_date) : 'due ' + fmtDate(f.due_date));
    var color = (isOverdue || isToday) ? 'color:var(--accent);font-weight:600' : '';
    return ' <span style="' + color + '">\u00b7 ' + label + '</span>';
  }

  function taskRow(f){
    var name = state.students[f.student_id] || 'Prospect';
    var assigneeName = f.assignee_id && state.members[f.assignee_id] ? state.members[f.assignee_id] : '';
    var statusChipClass = f.status === 'overdue' ? 'is-danger' : (f.status === 'done' ? 'is-success' : 'is-neutral');
    return '<div class="teams-row" data-task-id="' + esc(f.id) + '" style="cursor:pointer">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
          '<span class="teams-chip ' + statusChipClass + '">' + esc(STATUS_LABELS[f.status] || f.status) + '</span>' +
          '<strong style="font-size:var(--t-sm)">' + esc(name) + '</strong>' +
        '</div>' +
        '<div class="teams-card-desc" style="margin-top:4px">' + esc(f.channel || '') + dueDateLabel(f) + (assigneeName ? ' \u00b7 ' + esc(assigneeName) : '') + '</div>' +
      '</div>' +
      '<span aria-hidden="true">\u203a</span>' +
    '</div>';
  }

  function render(){
    tabbarSlot.innerHTML = window.TeamsCtx.bottomTabs('tasks');
    var rows = filtered();
    root.innerHTML = rows.length
      ? rows.map(taskRow).join('')
      : '<div class="teams-empty"><span class="teams-empty-glyph" aria-hidden="true">\u25F7</span><h2>No tasks here</h2><p>Follow-up tasks will appear as prospects move through cultivation.</p></div>';
    Array.prototype.forEach.call(root.querySelectorAll('[data-task-id]'), function(row){
      row.addEventListener('click', function(){
        var f = state.followups.filter(function(x){ return x.id === row.getAttribute('data-task-id'); })[0];
        if (f) openOutcomeSheet(f);
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

  function openOutcomeSheet(f){
    var name = state.students[f.student_id] || 'Prospect';
    var ov = overlay(
      '<button class="teams-sheet-close" type="button" aria-label="Close">\u2715</button>' +
      '<h2>' + esc(name) + '</h2>' +
      '<p class="teams-sub">Log the outcome of this follow-up.</p>' +
      '<div class="teams-field"><label for="outcomeSelect">Outcome</label><select id="outcomeSelect">' +
        OUTCOMES.map(function(o){ return '<option value="' + o.value + '">' + o.label + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="teams-field"><label for="outcomeNote">Note</label><textarea id="outcomeNote" placeholder="Optional details\u2026"></textarea></div>' +
      '<div id="outcomeErr"></div>' +
      '<button class="teams-btn teams-btn-block" id="outcomeSaveBtn" type="button">Save outcome</button>'
    );
    ov.querySelector('.teams-sheet-close').addEventListener('click', function(){ ov.remove(); });

    ov.querySelector('#outcomeSaveBtn').addEventListener('click', function(){
      var btn = ov.querySelector('#outcomeSaveBtn');
      var errEl = ov.querySelector('#outcomeErr');
      var outcome = ov.querySelector('#outcomeSelect').value;
      var note = ov.querySelector('#outcomeNote').value || null;
      btn.disabled = true; btn.textContent = 'Saving\u2026';
      var sb = window.TeamsCtx.sb;
      sb.from('bst_followups').update({
        status: 'done',
        completed_at: new Date().toISOString(),
        note: (note ? note + ' ' : '') + '[' + outcome + ']'
      }).eq('id', f.id).then(function(res){
        btn.disabled = false; btn.textContent = 'Save outcome';
        if (res.error) {
          // bst_followups currently exposes SELECT-only RLS in this project
          // (no UPDATE policy) \u2014 see DB gaps in the build report.
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
