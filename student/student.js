/* /teams/student/student.js — Prospect profile: pinned callout, notes
   composer, and a simple study/follow-up timeline. Reads ?id= from the URL. */
(function(){
  var root = document.getElementById('studentRoot');
  function esc(s){ return (window.TeamsCtx && window.TeamsCtx.esc) ? window.TeamsCtx.esc(s) : String(s == null ? '' : s); }

  var STATUS_LABELS = {
    new_intake: 'New intake', prospect: 'Prospect', cultivating: 'Cultivating',
    active: 'Active', paused: 'Paused', baptized: 'Baptized', dropped: 'Dropped'
  };
  var SENSITIVITY_LABELS = { general: 'General', pastoral: 'Pastoral', confidential: 'Confidential' };

  var state = { student: null, notes: [], sessions: [], followups: [], teachers: [] };

  function studentId(){
    var qs = new URLSearchParams(location.search);
    return qs.get('id');
  }

  function renderMissing(){
    root.innerHTML = '<div class="teams-empty"><span class="teams-empty-glyph" aria-hidden="true">\u25F7</span><h2>Prospect not found</h2><p>This prospect may have been removed, or you may not have access.</p><a class="teams-btn" href="/teams/students/">Back to prospects</a></div>';
  }

  function load(){
    var sb = window.TeamsCtx.sb;
    var id = studentId();
    if (!id) return Promise.resolve(false);
    return sb.from('bst_students').select('*').eq('id', id).maybeSingle().then(function(res){
      if (res.error || !res.data) return false;
      state.student = res.data;
      return Promise.all([
        sb.from('bst_student_notes').select('*').eq('student_id', id).order('created_at', { ascending: false }),
        sb.from('bst_sessions').select('*').eq('student_id', id).order('scheduled_at', { ascending: false }).limit(20),
        sb.from('bst_followups').select('*').eq('student_id', id).order('created_at', { ascending: false }).limit(20),
        sb.from('bst_members').select('id,full_name,role,also_teaches,active').eq('church_id', state.student.church_id).eq('status','active').order('full_name')
      ]).then(function(results){
        state.notes = results[0].error ? [] : (results[0].data || []);
        state.sessions = results[1].error ? [] : (results[1].data || []);
        state.followups = results[2].error ? [] : (results[2].data || []);
        // Teacher pool = teachers + admins who opted into teaching duties.
        state.teachers = (results[3].error ? [] : (results[3].data || []))
          .filter(function(m){ return m.active !== false && (m.role === 'teacher' || (m.role === 'church_admin' && m.also_teaches === true)); });
        return true;
      });
    });
  }

  function teacherName(id){
    var t = state.teachers.filter(function(x){ return x.id === id; })[0];
    return t ? t.full_name : 'Unassigned';
  }

  // Language-aware teacher option list. Teachers who speak the student's
  // preferred language float to the top and are tagged. Falls back to a
  // plain alphabetical list when no language is set.
  function renderTeacherOptions(student){
    var langCode = String(student.preferred_language || '').toLowerCase();
    var matches = [], others = [];
    state.teachers.forEach(function(t){
      var speaks = langCode && Array.isArray(t.languages) && t.languages.map(function(l){ return String(l).toLowerCase(); }).indexOf(langCode) !== -1;
      (speaks ? matches : others).push(t);
    });
    var mkOpt = function(t, isMatch){
      return '<option value="' + esc(t.id) + '"' + (t.id === student.assigned_teacher_id ? ' selected' : '') + '>' + esc(t.full_name) + (isMatch ? ' \u2713 speaks selected language' : '') + '</option>';
    };
    var html = '<option value=""' + (!student.assigned_teacher_id ? ' selected' : '') + '>Unassigned</option>';
    if (langCode && matches.length) {
      html += '<optgroup label="Speaks this language">' + matches.map(function(t){ return mkOpt(t, true); }).join('') + '</optgroup>';
      html += '<optgroup label="Other teachers">' + others.map(function(t){ return mkOpt(t, false); }).join('') + '</optgroup>';
    } else {
      html += state.teachers.map(function(t){ return mkOpt(t, false); }).join('');
    }
    return html;
  }

  function fmtDate(d){ return d ? new Date(d).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' }) : ''; }

  /* Render a contextual SOP suggestion banner when TeamsSOP is loaded and has
     SOPs relevant to this prospect's current status. */
  function renderSopBanner(status){
    if (!window.TeamsSOP) return '';
    var sops = window.TeamsSOP.forStatus(status);
    if (!sops || !sops.length) return '';
    var studentId = state.student ? state.student.id : '';
    var links = sops.slice(0, 3).map(function(s){
      return '<a class="teams-btn teams-btn-sm teams-btn-secondary" href="/teams/sop/?from=' + esc(studentId) + '" style="font-size:var(--t-xs)">' +
        '\u25F7 ' + esc(s.title) + '</a>';
    }).join('');
    return '<div style="margin-top:10px;padding:8px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md);display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<span style="font-size:var(--t-xs);color:var(--ink-3);flex:none">Related SOPs:</span>' +
      links +
    '</div>';
  }

  function renderHeader(){
    var s = state.student;
    document.title = (s.full_name || 'Prospect') + ' \u2014 ChurchTeams';
    var contact = [];
    if (s.phone) contact.push('<a class="teams-contact-icon" href="tel:' + esc(s.phone) + '" aria-label="Call">\u260E</a>');
    if (s.email) contact.push('<a class="teams-contact-icon" href="mailto:' + esc(s.email) + '" aria-label="Email">\u2709</a>');
    return '<div class="teams-card" style="margin-bottom:var(--s-4)">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--s-3)">' +
        '<div>' +
          '<h2 style="margin:0 0 4px">' + esc(s.full_name) + '</h2>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
            '<span class="teams-chip is-neutral">' + esc(STATUS_LABELS[s.status] || s.status) + '</span>' +
            '<span class="teams-chip is-neutral">' + esc(teacherName(s.assigned_teacher_id)) + '</span>' +
            (s.preferred_language && window.TeamsLanguages ? '<span class="teams-lang-badge">' + esc(window.TeamsLanguages.labelOf(s.preferred_language)) + '</span>' : '') +
          '</div>' +
          '<div style="margin-top:12px;display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center;font-size:var(--t-sm);max-width:340px">' +
            '<label for="studentStatusSel" class="teams-card-desc" style="font-size:var(--t-xs)">Status</label>' +
            '<select id="studentStatusSel" style="padding:4px 8px">' +
              Object.keys(STATUS_LABELS).map(function(k){ return '<option value="' + k + '"' + (k === s.status ? ' selected' : '') + '>' + STATUS_LABELS[k] + '</option>'; }).join('') +
            '</select>' +
            '<label for="studentLangSel" class="teams-card-desc" style="font-size:var(--t-xs)">Preferred language</label>' +
            '<select id="studentLangSel" style="padding:4px 8px">' +
              (window.TeamsLanguages ? window.TeamsLanguages.optionsHtml(s.preferred_language || '') : '<option value="">Select a language</option>') +
            '</select>' +
            '<label for="assignTeacherSel" class="teams-card-desc" style="font-size:var(--t-xs)">Assigned teacher</label>' +
            '<select id="assignTeacherSel" style="padding:4px 8px">' +
              renderTeacherOptions(s) +
            '</select>' +
          '</div>' +
          '<div id="studentEditStatus" class="teams-card-desc" style="font-size:var(--t-xs);margin-top:6px;min-height:16px"></div>' +
          '<div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">' +
            '<button class="teams-btn teams-btn-sm" id="scheduleStudyBtn" type="button">Schedule</button>' +
            (window.TeamsCtx.isChurchAdmin ? '<button class="teams-btn teams-btn-sm teams-btn-secondary" id="deleteStudentBtn" type="button" style="color:#7a1f2b;border-color:#e5c7cb">Delete prospect</button>' : '') +
          '</div>' +
          renderSopBanner(s.status) +
        '</div>' +
        '<div style="display:flex;gap:6px">' + contact.join('') + '</div>' +
      '</div>' +
      (s.address ? '<div class="teams-card-desc" style="margin-top:8px">' + esc(s.address) + '</div>' : '') +
    '</div>';
  }

  function renderPinned(){
    var pinned = state.notes.filter(function(n){ return n.pinned; });
    if (!pinned.length) return '';
    return '<div class="teams-pinned-callout">' +
      pinned.map(function(n){ return '<div>' + esc(n.body) + '</div>'; }).join('') +
    '</div>';
  }

  function renderComposer(){
    return '<div class="teams-card" style="margin:var(--s-4) 0">' +
      '<div class="teams-field"><label for="noteBody">Add a note</label><textarea id="noteBody" placeholder="Write a note about this prospect\u2026"></textarea></div>' +
      '<div style="display:flex;align-items:center;gap:var(--s-3);flex-wrap:wrap">' +
        '<select id="noteSensitivity">' +
          Object.keys(SENSITIVITY_LABELS).map(function(k){ return '<option value="' + k + '">' + SENSITIVITY_LABELS[k] + '</option>'; }).join('') +
        '</select>' +
        '<label style="display:flex;align-items:center;gap:6px;font-size:var(--t-sm)"><input type="checkbox" id="notePinned" /> Pin this note</label>' +
        '<button class="teams-btn teams-btn-sm" id="noteSubmitBtn" type="button" style="margin-left:auto">Add note</button>' +
      '</div>' +
      '<div id="noteErr"></div>' +
    '</div>';
  }

  function renderTimeline(){
    var items = [];
    state.sessions.forEach(function(sess){
      items.push({ when: sess.scheduled_at, html: '<div class="teams-row"><div><strong style="font-size:var(--t-sm)">Study \u00b7 ' + esc(sess.lesson || 'Session') + '</strong><div class="teams-card-desc">' + esc(fmtDate(sess.scheduled_at)) + ' \u00b7 ' + esc(sess.status || '') + '</div></div></div>' });
    });
    state.followups.forEach(function(f){
      items.push({ when: f.created_at, html: '<div class="teams-row"><div><strong style="font-size:var(--t-sm)">Follow-up \u00b7 ' + esc(f.channel || '') + '</strong><div class="teams-card-desc">' + esc(fmtDate(f.created_at)) + ' \u00b7 ' + esc(f.status || '') + (f.note ? ' \u2014 ' + esc(f.note) : '') + '</div></div></div>' });
    });
    state.notes.forEach(function(n){
      items.push({ when: n.created_at, html: '<div class="teams-row teams-note-row"><div><strong style="font-size:var(--t-sm)">Note' + (n.pinned ? ' \u00b7 Pinned' : '') + ' \u00b7 ' + esc(SENSITIVITY_LABELS[n.sensitivity] || n.sensitivity) + '</strong><div class="teams-card-desc">' + esc(fmtDate(n.created_at)) + ' \u2014 ' + esc(n.body) + '</div></div></div>' });
    });
    items.sort(function(a,b){ return new Date(b.when) - new Date(a.when); });
    if (!items.length) return '<div class="teams-empty"><span class="teams-empty-glyph" aria-hidden="true">\u25F7</span><h2>No activity yet</h2><p>Studies, follow-ups, and notes will appear here.</p></div>';
    return items.map(function(i){ return i.html; }).join('');
  }

  function render(){
    root.innerHTML = renderHeader() + renderPinned() + renderComposer() + '<h3 class="teams-card-label" style="margin-bottom:8px">Timeline</h3>' + renderTimeline();
    wireComposer();
    wireHeaderControls();
  }

  function flash(msg){
    var el = document.getElementById('studentEditStatus');
    if (!el) return;
    el.textContent = msg;
    if (msg && !/could not/i.test(msg)) setTimeout(function(){ if (el.textContent === msg) el.textContent = ''; }, 1500);
  }

  function wireHeaderControls(){
    var sb = window.TeamsCtx.sb;
    var teacherSel = document.getElementById('assignTeacherSel');
    var langSel = document.getElementById('studentLangSel');
    if (langSel) langSel.addEventListener('change', function(){
      var v = langSel.value || null;
      langSel.disabled = true; flash('Saving\u2026');
      window.TeamsCtx.sb.from('bst_students').update({ preferred_language: v }).eq('id', state.student.id).then(function(res){
        langSel.disabled = false;
        if (res.error) { flash('Could not save: ' + (res.error.message || 'error')); return; }
        state.student.preferred_language = v;
        var teacherSel = document.getElementById('assignTeacherSel');
        if (teacherSel) teacherSel.innerHTML = renderTeacherOptions(state.student);
        flash('Language saved.');
      });
    });
    var statusSel = document.getElementById('studentStatusSel');
    var studyBtn = document.getElementById('scheduleStudyBtn');
    var deleteBtn = document.getElementById('deleteStudentBtn');

    function performDelete(){
      deleteBtn && (deleteBtn.disabled = true);
      flash('Deleting\u2026');
      sb.rpc('bst_delete_student', { p_student: state.student.id }).then(function(res){
        if (res.error) {
          if (deleteBtn) deleteBtn.disabled = false;
          flash('Could not delete: ' + (res.error.message || 'error'));
          return;
        }
        // Redirect back to the students list; the record is gone.
        window.location.href = '/teams/students/'; // back to prospects list
      });
    }

    if (deleteBtn) deleteBtn.addEventListener('click', function(){
      if (!confirm('Delete ' + (state.student.full_name || 'this prospect') + '? This removes their notes, follow-ups, and scheduled sessions. This cannot be undone.')) return;
      performDelete();
    });

    if (teacherSel) teacherSel.addEventListener('change', function(){
      var newId = teacherSel.value || null;
      teacherSel.disabled = true; flash('Saving\u2026');
      sb.from('bst_students').update({ assigned_teacher_id: newId }).eq('id', state.student.id).then(function(res){
        teacherSel.disabled = false;
        if (res.error) { flash('Could not save: ' + (res.error.message || 'error')); return; }
        state.student.assigned_teacher_id = newId;
        flash('Saved.');
      });
    });

    if (statusSel) statusSel.addEventListener('change', function(){
      var newStatus = statusSel.value;
      statusSel.disabled = true; flash('Saving\u2026');
      sb.from('bst_students').update({ status: newStatus }).eq('id', state.student.id).then(function(res){
        statusSel.disabled = false;
        if (res.error) { flash('Could not save: ' + (res.error.message || 'error')); return; }
        state.student.status = newStatus;
        flash('Status updated.');
        // Offer to delete when marked as dropped (admins only).
        if (newStatus === 'dropped' && window.TeamsCtx.isChurchAdmin) {
          if (confirm('Marked as dropped. Delete this prospect and all their records now? This cannot be undone.')) {
            performDelete();
            return;
          }
        }
        // Re-render header chip label
        render();
      });
    });

    if (studyBtn) studyBtn.addEventListener('click', function(){
      openScheduleSheet(state.student, state.teachers);
    });
  }

  // ---------------- Inline schedule sheet (Bible study) ----------------
  function openScheduleSheet(student, teachers){
    var sb = window.TeamsCtx.sb;
    var churchId = student.church_id;

    var ov = document.createElement('div');
    ov.className = 'teams-sheet-overlay';
    ov.innerHTML =
      '<div class="teams-sheet" role="dialog" aria-modal="true">' +
        '<button class="teams-sheet-close" type="button" aria-label="Close">\u2715</button>' +
        '<h2>Schedule for ' + esc(student.full_name) + '</h2>' +
        '<div class="teams-field"><label for="ssKind">Type</label><select id="ssKind">' +
          '<option value="bible_study" selected>Bible study</option>' +
          '<option value="cultivation">Cultivation</option>' +
          '<option value="visitation">Visitation</option>' +
          '<option value="church">Church service</option>' +
        '</select></div>' +
        '<div class="teams-field"><label for="ssTeacher">Teacher</label><select id="ssTeacher">' +
          '<option value="">Select a teacher</option>' +
          teachers.map(function(t){ return '<option value="' + esc(t.id) + '"' + (t.id === student.assigned_teacher_id ? ' selected' : '') + '>' + esc(t.full_name) + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="teams-field"><label for="ssWhen">Date &amp; time</label><input id="ssWhen" type="datetime-local" /></div>' +
        '<div class="teams-field" id="ssLessonField"><label for="ssLesson">Lesson</label><input id="ssLesson" type="text" placeholder="e.g. Acts 2" /></div>' +
        '<div class="teams-field"><label for="ssNotes">Notes</label><textarea id="ssNotes"></textarea></div>' +
        '<div id="ssConfirmBanner"></div>' +
        '<div id="ssErr"></div>' +
        '<button class="teams-btn teams-btn-block" id="ssSubmitBtn" type="button">Schedule</button>' +
      '</div>';
    document.body.appendChild(ov);
    ov.querySelector('.teams-sheet-close').addEventListener('click', function(){ ov.remove(); });
    ov.addEventListener('click', function(e){ if (e.target === ov) ov.remove(); });

    var kindSel = ov.querySelector('#ssKind');
    var lessonField = ov.querySelector('#ssLessonField');
    var whenInput = ov.querySelector('#ssWhen');
    var settingsCache = null;   // bst_church_settings row (cultivation)
    var churchSlots = [];       // bst_church_service_slots rows

    function syncLesson(){ lessonField.style.display = (kindSel.value === 'bible_study') ? '' : 'none'; }

    // Address field for visitation
    var ssAddressField = document.createElement('div');
    ssAddressField.className = 'teams-field';
    ssAddressField.innerHTML = '<label for="ssAddress">Visitation address</label><input id="ssAddress" type="text" placeholder="Street address or location" />';
    ssAddressField.style.display = 'none';
    lessonField.parentNode.insertBefore(ssAddressField, lessonField.nextSibling);
    function syncAddress(){ ssAddressField.style.display = (kindSel.value === 'visitation') ? '' : 'none'; }
    kindSel.addEventListener('change', function(){ syncLesson(); syncAddress(); prefillFromKind(); });

    function pad2(n){ n = String(n); return n.length === 1 ? '0' + n : n; }
    function nextOccurrence(dow, timeStr){
      // dow: 0=Sun..6=Sat; timeStr: 'HH:MM:SS' or 'HH:MM'
      if (dow == null || !timeStr) return null;
      var parts = String(timeStr).split(':');
      var h = parseInt(parts[0], 10), m = parseInt(parts[1] || '0', 10);
      var d = new Date();
      var diff = (Number(dow) - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + diff);
      d.setHours(h, m, 0, 0);
      // If today is the target day but the time has already passed, jump to next week.
      if (diff === 0 && d.getTime() < Date.now()) d.setDate(d.getDate() + 7);
      return d;
    }
    function toLocalInput(d){
      return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()) +
        'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }
    function prefillFromKind(){
      var kind = kindSel.value;
      if (kind === 'bible_study') return;
      var d = null;
      if (kind === 'cultivation') {
        if (!settingsCache) return;
        d = nextOccurrence(settingsCache.cultivation_dow, settingsCache.cultivation_time);
      } else if (kind === 'church') {
        if (!churchSlots.length) return;
        var soonest = null;
        for (var i = 0; i < churchSlots.length; i++) {
          var cand = nextOccurrence(churchSlots[i].dow, churchSlots[i].service_time);
          if (cand && (!soonest || cand.getTime() < soonest.getTime())) soonest = cand;
        }
        d = soonest;
      }
      if (d) whenInput.value = toLocalInput(d);
    }

    syncLesson();
    syncAddress();

    // Load cultivation default + church slots for pre-fill (best effort).
    sb.from('bst_church_settings').select('*').eq('church_id', churchId).maybeSingle().then(function(res){
      if (res && res.data) { settingsCache = res.data; prefillFromKind(); }
    });
    sb.from('bst_church_service_slots').select('*').eq('church_id', churchId)
      .order('sort_order', { ascending: true }).order('dow', { ascending: true }).order('service_time', { ascending: true })
      .then(function(res){ if (res && !res.error) { churchSlots = res.data || []; prefillFromKind(); } });

    var errEl = ov.querySelector('#ssErr');
    var submitBtn = ov.querySelector('#ssSubmitBtn');
    var confirmBanner = ov.querySelector('#ssConfirmBanner');

    function doSubmit(force){
      errEl.innerHTML = '';
      var teacherId = ov.querySelector('#ssTeacher').value || null;
      var whenVal = ov.querySelector('#ssWhen').value;
      var kind = kindSel.value;
      var notes = ov.querySelector('#ssNotes').value || null;
      if (!whenVal) { errEl.innerHTML = '<div class="teams-error">Choose a date and time.</div>'; return; }
      submitBtn.disabled = true; submitBtn.textContent = 'Scheduling\u2026';

      if (kind !== 'bible_study') {
        var ssPayload = {
          church_id: churchId, student_id: student.id, teacher_id: teacherId,
          scheduled_at: new Date(whenVal).toISOString(),
          lesson: null, notes: notes, status: 'scheduled',
          kind: kind, is_cultivation: (kind === 'cultivation')
        };
        if (kind === 'visitation') {
          var ssAddr = ov.querySelector('#ssAddress');
          if (ssAddr && ssAddr.value.trim()) ssPayload.notes = '[Address: ' + ssAddr.value.trim() + ']' + (ssPayload.notes ? ' ' + ssPayload.notes : '');
        }
        sb.from('bst_sessions').insert(ssPayload).then(function(res){
          submitBtn.disabled = false; submitBtn.textContent = 'Schedule';
          if (res.error) { errEl.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Something went wrong.') + '</div>'; return; }
          ov.remove();
          load().then(render);
        });
        return;
      }

      sb.rpc('bst_schedule_session', {
        p_student: student.id, p_teacher: teacherId,
        p_when: new Date(whenVal).toISOString(),
        p_lesson: ov.querySelector('#ssLesson').value || null,
        p_notes: notes, p_church: churchId, p_force: !!force
      }).then(function(res){
        submitBtn.disabled = false; submitBtn.textContent = 'Schedule';
        if (res.error) { errEl.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Something went wrong.') + '</div>'; return; }
        var data = res.data || {};
        if (data.needs_confirmation) {
          var lines = Array.isArray(data.notes) ? data.notes : [];
          confirmBanner.innerHTML = '<div class="teams-error" style="background:var(--surface-2);color:var(--ink)">' +
            (lines.length ? lines.map(esc).join('<br>') : 'This time needs confirmation.') +
            '<div style="margin-top:8px"><button class="teams-btn teams-btn-sm" id="ssConfirmBtn" type="button">Confirm anyway</button></div>' +
          '</div>';
          ov.querySelector('#ssConfirmBtn').addEventListener('click', function(){ doSubmit(true); });
          return;
        }
        ov.remove();
        load().then(render);
      });
    }
    submitBtn.addEventListener('click', function(){ doSubmit(false); });
  }

  function wireComposer(){
    var btn = document.getElementById('noteSubmitBtn');
    var errEl = document.getElementById('noteErr');
    btn.addEventListener('click', function(){
      var body = document.getElementById('noteBody').value.trim();
      var sensitivity = document.getElementById('noteSensitivity').value;
      var pinned = document.getElementById('notePinned').checked;
      errEl.innerHTML = '';
      if (!body) { errEl.innerHTML = '<div class="teams-error">Write something before saving.</div>'; return; }
      btn.disabled = true; btn.textContent = 'Saving\u2026';
      var sb = window.TeamsCtx.sb;
      sb.from('bst_student_notes').insert({
        student_id: state.student.id,
        body: body,
        sensitivity: sensitivity,
        pinned: pinned,
        author_id: window.TeamsCtx.activeMember ? window.TeamsCtx.activeMember.id : null
      }).then(function(res){
        btn.disabled = false; btn.textContent = 'Add note';
        if (res.error) {
          errEl.innerHTML = '<div class="teams-error">Could not save note: ' + esc(res.error.message || 'permission denied') + '</div>';
          return;
        }
        // Clear form after successful save
        var bodyEl = document.getElementById('noteBody'); if (bodyEl) bodyEl.value = '';
        var pinnedEl = document.getElementById('notePinned'); if (pinnedEl) pinnedEl.checked = false;
        load().then(render);
      });
    });
  }

  window.TeamsCtx.ready.then(function(){
    if (!window.TeamsCtx.requireAccess(root)) return;
    load().then(function(ok){
      if (!ok) { renderMissing(); return; }
      render();
    });
  });
})();
