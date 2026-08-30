/* /teams/students/students.js — Prospect roster list, filters, and the intake sheet
   backed by public.bst_create_student_intake. */
(function(){
  var root = document.getElementById('studentsRoot');
  var actionsEl = document.getElementById('studentsActions');
  var tabbarSlot = document.getElementById('teamsTabbarSlot');
  function esc(s){ return (window.TeamsCtx && window.TeamsCtx.esc) ? window.TeamsCtx.esc(s) : String(s == null ? '' : s); }

  var STATUS_LABELS = {
    new_intake: 'New intake', prospect: 'Prospect', cultivating: 'Cultivating',
    active: 'Active', paused: 'Paused', baptized: 'Baptized', dropped: 'Dropped'
  };

  var state = { students: [], teachers: [], search: '', statusFilter: 'all', teacherFilter: 'all', sortBy: 'newest' };

  function renderActions(){
    actionsEl.innerHTML = '<button class="teams-btn teams-btn-sm" id="intakeBtn" type="button">+ New Prospect</button>';
    document.getElementById('intakeBtn').addEventListener('click', openIntakeSheet);
  }

  function load(){
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;
    return Promise.all([
      sb.from('bst_students').select('id,full_name,status,assigned_teacher_id,phone,email,created_at,preferred_language').eq('church_id', churchId).order('created_at', { ascending: false }),
      sb.from('bst_members').select('id,full_name,languages,role,also_teaches,active,status').eq('church_id', churchId).eq('status','active').order('full_name')
    ]).then(function(results){
      state.students = results[0].error ? [] : (results[0].data || []);
      state.teachers = results[1].error ? [] : (results[1].data || []);
      if (results[0].error) console.error('[Teams students] load error', results[0].error);
    });
  }

  function teacherName(id){
    var t = state.teachers.filter(function(x){ return x.id === id; })[0];
    return t ? t.full_name : '';
  }

  function filtered(){
    var rows = state.students.filter(function(s){
      if (state.statusFilter !== 'all' && s.status !== state.statusFilter) return false;
      if (state.teacherFilter !== 'all' && s.assigned_teacher_id !== state.teacherFilter) return false;
      if (state.search) {
        var q = state.search.toLowerCase();
        var teacherN = teacherName(s.assigned_teacher_id).toLowerCase();
        if ((s.full_name || '').toLowerCase().indexOf(q) === -1 && teacherN.indexOf(q) === -1) return false;
      }
      return true;
    });
    if (state.sortBy === 'alpha') {
      rows = rows.slice().sort(function(a, b){ return (a.full_name || '').localeCompare(b.full_name || ''); });
    } else if (state.sortBy === 'status') {
      var ORDER = { new_intake:0, prospect:1, cultivating:2, active:3, paused:4, baptized:5, dropped:6 };
      rows = rows.slice().sort(function(a, b){ return (ORDER[a.status] || 0) - (ORDER[b.status] || 0); });
    }
    // default 'newest' preserves the server order (created_at DESC)
    return rows;
  }

  var STATUS_CHIP_CLASS = {
    new_intake: 'is-info', prospect: 'is-neutral', cultivating: 'is-warn',
    active: 'is-success', paused: 'is-neutral', baptized: 'is-success', dropped: 'is-neutral'
  };

  function studentRow(s){
    var langChip = '';
    if (s.preferred_language && window.TeamsLanguages) {
      var t = state.teachers.filter(function(x){ return x.id === s.assigned_teacher_id; })[0];
      var speaks = t && Array.isArray(t.languages) && t.languages.map(function(l){ return String(l).toLowerCase(); }).indexOf(String(s.preferred_language).toLowerCase()) !== -1;
      langChip = '<span class="teams-lang-badge ' + (speaks ? 'teams-lang-match' : (s.assigned_teacher_id ? 'teams-lang-missing' : '')) + '">' + esc(window.TeamsLanguages.labelOf(s.preferred_language)) + '</span>';
    }
    var chipClass = STATUS_CHIP_CLASS[s.status] || 'is-neutral';
    return '<a class="teams-row" href="/student/?id=' + esc(s.id) + '">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
          '<strong style="font-size:var(--t-sm)">' + esc(s.full_name) + '</strong>' +
          '<span class="teams-chip ' + chipClass + '">' + esc(STATUS_LABELS[s.status] || s.status) + '</span>' +
          langChip +
        '</div>' +
        '<div class="teams-card-desc" style="margin-top:4px">' + esc(teacherName(s.assigned_teacher_id) || 'Unassigned') + '</div>' +
      '</div>' +
      '<span aria-hidden="true">\u203a</span>' +
    '</a>';
  }

  function renderFilters(count, total){
    var statuses = ['all'].concat(Object.keys(STATUS_LABELS));
    var hasFilter = state.search || state.statusFilter !== 'all' || state.teacherFilter !== 'all';
    var clearBtn = hasFilter ? '<button class="teams-btn teams-btn-sm teams-btn-secondary" id="clearFiltersBtn" type="button" style="white-space:nowrap">Clear filters</button>' : '';
    return '<div style="display:flex;gap:var(--s-3);flex-wrap:wrap;margin-bottom:var(--s-3);align-items:center">' +
      '<input type="search" id="studentSearch" placeholder="Search prospects\u2026" value="' + esc(state.search) + '" style="flex:1;min-width:180px;font-size:16px" />' +
      '<select id="statusFilter" style="font-size:16px">' + statuses.map(function(st){ return '<option value="' + st + '"' + (state.statusFilter === st ? ' selected' : '') + '>' + (st === 'all' ? 'All statuses' : esc(STATUS_LABELS[st])) + '</option>'; }).join('') + '</select>' +
      '<select id="teacherFilter" style="font-size:16px"><option value="all">All teachers</option>' + state.teachers.map(function(t){ return '<option value="' + esc(t.id) + '"' + (state.teacherFilter === t.id ? ' selected' : '') + '>' + esc(t.full_name) + '</option>'; }).join('') + '</select>' +
      '<select id="sortFilter" style="font-size:16px"><option value="newest"' + (state.sortBy === 'newest' ? ' selected' : '') + '>Newest</option><option value="alpha"' + (state.sortBy === 'alpha' ? ' selected' : '') + '>A–Z</option><option value="status"' + (state.sortBy === 'status' ? ' selected' : '') + '>By status</option></select>' +
      clearBtn +
    '</div>' +
    '<p class="teams-result-count">' + (hasFilter ? count + ' of ' + total : total) + ' prospect' + (total === 1 ? '' : 's') + '</p>';
  }

  function render(){
    tabbarSlot.innerHTML = window.TeamsCtx.bottomTabs('students');
    var rows = filtered();
    var body = rows.length
      ? rows.map(studentRow).join('')
      : '<div class="teams-empty"><span class="teams-empty-glyph" aria-hidden="true">\u25A4</span><h2>No prospects found</h2><p>Try a different filter, or add a new prospect.</p>' +
        (window.TeamsCtx.isChurchAdmin || window.TeamsCtx.isTeacher ? '<button class="teams-btn" id="emptyIntakeBtn" type="button" style="margin-top:8px">+ New Prospect</button>' : '') +
        '</div>';
    root.innerHTML = renderFilters(rows.length, state.students.length) + '<div>' + body + '</div>';

    var searchEl = document.getElementById('studentSearch');
    searchEl.addEventListener('input', function(e){ state.search = e.target.value; render(); });
    // Allow pressing Enter in search to focus first result link
    searchEl.addEventListener('keydown', function(e){
      if (e.key === 'Enter') {
        var first = root.querySelector('a.teams-row');
        if (first) first.focus();
      }
    });
    document.getElementById('statusFilter').addEventListener('change', function(e){ state.statusFilter = e.target.value; render(); });
    document.getElementById('teacherFilter').addEventListener('change', function(e){ state.teacherFilter = e.target.value; render(); });
    document.getElementById('sortFilter').addEventListener('change', function(e){ state.sortBy = e.target.value; render(); });
    var clearBtn = document.getElementById('clearFiltersBtn');
    if (clearBtn) clearBtn.addEventListener('click', function(){ state.search = ''; state.statusFilter = 'all'; state.teacherFilter = 'all'; state.sortBy = 'newest'; render(); });
    var emptyIntakeBtn = document.getElementById('emptyIntakeBtn');
    if (emptyIntakeBtn) emptyIntakeBtn.addEventListener('click', openIntakeSheet);
  }

  function overlay(innerHtml){
    var ov = document.createElement('div');
    ov.className = 'teams-overlay open';
    ov.innerHTML = '<div class="teams-sheet">' + innerHtml + '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if (e.target === ov) ov.remove(); });
    return ov;
  }

  function openIntakeSheet(){
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;
    var ov = overlay(
      '<button class="teams-sheet-close" type="button" aria-label="Close">\u2715</button>' +
      '<h2>New Prospect</h2>' +
      '<div class="teams-field"><label for="inFirst">First name</label><input id="inFirst" type="text" /></div>' +
      '<div class="teams-field"><label for="inLast">Last name</label><input id="inLast" type="text" /></div>' +
      '<div class="teams-field"><label for="inPhone">Phone</label><input id="inPhone" type="tel" /></div>' +
      '<div class="teams-field"><label for="inEmail">Email</label><input id="inEmail" type="email" /></div>' +
      '<div class="teams-field"><label for="inAddress">Address</label><input id="inAddress" type="text" /></div>' +
      '<div class="teams-field"><label for="inLang">Preferred language</label><select id="inLang">' + (window.TeamsLanguages ? window.TeamsLanguages.optionsHtml('') : '<option value="">Select a language</option>') + '</select><div class="teams-hint">Used to match a teacher who speaks the same language.</div></div>' +
      '<div class="teams-field"><label for="inTeacher">Assigned teacher</label><select id="inTeacher"><option value="">Unassigned</option></select><div id="inTeacherHint" class="teams-hint"></div></div>' +
      '<div class="teams-field"><label for="inNotes">Intake notes</label><textarea id="inNotes"></textarea></div>' +
      '<div id="inDup"></div>' +
      '<div id="inErr"></div>' +
      '<button class="teams-btn teams-btn-block" id="inSubmitBtn" type="button">Add prospect</button>'
    );
    ov.querySelector('.teams-sheet-close').addEventListener('click', function(){ ov.remove(); });

    // Language-aware teacher list. Only real teachers or admins who opted in.
    var teacherSel = ov.querySelector('#inTeacher');
    var teacherHint = ov.querySelector('#inTeacherHint');
    var langSel = ov.querySelector('#inLang');
    var teachableTeachers = state.teachers.filter(function(m){
      return m.active !== false && (m.role === 'teacher' || (m.role === 'church_admin' && m.also_teaches === true));
    });
    function repaintTeacherOptions(){
      var langCode = (langSel.value || '').toLowerCase();
      var matches = [], others = [];
      teachableTeachers.forEach(function(t){
        var speaks = Array.isArray(t.languages) && langCode && t.languages.map(function(l){ return String(l).toLowerCase(); }).indexOf(langCode) !== -1;
        (speaks ? matches : others).push(t);
      });
      var mkOpt = function(t, isMatch){
        return '<option value="' + esc(t.id) + '">' + esc(t.full_name) + (isMatch ? ' \u2713 speaks selected language' : '') + '</option>';
      };
      var html = '<option value="">Unassigned</option>';
      if (langCode && matches.length){
        html += '<optgroup label="Speaks this language">' + matches.map(function(t){ return mkOpt(t, true); }).join('') + '</optgroup>';
        html += '<optgroup label="Other teachers">' + others.map(function(t){ return mkOpt(t, false); }).join('') + '</optgroup>';
      } else {
        html += teachableTeachers.map(function(t){ return mkOpt(t, false); }).join('');
      }
      teacherSel.innerHTML = html;
      if (!langCode) { teacherHint.textContent = ''; return; }
      if (matches.length) {
        teacherHint.innerHTML = '<span class="teams-lang-badge teams-lang-match">' + matches.length + ' teacher' + (matches.length === 1 ? '' : 's') + ' speak ' + esc(window.TeamsLanguages.labelOf(langCode)) + '</span>';
      } else {
        teacherHint.innerHTML = '<span class="teams-lang-badge teams-lang-missing">No teacher currently speaks ' + esc(window.TeamsLanguages.labelOf(langCode)) + '</span>';
      }
    }
    langSel.addEventListener('change', repaintTeacherOptions);
    repaintTeacherOptions();

    var firstInput = ov.querySelector('#inFirst');
    var lastInput = ov.querySelector('#inLast');
    var dupEl = ov.querySelector('#inDup');
    var errEl = ov.querySelector('#inErr');
    var submitBtn = ov.querySelector('#inSubmitBtn');

    function checkDup(){
      var first = firstInput.value.trim().toLowerCase();
      var last = lastInput.value.trim().toLowerCase();
      dupEl.innerHTML = '';
      if (!first || !last) return;
      var full = (first + ' ' + last);
      var dup = state.students.filter(function(s){ return (s.full_name || '').trim().toLowerCase() === full; });
      if (dup.length) {
        dupEl.innerHTML = '<div class="teams-error">A prospect named "' + esc(dup[0].full_name) + '" already exists. Double-check before adding a duplicate.</div>';
      }
    }
    firstInput.addEventListener('blur', checkDup);
    lastInput.addEventListener('blur', checkDup);

    submitBtn.addEventListener('click', function(){
      errEl.innerHTML = '';
      var first = firstInput.value.trim();
      var last = lastInput.value.trim();
      if (!first || !last) { errEl.innerHTML = '<div class="teams-error">First and last name are required.</div>'; return; }
      submitBtn.disabled = true; submitBtn.textContent = 'Adding\u2026';
      sb.rpc('bst_create_student_intake', {
        p_first_name: first,
        p_last_name: last,
        p_phone: ov.querySelector('#inPhone').value || null,
        p_email: ov.querySelector('#inEmail').value || null,
        p_address: ov.querySelector('#inAddress').value || null,
        p_church_id: churchId,
        p_assigned_teacher: ov.querySelector('#inTeacher').value || null,
        p_intake_notes: ov.querySelector('#inNotes').value || null,
        p_preferred_language: ov.querySelector('#inLang').value || null
      }).then(function(res){
        submitBtn.disabled = false; submitBtn.textContent = 'Add prospect';
        if (res.error) { errEl.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Something went wrong.') + '</div>'; return; }
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
