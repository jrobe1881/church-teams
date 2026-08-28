/* /teams/profile/ — edit your display name, phone, email, and notification
 * preferences for the currently active church. Backed by bst_update_my_profile,
 * which only touches the caller's own bst_members row. */
(function () {
  'use strict';
  if (!window.TeamsCtx || !window.TeamsCtx.ready) return;
  var root = document.getElementById('profileRoot');
  if (!root) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  window.TeamsCtx.ready.then(function () {
    var ctx = window.TeamsCtx;
    if (!ctx.user) {
      root.innerHTML =
        '<div class="teams-empty">' +
          '<span class="teams-empty-glyph" aria-hidden="true">\u2756</span>' +
          '<h2>Sign in required</h2>' +
          '<p>Sign in to edit your Teams profile.</p>' +
        '</div>';
      return;
    }
    if (!ctx.activeChurchId) {
      root.innerHTML =
        '<div class="teams-empty">' +
          '<span class="teams-empty-glyph" aria-hidden="true">\u2756</span>' +
          '<h2>Join a church first</h2>' +
          '<p>Your profile is per-church. Join or register a church to edit it.</p>' +
          '<a class="teams-btn" href="/teams/">Go to Teams</a>' +
        '</div>';
      return;
    }
    loadAndRender();
  });

  function activeMembership() {
    var ctx = window.TeamsCtx;
    var list = ctx.memberships || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].church_id === ctx.activeChurchId) return list[i];
    }
    return null;
  }

  function loadAndRender(){
    var ctx = window.TeamsCtx;
    ctx.sb.from('bst_members')
      .select('id,full_name,phone,email,notify_sms,notify_email,role,languages,also_teaches')
      .eq('user_id', ctx.user.id)
      .eq('church_id', ctx.activeChurchId)
      .eq('active', true)
      .maybeSingle()
      .then(function(res){
        if (res.error || !res.data) {
          root.innerHTML =
            '<div class="teams-empty">' +
              '<span class="teams-empty-glyph" aria-hidden="true">\u2756</span>' +
              '<h2>Could not load profile</h2>' +
              '<p>Try refreshing the page.</p>' +
            '</div>';
          return;
        }
        render(res.data);
      });
  }

  function render(row) {
    var m = activeMembership() || {};
    var isAdmin = (row.role === 'church_admin' || m.role === 'church_admin');
    var roleLabel = isAdmin ? 'Church admin' : 'Teacher';
    var churchLabel = m.church_name || 'Your church';
    var smsChecked   = row.notify_sms   !== false ? ' checked' : '';
    var emailChecked = row.notify_email !== false ? ' checked' : '';
    // Only teachers (and admins who opted into teaching) need a language list
    // for student matching. Everyone else still sees the row for completeness.
    var teachesStudents = row.role === 'teacher' || (isAdmin && row.also_teaches === true);
    var langHelper = teachesStudents
      ? 'Choose every language you can teach Bible studies in. New students are matched to teachers who speak their preferred language.'
      : 'Choose the languages you can teach in. Useful if you take on students later.';
    var langCheckboxes = window.TeamsLanguages
      ? window.TeamsLanguages.checkboxesHtml('profLang', row.languages || [])
      : '<div class="teams-card-desc">Language selector unavailable.</div>';

    root.innerHTML =
      '<section class="teams-card" style="margin-bottom:var(--s-5)">' +
        '<h3 class="teams-card-label">Your profile at ' + esc(churchLabel) + '</h3>' +
        '<p class="teams-card-desc" style="margin-bottom:var(--s-3)">Your phone is used for SMS session reminders. Your email is used as a fallback if SMS is not delivered.</p>' +
        '<form id="profileForm" autocomplete="off">' +
          '<div class="teams-field"><label for="profName">Display name</label>' +
            '<input id="profName" name="full_name" type="text" required maxlength="120" value="' + esc(row.full_name || '') + '" /></div>' +
          '<div class="teams-field"><label for="profPhone">Mobile phone (for SMS)</label>' +
            '<input id="profPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+1 (555) 123-4567" value="' + esc(row.phone || '') + '" /></div>' +
          '<div class="teams-field"><label for="profEmail">Contact email</label>' +
            '<input id="profEmail" name="email" type="email" autocomplete="email" placeholder="you@example.com" value="' + esc(row.email || '') + '" /></div>' +

          '<div class="teams-field" style="display:flex;align-items:center;gap:8px">' +
            '<input id="profNotifySms" type="checkbox"' + smsChecked + ' />' +
            '<label for="profNotifySms" style="margin:0">Text me about scheduled sessions</label>' +
          '</div>' +
          '<div class="teams-field" style="display:flex;align-items:center;gap:8px">' +
            '<input id="profNotifyEmail" type="checkbox"' + emailChecked + ' />' +
            '<label for="profNotifyEmail" style="margin:0">Email me about scheduled sessions</label>' +
          '</div>' +

          '<div class="teams-field" id="profLangField">' +
            '<label>Languages you can teach in</label>' +
            '<p class="teams-card-desc" style="margin:4px 0 8px">' + esc(langHelper) + '</p>' +
            langCheckboxes +
          '</div>' +

          '<div id="profErr" role="alert" aria-live="polite" style="margin-top:var(--s-2)"></div>' +
          '<div style="display:flex;gap:var(--s-2);margin-top:var(--s-4);flex-wrap:wrap">' +
            '<button id="profSaveBtn" class="teams-btn" type="submit">Save</button>' +
            '<a class="teams-btn teams-btn-secondary" href="/teams/">Cancel</a>' +
          '</div>' +
        '</form>' +
      '</section>' +
      '<section class="teams-card" style="margin-bottom:var(--s-5)">' +
        '<h3 class="teams-card-label">Membership details</h3>' +
        '<div class="teams-row"><div><strong style="font-size:var(--t-sm)">Church</strong><div class="teams-card-desc">' + esc(churchLabel) + '</div></div></div>' +
        '<div class="teams-row"><div><strong style="font-size:var(--t-sm)">Role</strong><div class="teams-card-desc">' + esc(roleLabel) + '</div></div></div>' +
        '<div class="teams-row"><div><strong style="font-size:var(--t-sm)">Sign-in email</strong><div class="teams-card-desc">' + esc((window.TeamsCtx.user && window.TeamsCtx.user.email) || '') + '</div></div></div>' +
      '</section>' +
      '<section class="teams-card" id="leaveCard">' +
        '<h3 class="teams-card-label" style="color:var(--accent)">Leave this church</h3>' +
        '<p class="teams-card-desc" style="margin-bottom:var(--s-3)">Removes you from ' + esc(churchLabel) + '. Any students assigned to you will be unassigned, and your open follow-ups will be removed. You keep your Bible Parlor account and can rejoin any church later.' +
          (isAdmin ? ' As a church admin, another admin must remain before you can leave.' : '') +
        '</p>' +
        '<div id="leaveErr" role="alert" aria-live="polite" style="margin-bottom:var(--s-2)"></div>' +
        '<div id="leaveStep1">' +
          '<button id="leaveBtn1" type="button" class="teams-btn teams-btn-secondary" style="color:var(--accent);border-color:var(--accent);background:transparent">Leave church</button>' +
        '</div>' +
        '<div id="leaveStep2" style="display:none">' +
          '<p class="teams-card-desc" style="margin-bottom:var(--s-2)"><strong>Are you sure?</strong> This cannot be undone from your side. A church admin will need to invite you back.</p>' +
          '<div style="display:flex;gap:var(--s-2);flex-wrap:wrap">' +
            '<button id="leaveBtn2" type="button" class="teams-btn" style="background:var(--accent);color:#fff;border-color:var(--accent)">Yes, leave ' + esc(churchLabel) + '</button>' +
            '<button id="leaveCancel" type="button" class="teams-btn teams-btn-secondary">Cancel</button>' +
          '</div>' +
        '</div>' +
      '</section>';

    wire();
    wireLeave();
  }

  function friendlyLeaveError(msg){
    if (!msg) return 'Could not leave the church. Try again.';
    if (/last_admin_cannot_leave/i.test(msg)) return 'You are the last church admin. Promote another member to church admin first, then try again.';
    if (/not_a_member/i.test(msg)) return 'You are not currently a member of this church.';
    if (/not_authenticated/i.test(msg)) return 'Please sign in and try again.';
    if (/church_required/i.test(msg)) return 'No church is currently selected.';
    return msg;
  }

  function wireLeave(){
    var step1 = document.getElementById('leaveStep1');
    var step2 = document.getElementById('leaveStep2');
    var btn1  = document.getElementById('leaveBtn1');
    var btn2  = document.getElementById('leaveBtn2');
    var cx    = document.getElementById('leaveCancel');
    var err   = document.getElementById('leaveErr');
    if (!btn1 || !btn2) return;

    btn1.addEventListener('click', function(){
      err.innerHTML = '';
      step1.style.display = 'none';
      step2.style.display = 'block';
    });
    cx.addEventListener('click', function(){
      step2.style.display = 'none';
      step1.style.display = 'block';
    });
    btn2.addEventListener('click', function(){
      err.innerHTML = '';
      btn2.disabled = true;
      btn2.textContent = 'Leaving\u2026';
      window.TeamsCtx.sb.rpc('bst_leave_church', {
        p_church: window.TeamsCtx.activeChurchId
      }).then(function(res){
        if (res.error){
          btn2.disabled = false;
          btn2.textContent = 'Yes, leave';
          err.innerHTML = '<div class="teams-error">' + esc(friendlyLeaveError(res.error.message)) + '</div>';
          return;
        }
        // Success — bounce to /teams/ which will now show the join-first landing.
        try { window.safeLS && window.safeLS.removeItem && window.safeLS.removeItem('bst_active_church'); } catch(e){}
        location.href = '/teams/';
      });
    });
  }

  function friendlyError(msg){
    if (!msg) return 'Could not save. Try again.';
    if (/phone_invalid/i.test(msg)) return 'That phone number does not look valid. Include area code, e.g. +1 (555) 123-4567.';
    if (/email_invalid/i.test(msg)) return 'That email does not look valid.';
    if (/name_required/i.test(msg)) return 'Name is required.';
    if (/name_too_long/i.test(msg)) return 'Name must be 120 characters or fewer.';
    return msg;
  }

  function wire() {
    var form = document.getElementById('profileForm');
    if (!form) return;
    var nameEl  = document.getElementById('profName');
    var phoneEl = document.getElementById('profPhone');
    var emailEl = document.getElementById('profEmail');
    var smsEl   = document.getElementById('profNotifySms');
    var mailEl  = document.getElementById('profNotifyEmail');
    var btn     = document.getElementById('profSaveBtn');
    var errEl   = document.getElementById('profErr');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errEl.innerHTML = '';
      var name = (nameEl.value || '').trim();
      if (!name) { errEl.innerHTML = '<div class="teams-error">Name is required.</div>'; return; }
      if (name.length > 120) { errEl.innerHTML = '<div class="teams-error">Name must be 120 characters or fewer.</div>'; return; }

      btn.disabled = true;
      btn.textContent = 'Saving\u2026';
      var langField = document.getElementById('profLangField');
      var languages = (window.TeamsLanguages && langField) ? window.TeamsLanguages.readCheckboxes(langField) : null;
      window.TeamsCtx.sb.rpc('bst_update_my_profile', {
        p_church:       window.TeamsCtx.activeChurchId,
        p_full_name:    name,
        p_phone:        (phoneEl.value || '').trim(),
        p_email:        (emailEl.value || '').trim(),
        p_notify_sms:   !!smsEl.checked,
        p_notify_email: !!mailEl.checked,
        p_languages:    languages
      }).then(function (res) {
        btn.disabled = false;
        btn.textContent = 'Save';
        if (res.error) {
          errEl.innerHTML = '<div class="teams-error">' + esc(friendlyError(res.error.message)) + '</div>';
          return;
        }
        var m = activeMembership();
        if (m) m.full_name = name;
        errEl.innerHTML = '<div class="teams-note">Saved.</div>';
      });
    });
  }
})();
