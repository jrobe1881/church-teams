/* /teams/schedule/schedule.js — Weekly schedule of studies, cultivation,
   visitation, baptisms, plus the New Session sheet backed by
   public.bst_schedule_session. */
(function(){
  var root = document.getElementById('scheduleRoot');
  var actionsEl = document.getElementById('scheduleActions');
  var tabbarSlot = document.getElementById('teamsTabbarSlot');

  function esc(s){ return (window.TeamsCtx && window.TeamsCtx.esc) ? window.TeamsCtx.esc(s) : String(s == null ? '' : s); }

  var state = {
    weekStart: startOfWeek(new Date()),
    filter: 'all',      // all | study | cultivation | baptism
    view: window.innerWidth > 720 ? 'week' : 'list',
    events: []
  };

  function startOfWeek(d){
    var x = new Date(d);
    var day = x.getDay();
    var diff = (day === 0 ? -6 : 1 - day);
    x.setDate(x.getDate() + diff);
    x.setHours(0,0,0,0);
    return x;
  }
  function addDays(d, n){ var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function fmtDay(d){ return d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' }); }
  function fmtTime(d){ return d.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' }); }
  function fmtRange(a,b){ return fmtDay(a) + ' \u2013 ' + fmtDay(addDays(b,-1)); }

  function kindOf(ev){
    if (ev.kind === 'baptism') return 'baptism';
    if (ev.kind === 'cultivation') return 'cultivation';
    if (ev.kind === 'church') return 'church';
    if (ev.kind === 'visitation') return 'visitation';
    return 'study';   // bible_study or legacy rows
  }

  function renderSubbarActions(){
    actionsEl.innerHTML =
      '<button class="teams-chip is-selected" data-filter="all">All</button>' +
      '<button class="teams-chip" data-filter="study">Bible studies</button>' +
      '<button class="teams-chip" data-filter="cultivation">Cultivation</button>' +
      '<button class="teams-chip" data-filter="visitation">Visitation</button>' +
      '<button class="teams-chip" data-filter="church">Church</button>' +
      '<button class="teams-chip" data-filter="baptism">Baptisms</button>' +
      '<button class="teams-btn teams-btn-sm" id="newStudyBtn" type="button">+ New Session</button>';
    Array.prototype.forEach.call(actionsEl.querySelectorAll('[data-filter]'), function(btn){
      btn.addEventListener('click', function(){
        state.filter = btn.getAttribute('data-filter');
        Array.prototype.forEach.call(actionsEl.querySelectorAll('[data-filter]'), function(b){ b.classList.toggle('is-selected', b === btn); });
        renderList();
      });
    });
    document.getElementById('newStudyBtn').addEventListener('click', openNewStudySheet);
  }

  function loadWeek(){
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;
    var weekEnd = addDays(state.weekStart, 7);
    return sb.from('bst_calendar_events')
      .select('*')
      .eq('church_id', churchId)
      .gte('starts_at', state.weekStart.toISOString())
      .lt('starts_at', weekEnd.toISOString())
      .order('starts_at', { ascending: true })
      .then(function(res){
        state.events = res.error ? [] : (res.data || []);
        if (res.error) console.error('[Teams schedule] load error', res.error);
      });
  }

  function isCurrentWeek(){
    var now = startOfWeek(new Date());
    return now.getTime() === state.weekStart.getTime();
  }

  function renderHeader(){
    var filteredCount = state.events.filter(function(ev){ return state.filter === 'all' || kindOf(ev) === state.filter; }).length;
    var countLabel = filteredCount > 0 ? ' <span class="teams-chip is-neutral" style="font-size:var(--t-xs);padding:2px 8px">' + filteredCount + '</span>' : '';
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:var(--s-3);margin-bottom:var(--s-4);flex-wrap:wrap">' +
      '<div style="display:flex;align-items:center;gap:var(--s-2);flex-wrap:wrap">' +
        '<button class="teams-btn teams-btn-secondary teams-btn-sm" id="wkPrev" type="button">\u2039 Prev</button>' +
        '<strong>' + esc(fmtRange(state.weekStart, addDays(state.weekStart,7))) + '</strong>' + countLabel +
        '<button class="teams-btn teams-btn-secondary teams-btn-sm" id="wkNext" type="button">Next \u203a</button>' +
        (!isCurrentWeek() ? '<button class="teams-btn teams-btn-secondary teams-btn-sm" id="wkToday" type="button">Today</button>' : '') +
      '</div>' +
      '<div style="display:flex;gap:6px">' +
        '<button class="teams-chip' + (state.view==='week'?' is-selected':'') + '" id="viewWeekBtn">Week</button>' +
        '<button class="teams-chip' + (state.view==='list'?' is-selected':'') + '" id="viewListBtn">List</button>' +
      '</div>' +
    '</div>';
  }

  function eventRow(ev){
    var kind = kindOf(ev);
    var when = new Date(ev.starts_at);
    var title = ev.title || (kind === 'baptism' ? 'Baptism' : 'Study');
    var slotChip = kind === 'baptism' && ev.service_slot ? '<span class="teams-chip is-neutral">' + esc(ev.service_slot) + '</span> ' : '';
    return '<div class="teams-row kind-' + kind + '" data-ev-id="' + esc(ev.id) + '" style="cursor:pointer">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
          slotChip +
          '<span class="teams-chip is-neutral">' + esc(ev.status || '') + '</span>' +
          '<strong style="font-size:var(--t-sm)">' + esc(title) + '</strong>' +
        '</div>' +
        '<div class="teams-card-desc" style="margin-top:4px">' + esc(fmtDay(when)) + ' \u00b7 ' + esc(fmtTime(when)) + '</div>' +
      '</div>' +
    '</div>';
  }

  function renderList(){
    var filtered = state.events.filter(function(ev){ return state.filter === 'all' || kindOf(ev) === state.filter; });
    var body;
    if (!filtered.length) {
      body = '<div class="teams-empty"><span class="teams-empty-glyph" aria-hidden="true">\u25F7</span><h2>Nothing scheduled</h2><p>No events match this week and filter.</p></div>';
    } else if (state.view === 'week') {
      var days = [];
      for (var i=0;i<7;i++) days.push(addDays(state.weekStart, i));
      body = days.map(function(d){
        var dayEvents = filtered.filter(function(ev){
          var when = new Date(ev.starts_at);
          return when.getFullYear()===d.getFullYear() && when.getMonth()===d.getMonth() && when.getDate()===d.getDate();
        });
        if (!dayEvents.length) return '';
        return '<div style="margin-bottom:var(--s-4)"><div class="teams-card-label" style="margin-bottom:6px">' + esc(fmtDay(d)) + '</div>' + dayEvents.map(eventRow).join('') + '</div>';
      }).join('') || '<div class="teams-empty"><span class="teams-empty-glyph" aria-hidden="true">\u25F7</span><h2>Nothing scheduled</h2><p>No events match this week and filter.</p></div>';
    } else {
      body = filtered.map(eventRow).join('');
    }
    document.getElementById('scheduleListArea').innerHTML = body;
    Array.prototype.forEach.call(document.querySelectorAll('[data-ev-id]'), function(row){
      row.addEventListener('click', function(){
        var ev = state.events.filter(function(e){ return e.id === row.getAttribute('data-ev-id'); })[0];
        if (ev) openDetailSheet(ev);
      });
    });
  }

  function renderShell(){
    tabbarSlot.innerHTML = window.TeamsCtx.bottomTabs('schedule');
    root.innerHTML = renderHeader() + '<div id="scheduleListArea"></div>';
    document.getElementById('wkPrev').addEventListener('click', function(){ state.weekStart = addDays(state.weekStart, -7); refresh(); });
    document.getElementById('wkNext').addEventListener('click', function(){ state.weekStart = addDays(state.weekStart, 7); refresh(); });
    var todayBtn = document.getElementById('wkToday');
    if (todayBtn) todayBtn.addEventListener('click', function(){ state.weekStart = startOfWeek(new Date()); refresh(); });
    document.getElementById('viewWeekBtn').addEventListener('click', function(){ state.view = 'week'; refresh(true); });
    document.getElementById('viewListBtn').addEventListener('click', function(){ state.view = 'list'; refresh(true); });
  }

  function refresh(skipReload){
    var p = skipReload ? Promise.resolve() : loadWeek();
    p.then(function(){
      renderShell();
      renderList();
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

  function openDetailSheet(ev){
    var kind = kindOf(ev);
    var when = new Date(ev.starts_at);
    var kindLabel = kind === 'baptism' ? 'Baptism' :
                    kind === 'cultivation' ? 'Cultivation' :
                    kind === 'church' ? 'Church service' :
                    kind === 'visitation' ? 'Visitation' : 'Bible study';
    var isBaptism = kind === 'baptism';
    var isSession = !isBaptism;
    var isCompleted = String(ev.status || '').toLowerCase() === 'completed';

    var actions = '<div id="evActions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:var(--s-4)">';
    if (isSession && !isCompleted) actions += '<button class="teams-btn teams-btn-sm" id="evCompleteBtn" type="button">Mark completed</button>';
    actions += '<button class="teams-btn teams-btn-sm teams-btn-secondary" id="evDeleteBtn" type="button">Delete</button>';
    actions += '</div>';

    var ov = overlay(
      '<button class="teams-sheet-close" type="button" aria-label="Close">\u2715</button>' +
      '<h2>' + esc(ev.title || kindLabel) + '</h2>' +
      '<p class="teams-sub">' + esc(kindLabel) + '</p>' +
      '<div class="teams-field"><label>When</label><div>' + esc(fmtDay(when)) + ' \u00b7 ' + esc(fmtTime(when)) + '</div></div>' +
      '<div class="teams-field"><label>Status</label><div><span class="teams-chip is-neutral">' + esc(ev.status || '') + '</span></div></div>' +
      '<div id="evErr"></div>' +
      actions
    );
    ov.querySelector('.teams-sheet-close').addEventListener('click', function(){ ov.remove(); });

    var errEl = ov.querySelector('#evErr');
    var sb = window.TeamsCtx.sb;

    var completeBtn = ov.querySelector('#evCompleteBtn');
    if (completeBtn) {
      completeBtn.addEventListener('click', function(){
        errEl.innerHTML = '';
        completeBtn.disabled = true; completeBtn.textContent = 'Saving\u2026';
        sb.from('bst_sessions').update({ status: 'completed' }).eq('id', ev.id).then(function(res){
          completeBtn.disabled = false; completeBtn.textContent = 'Mark completed';
          if (res.error) { errEl.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Could not update.') + '</div>'; return; }
          ov.remove(); refresh();
        });
      });
    }

    var deleteBtn = ov.querySelector('#evDeleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function(){
        errEl.innerHTML = '';
        var actions = ov.querySelector('#evActions');
        actions.innerHTML =
          '<div style="width:100%;background:var(--surface-2);padding:var(--s-3);border-radius:var(--r-md)">' +
            'Delete this ' + esc(kindLabel.toLowerCase()) + ' from the schedule? This cannot be undone.' +
            '<div style="display:flex;gap:8px;margin-top:var(--s-2)">' +
              '<button class="teams-btn teams-btn-sm teams-btn-danger" id="evDeleteConfirm" type="button">Yes, delete</button>' +
              '<button class="teams-btn teams-btn-sm teams-btn-secondary" id="evDeleteCancel" type="button">Cancel</button>' +
            '</div>' +
          '</div>';
        actions.querySelector('#evDeleteCancel').addEventListener('click', function(){ ov.remove(); openDetailSheet(ev); });
        actions.querySelector('#evDeleteConfirm').addEventListener('click', function(){
          var confirmBtn = actions.querySelector('#evDeleteConfirm');
          confirmBtn.disabled = true; confirmBtn.textContent = 'Deleting\u2026';
          var table = isBaptism ? 'bst_baptisms' : 'bst_sessions';
          sb.from(table).delete().eq('id', ev.id).then(function(res){
            confirmBtn.disabled = false; confirmBtn.textContent = 'Yes, delete';
            if (res.error) { errEl.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Could not delete.') + '</div>'; return; }
            ov.remove(); refresh();
          });
        });
      });
    }
  }

  function openNewStudySheet(){
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;
    var ov = overlay(
      '<button class="teams-sheet-close" type="button" aria-label="Close">\u2715</button>' +
      '<h2>New Session</h2>' +
      '<div class="teams-field"><label for="nsKind">Type</label><select id="nsKind">' +
        '<option value="bible_study" selected>Bible study</option>' +
        '<option value="cultivation">Cultivation</option>' +
        '<option value="visitation">Visitation</option>' +
        '<option value="church">Church service</option>' +
      '</select></div>' +
      '<div class="teams-field"><label for="nsStudent">Prospect</label><select id="nsStudent"><option value="">Loading\u2026</option></select></div>' +
      '<div class="teams-field"><label for="nsTeacher">Teacher</label><select id="nsTeacher"><option value="">Loading\u2026</option></select></div>' +
      '<div class="teams-field"><label for="nsWhen">Date &amp; time</label><input id="nsWhen" type="datetime-local" /></div>' +
      '<div class="teams-field" id="nsLessonField"><label for="nsLesson">Lesson</label><input id="nsLesson" type="text" placeholder="e.g. Acts 2" /></div>' +
      '<div class="teams-field"><label for="nsNotes">Notes</label><textarea id="nsNotes"></textarea></div>' +
      '<div id="nsConflict"></div>' +
      '<div id="nsConfirmBanner"></div>' +
      '<div id="nsErr"></div>' +
      '<button class="teams-btn teams-btn-block" id="nsSubmitBtn" type="button">Schedule</button>'
    );
    ov.querySelector('.teams-sheet-close').addEventListener('click', function(){ ov.remove(); });

    var studentSel = ov.querySelector('#nsStudent');
    var teacherSel = ov.querySelector('#nsTeacher');
    var whenInput = ov.querySelector('#nsWhen');
    var errEl = ov.querySelector('#nsErr');
    var conflictEl = ov.querySelector('#nsConflict');
    var confirmBanner = ov.querySelector('#nsConfirmBanner');
    var submitBtn = ov.querySelector('#nsSubmitBtn');
    var forceSubmit = false;

    // Kind selector toggles the Lesson field visibility (only Bible study needs it)
    var kindSel = ov.querySelector('#nsKind');
    var lessonField = ov.querySelector('#nsLessonField');
    function syncLessonVisibility(){
      var isStudy = kindSel.value === 'bible_study';
      if (lessonField) lessonField.style.display = isStudy ? '' : 'none';
    }
    // Address field: shown for visitation
    var addressField = document.createElement('div');
    addressField.className = 'teams-field';
    addressField.id = 'nsAddressField';
    addressField.innerHTML = '<label for="nsAddress">Visitation address</label><input id="nsAddress" type="text" placeholder="Street address or location" />';
    addressField.style.display = 'none';
    lessonField.parentNode.insertBefore(addressField, lessonField.nextSibling);
    function syncAddressVisibility(){
      var isVisit = kindSel.value === 'visitation';
      addressField.style.display = isVisit ? '' : 'none';
    }
    kindSel.addEventListener('change', syncAddressVisibility);
    syncAddressVisibility();
    kindSel.addEventListener('change', syncLessonVisibility);
    syncLessonVisibility();

    // Small hint row for language-match info, injected just under teacher select.
    var langHint = document.createElement('div');
    langHint.id = 'nsLangHint';
    langHint.style.marginTop = '4px';
    if (teacherSel.parentNode) teacherSel.parentNode.appendChild(langHint);

    var studentsById = {};
    var teachersCache = [];

    function paintTeachers(){
      var selectedStudent = studentsById[studentSel.value] || null;
      var langCode = selectedStudent && selectedStudent.preferred_language ? String(selectedStudent.preferred_language).toLowerCase() : '';
      var matches = [], others = [];
      teachersCache.forEach(function(t){
        var speaks = langCode && Array.isArray(t.languages) && t.languages.map(function(l){ return String(l).toLowerCase(); }).indexOf(langCode) !== -1;
        (speaks ? matches : others).push(t);
      });
      var mkOpt = function(t, isMatch){
        var meSelected = (window.TeamsCtx.activeMember && t.id === window.TeamsCtx.activeMember.id && !teacherSel.value);
        var selected = teacherSel.value === t.id || meSelected;
        return '<option value="' + esc(t.id) + '"' + (selected ? ' selected' : '') + '>' + esc(t.full_name) + (isMatch ? ' \u2713 speaks selected language' : '') + '</option>';
      };
      var html = '<option value="">Select a teacher</option>';
      if (langCode && matches.length) {
        html += '<optgroup label="Speaks this language">' + matches.map(function(t){ return mkOpt(t, true); }).join('') + '</optgroup>';
        html += '<optgroup label="Other teachers">' + others.map(function(t){ return mkOpt(t, false); }).join('') + '</optgroup>';
      } else {
        html += teachersCache.map(function(t){ return mkOpt(t, false); }).join('');
      }
      teacherSel.innerHTML = html;
      if (!langCode || !window.TeamsLanguages) { langHint.innerHTML = ''; return; }
      var label = window.TeamsLanguages.labelOf(langCode);
      if (matches.length) {
        langHint.innerHTML = '<span class="teams-lang-badge teams-lang-match">' + matches.length + ' teacher' + (matches.length === 1 ? '' : 's') + ' speak ' + esc(label) + '</span>';
      } else {
        langHint.innerHTML = '<span class="teams-lang-badge teams-lang-missing">No teacher currently speaks ' + esc(label) + '</span>';
      }
    }

    Promise.all([
      sb.from('bst_students').select('id,full_name,preferred_language').eq('church_id', churchId).order('full_name'),
      sb.from('bst_members').select('id,full_name,role,also_teaches,languages').eq('church_id', churchId).eq('status','active').eq('active', true).order('full_name')
    ]).then(function(results){
      var students = results[0].data || [];
      students.forEach(function(s){ studentsById[s.id] = s; });
      teachersCache = (results[1].data || []).filter(function(m){ return m.role === 'teacher' || (m.role === 'church_admin' && m.also_teaches === true); });
      studentSel.innerHTML = '<option value="">Select a prospect</option>' + students.map(function(s){
        var suffix = (s.preferred_language && window.TeamsLanguages) ? ' \u00b7 ' + window.TeamsLanguages.labelOf(s.preferred_language) : '';
        return '<option value="' + esc(s.id) + '">' + esc(s.full_name) + esc(suffix) + '</option>';
      }).join('');
      paintTeachers();
    });

    studentSel.addEventListener('change', paintTeachers);

    function checkConflicts(){
      conflictEl.innerHTML = '';
      var teacherId = teacherSel.value;
      var whenVal = whenInput.value;
      if (!teacherId || !whenVal) return;
      var whenIso = new Date(whenVal).toISOString();
      // bst.member_conflicts lives in the bst schema, which is not exposed
      // over PostgREST by default (only `public` is). This call is best-
      // effort warn-only per spec — if the schema isn't exposed, it silently
      // no-ops rather than blocking scheduling. See DB gaps in the build report.
      sb.rpc('member_conflicts', { p_member: teacherId, p_when: whenIso, p_ignore_session: null }, { schema: 'bst' }).then(function(res){
        if (!res.error && Array.isArray(res.data) && res.data.length) {
          conflictEl.innerHTML = '<div class="teams-error">Possible double-booking: this teacher has ' + res.data.length + ' other session(s) near this time.</div>';
        }
      }).catch(function(){});
    }
    teacherSel.addEventListener('change', checkConflicts);
    whenInput.addEventListener('change', checkConflicts);

    function doSubmit(force){
      errEl.innerHTML = '';
      var studentId = studentSel.value;
      var teacherId = teacherSel.value;
      var whenVal = whenInput.value;
      var kind = kindSel.value || 'bible_study';
      if (!studentId) { errEl.innerHTML = '<div class="teams-error">Choose a prospect.</div>'; return; }
      if (!whenVal) { errEl.innerHTML = '<div class="teams-error">Choose a date and time.</div>'; return; }
      submitBtn.disabled = true; submitBtn.textContent = 'Scheduling\u2026';

      // For non-study kinds insert directly (RPC only handles Bible study conflict rules).
      if (kind !== 'bible_study') {
        var insertPayload = {
          church_id: churchId,
          student_id: studentId,
          teacher_id: teacherId || null,
          scheduled_at: new Date(whenVal).toISOString(),
          lesson: null,
          notes: ov.querySelector('#nsNotes').value || null,
          status: 'scheduled',
          kind: kind,
          is_cultivation: (kind === 'cultivation')
        };
        if (kind === 'visitation') {
          var addrVal = ov.querySelector('#nsAddress');
          if (addrVal && addrVal.value.trim()) insertPayload.notes = '[Address: ' + addrVal.value.trim() + ']' + (insertPayload.notes ? ' ' + insertPayload.notes : '');
        }
        sb.from('bst_sessions').insert(insertPayload).then(function(res){
          submitBtn.disabled = false; submitBtn.textContent = 'Schedule';
          if (res.error) { errEl.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Something went wrong.') + '</div>'; return; }
          ov.remove();
          refresh();
        });
        return;
      }

      sb.rpc('bst_schedule_session', {
        p_student: studentId,
        p_teacher: teacherId || null,
        p_when: new Date(whenVal).toISOString(),
        p_lesson: ov.querySelector('#nsLesson').value || null,
        p_notes: ov.querySelector('#nsNotes').value || null,
        p_church: churchId,
        p_force: !!force
      }).then(function(res){
        submitBtn.disabled = false; submitBtn.textContent = 'Schedule';
        if (res.error) { errEl.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Something went wrong.') + '</div>'; return; }
        var data = res.data || {};
        if (data.needs_confirmation) {
          var notes = Array.isArray(data.notes) ? data.notes : [];
          confirmBanner.innerHTML = '<div class="teams-error" style="background:var(--surface-2);color:var(--ink)">' +
            (notes.length ? notes.map(esc).join('<br>') : 'This time needs confirmation.') +
            '<div style="margin-top:8px"><button class="teams-btn teams-btn-sm" id="nsConfirmBtn" type="button">Confirm anyway</button></div>' +
          '</div>';
          ov.querySelector('#nsConfirmBtn').addEventListener('click', function(){ doSubmit(true); });
          return;
        }
        ov.remove();
        refresh();
      });
    }
    submitBtn.addEventListener('click', function(){ doSubmit(forceSubmit); });
  }

  window.TeamsCtx.ready.then(function(){
    if (!window.TeamsCtx.requireAccess(root)) return;
    refresh();
  });
})();
