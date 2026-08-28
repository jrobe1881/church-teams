/* /teams/admin/admin.js — Church admin console: Pending Approvals, Church
   Settings (password + approval toggle lives here, no separate settings
   page), Teachers & Members, Teams (create/edit/delete + member assignment),
   Caseloads, All Overdue Follow-ups. */
(function(){
  var root = document.getElementById('adminRoot');
  var tabbarSlot = document.getElementById('teamsTabbarSlot');
  function esc(s){ return (window.TeamsCtx && window.TeamsCtx.esc) ? window.TeamsCtx.esc(s) : String(s == null ? '' : s); }

  var state = { church: null, settings: null, churchSlots: [], members: [], teams: [], teamMembers: [], overdue: [], students: {} };

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
      sb.from('bst_church_service_slots').select('*').eq('church_id', churchId).order('sort_order', { ascending: true }).order('dow', { ascending: true }).order('service_time', { ascending: true })
    ]).then(function(results){
      state.church = results[0].data || null;
      state.members = results[1].error ? [] : (results[1].data || []);
      state.teams = results[2].error ? [] : (results[2].data || []);
      state.teamMembers = results[3].error ? [] : (results[3].data || []);
      state.overdue = results[4].error ? [] : (results[4].data || []);
      state.settings = (results[5] && !results[5].error) ? (results[5].data || null) : null;
      state.churchSlots = (results[6] && !results[6].error) ? (results[6].data || []) : [];
      var ids = Array.from(new Set(state.overdue.map(function(f){ return f.student_id; }).filter(Boolean)));
      if (!ids.length) return;
      return sb.from('bst_students').select('id,full_name').in('id', ids).then(function(sres){
        state.students = {};
        (sres.data || []).forEach(function(s){ state.students[s.id] = s.full_name; });
      });
    });
  }

  function memberName(id){
    var m = state.members.filter(function(x){ return x.id === id; })[0];
    return m ? m.full_name : '';
  }

  // ---- Pending Approvals ----
  function renderPending(){
    var pending = state.members.filter(function(m){ return m.status === 'pending'; });
    var body = pending.length
      ? pending.map(function(m){
          return '<div class="teams-row" data-pending-id="' + esc(m.id) + '">' +
            '<div style="flex:1;min-width:0"><strong style="font-size:var(--t-sm)">' + esc(m.full_name || 'Unnamed') + '</strong>' +
            '<div class="teams-card-desc">Requested ' + esc(new Date(m.created_at).toLocaleDateString()) + '</div></div>' +
            '<div style="display:flex;gap:6px">' +
              '<button class="teams-btn teams-btn-sm" data-approve="' + esc(m.id) + '" type="button">Approve</button>' +
              '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-reject="' + esc(m.id) + '" type="button">Reject</button>' +
            '</div>' +
          '</div>';
        }).join('')
      : '<div class="teams-card-desc">No pending requests.</div>';
    return '<section class="teams-card" id="pending" style="margin-bottom:var(--s-5)"><h3 class="teams-card-label">Pending Approvals</h3>' + body + '</section>';
  }

  function wirePending(){
    Array.prototype.forEach.call(root.querySelectorAll('[data-approve]'), function(btn){
      btn.addEventListener('click', function(){
        btn.disabled = true;
        window.TeamsCtx.sb.rpc('bst_approve_pending_member', { p_member: btn.getAttribute('data-approve') }).then(function(res){
          if (res.error) { alert('Could not approve: ' + res.error.message); btn.disabled = false; return; }
          load().then(render);
        });
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-reject]'), function(btn){
      btn.addEventListener('click', function(){
        btn.disabled = true;
        window.TeamsCtx.sb.rpc('bst_reject_pending_member', { p_member: btn.getAttribute('data-reject') }).then(function(res){
          if (res.error) { alert('Could not reject: ' + res.error.message); btn.disabled = false; return; }
          load().then(render);
        });
      });
    });
  }

  // ---- Church Settings ----
  function renderSettings(){
    var c = state.church || {};
    return '<section class="teams-card" style="margin-bottom:var(--s-5)">' +
      '<h3 class="teams-card-label">Church Settings</h3>' +
      '<div class="teams-field"><label>Slug</label><div class="teams-card-desc">' + esc(c.slug || '') + '</div></div>' +
      '<div class="teams-field"><label for="setPassword">Join password</label><input id="setPassword" type="text" placeholder="Leave blank for no password" /></div>' +
      '<div class="teams-checkbox-row"><input type="checkbox" id="setApproval"' + (c.requires_approval ? ' checked' : '') + ' /><label for="setApproval">Require admin approval for new joiners</label></div>' +
      '<div id="setErr"></div>' +
      '<button class="teams-btn teams-btn-sm" id="setSaveBtn" type="button">Save settings</button>' +
    '</section>';
  }

  function wireSettings(){
    var btn = document.getElementById('setSaveBtn');
    var errEl = document.getElementById('setErr');
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
        if (res.error) { errEl.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Something went wrong.') + '</div>'; return; }
        load().then(render);
      });
    });
  }

  // ---- Teachers & Members ----
  function renderMembers(){
    var active = state.members.filter(function(m){ return m.status !== 'pending'; });
    // Count admins so we don't allow the last admin to demote themselves
    var adminCount = active.filter(function(m){ return m.role === 'church_admin' && m.active !== false; }).length;
    var myMemberId = (window.TeamsCtx.activeMember && window.TeamsCtx.activeMember.id) || null;
    var body = active.length
      ? active.map(function(m){
          var isMe = (m.id === myMemberId);
          var isAdmin = (m.role === 'church_admin');
          var canDemote = isAdmin && adminCount > 1;
          var promoteBtn = isAdmin
            ? '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-set-role="teacher" data-mid="' + esc(m.id) + '" type="button"' + (canDemote ? '' : ' disabled title="Cannot demote the last remaining admin"') + '>Make teacher</button>'
            : '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-set-role="church_admin" data-mid="' + esc(m.id) + '" type="button">Make admin</button>';
          var toggleBtn = '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-toggle-active="' + esc(m.id) + '" data-active="' + (m.active !== false) + '" type="button"' + (isMe ? ' disabled title="Cannot deactivate yourself"' : '') + '>' + (m.active === false ? 'Reactivate' : 'Deactivate') + '</button>';
          // Admins can opt in as teachers so they can be assigned to sessions and prospects.
          var alsoTeachesBtn = isAdmin
            ? '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-toggle-also-teaches="' + esc(m.id) + '" data-also="' + (m.also_teaches === true) + '" type="button">' + (m.also_teaches === true ? 'Remove teacher duties' : 'Also serve as teacher') + '</button>'
            : '';
          var roleLabel = m.role === 'church_admin'
            ? (m.also_teaches === true ? 'Church admin + teacher' : 'Church admin')
            : 'Teacher';
          var phoneVal = esc(m.phone || '');
          var emailVal = esc(m.email || '');
          return '<div class="teams-row" style="flex-wrap:wrap;gap:var(--s-2);align-items:flex-start">' +
            '<div style="flex:1;min-width:200px">' +
              '<strong style="font-size:var(--t-sm)">' + esc(m.full_name || 'Unnamed') + (isMe ? ' <span class="teams-card-desc" style="display:inline">(you)</span>' : '') + '</strong>' +
              '<div class="teams-card-desc">' + esc(roleLabel) + (m.active === false ? ' \u00b7 Deactivated' : '') + '</div>' +
              '<div style="display:grid;grid-template-columns:1fr;gap:6px;margin-top:8px">' +
                '<label style="display:block">' +
                  '<span class="teams-card-desc" style="display:block;margin-bottom:2px">Mobile (for SMS)</span>' +
                  '<input class="teams-mem-phone" data-mid="' + esc(m.id) + '" type="tel" inputmode="tel" placeholder="+1 (555) 123-4567" value="' + phoneVal + '" />' +
                '</label>' +
                '<label style="display:block">' +
                  '<span class="teams-card-desc" style="display:block;margin-bottom:2px">Email</span>' +
                  '<input class="teams-mem-email" data-mid="' + esc(m.id) + '" type="email" placeholder="you@example.com" value="' + emailVal + '" />' +
                '</label>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
                  '<button class="teams-btn teams-btn-sm" data-save-contact="' + esc(m.id) + '" type="button">Save contact</button>' +
                  '<span class="teams-mem-status" data-status-for="' + esc(m.id) + '" style="align-self:center"></span>' +
                '</div>' +
                '<details class="teams-mem-lang" data-mid="' + esc(m.id) + '" style="margin-top:8px">' +
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
            '<div style="display:flex;gap:var(--s-2);flex-wrap:wrap">' + promoteBtn + alsoTeachesBtn + toggleBtn + '</div>' +
          '</div>';
        }).join('')
      : '<div class="teams-card-desc">No members yet.</div>';
    return '<section class="teams-card" style="margin-bottom:var(--s-5)"><h3 class="teams-card-label">Teachers &amp; Members</h3>' + body + '</section>';
  }

  function wireMembers(){
    Array.prototype.forEach.call(root.querySelectorAll('[data-toggle-active]'), function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-toggle-active');
        var isActive = btn.getAttribute('data-active') === 'true';
        btn.disabled = true;
        window.TeamsCtx.sb.from('bst_members').update({ active: !isActive }).eq('id', id).then(function(res){
          if (res.error) { alert('Could not update member: ' + res.error.message); btn.disabled = false; return; }
          load().then(render);
        });
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-set-role]'), function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-mid');
        var role = btn.getAttribute('data-set-role');
        var label = (role === 'church_admin' ? 'promote to church admin' : 'change to teacher');
        if (!confirm('Are you sure you want to ' + label + '?')) return;
        btn.disabled = true;
        window.TeamsCtx.sb.from('bst_members').update({ role: role }).eq('id', id).then(function(res){
          if (res.error) { alert('Could not change role: ' + res.error.message); btn.disabled = false; return; }
          load().then(render);
        });
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-toggle-also-teaches]'), function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-toggle-also-teaches');
        var isOn = btn.getAttribute('data-also') === 'true';
        btn.disabled = true;
        window.TeamsCtx.sb.from('bst_members').update({ also_teaches: !isOn }).eq('id', id).then(function(res){
          if (res.error) { alert('Could not update: ' + res.error.message); btn.disabled = false; return; }
          load().then(render);
        });
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-save-languages]'), function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-save-languages');
        var det = root.querySelector('.teams-mem-lang[data-mid="' + id + '"]');
        var statusEl = root.querySelector('.teams-mem-lang-status[data-lang-status-for="' + id + '"]');
        if (!det || !window.TeamsLanguages) return;
        var langs = window.TeamsLanguages.readCheckboxes(det);
        btn.disabled = true; var prev = btn.textContent; btn.textContent = 'Saving\u2026';
        statusEl.innerHTML = '';
        window.TeamsCtx.sb.from('bst_members').update({
          languages: langs,
          updated_at: new Date().toISOString()
        }).eq('id', id).then(function(res){
          btn.disabled = false; btn.textContent = prev;
          if (res.error) { statusEl.innerHTML = '<span class="teams-error" style="display:inline">' + esc(res.error.message || 'Could not save.') + '</span>'; return; }
          statusEl.innerHTML = '<span class="teams-note" style="display:inline">Saved.</span>';
          var m = state.members.filter(function(x){ return x.id === id; })[0];
          if (m) m.languages = langs;
          setTimeout(function(){ statusEl.innerHTML = ''; }, 2000);
        });
      });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-save-contact]'), function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-save-contact');
        var phoneInput = root.querySelector('.teams-mem-phone[data-mid="' + id + '"]');
        var emailInput = root.querySelector('.teams-mem-email[data-mid="' + id + '"]');
        var statusEl   = root.querySelector('.teams-mem-status[data-status-for="' + id + '"]');
        var phone = (phoneInput ? phoneInput.value : '').trim();
        var email = (emailInput ? emailInput.value : '').trim();
        if (phone && !/^\+?[0-9\s().-]{7,25}$/.test(phone)) {
          statusEl.innerHTML = '<span class="teams-error" style="display:inline">Phone looks invalid.</span>';
          return;
        }
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          statusEl.innerHTML = '<span class="teams-error" style="display:inline">Email looks invalid.</span>';
          return;
        }
        btn.disabled = true; var prevText = btn.textContent; btn.textContent = 'Saving\u2026';
        statusEl.innerHTML = '';
        window.TeamsCtx.sb.from('bst_members').update({
          phone: phone || null,
          email: email || null,
          updated_at: new Date().toISOString()
        }).eq('id', id).then(function(res){
          btn.disabled = false; btn.textContent = prevText;
          if (res.error) { statusEl.innerHTML = '<span class="teams-error" style="display:inline">' + esc(res.error.message || 'Could not save.') + '</span>'; return; }
          statusEl.innerHTML = '<span class="teams-note" style="display:inline">Saved.</span>';
          // Reflect the new values in local state without a full reload.
          for (var i=0;i<state.members.length;i++){
            if (state.members[i].id === id) { state.members[i].phone = phone || null; state.members[i].email = email || null; break; }
          }
          setTimeout(function(){ if (statusEl) statusEl.innerHTML = ''; }, 3000);
        });
      });
    });
  }

  // ---- Teams ----
  function renderTeams(){
    var body = state.teams.length
      ? state.teams.map(function(t){
          var members = state.teamMembers.filter(function(tm){ return tm.team_id === t.id; });
          var names = members.map(function(tm){ return memberName(tm.member_id); }).filter(Boolean).join(', ') || 'No members assigned';
          return '<div class="teams-row" style="flex-wrap:wrap;gap:var(--s-2)">' +
            '<div style="flex:1;min-width:0">' +
              '<strong style="font-size:var(--t-sm)">' + esc(t.name || 'Team') + '</strong>' +
              '<div class="teams-card-desc">' + esc(names) + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
              '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-edit-team="' + esc(t.id) + '" type="button">Edit</button>' +
              '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-delete-team="' + esc(t.id) + '" type="button" style="color:#7a1f2b;border-color:#e5c7cb">Delete</button>' +
            '</div>' +
          '</div>';
        }).join('')
      : '<div class="teams-card-desc" id="teamsEmptyMsg">No teams set up yet.</div>';
    return '<section class="teams-card" style="margin-bottom:var(--s-5)">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:var(--s-3);margin-bottom:var(--s-3)">' +
        '<h3 class="teams-card-label" style="margin:0">Teams</h3>' +
        '<button class="teams-btn teams-btn-sm" id="newTeamBtn" type="button">+ New Team</button>' +
      '</div>' +
      body +
    '</section>';
  }

  function wireTeams(){
    var newBtn = document.getElementById('newTeamBtn');
    if (newBtn) newBtn.addEventListener('click', function(){ openTeamSheet(null); });

    Array.prototype.forEach.call(root.querySelectorAll('[data-edit-team]'), function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-edit-team');
        var team = state.teams.filter(function(t){ return t.id === id; })[0];
        if (team) openTeamSheet(team);
      });
    });

    Array.prototype.forEach.call(root.querySelectorAll('[data-delete-team]'), function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-delete-team');
        var team = state.teams.filter(function(t){ return t.id === id; })[0];
        var name = (team && team.name) || 'this team';
        if (!confirm('Delete "' + name + '"? All team assignments will be removed. This cannot be undone.')) return;
        btn.disabled = true;
        var sb = window.TeamsCtx.sb;
        // Delete team_members first, then the team.
        sb.from('bst_team_members').delete().eq('team_id', id).then(function(res){
          if (res.error) { alert('Could not remove team members: ' + res.error.message); btn.disabled = false; return; }
          sb.from('bst_teams').delete().eq('id', id).then(function(res2){
            if (res2.error) { alert('Could not delete team: ' + res2.error.message); btn.disabled = false; return; }
            load().then(render);
          });
        });
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

  function openTeamSheet(existing){
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;
    var t = existing || {};

    // Build the active members list for checkboxes
    var activeMembers = state.members.filter(function(m){ return m.status !== 'pending' && m.active !== false; });
    var existingMemberIds = existing
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
        '<div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r-md);padding:var(--s-3)">' +
          memberCheckboxes +
        '</div>' +
      '</div>' +
      '<div id="teamErr"></div>' +
      '<button class="teams-btn teams-btn-block" id="teamSaveBtn" type="button">' + (existing ? 'Save changes' : 'Create team') + '</button>'
    );
    ov.querySelector('.teams-sheet-close').addEventListener('click', function(){ ov.remove(); });

    ov.querySelector('#teamSaveBtn').addEventListener('click', function(){
      var btn = ov.querySelector('#teamSaveBtn');
      var errEl = ov.querySelector('#teamErr');
      var name = ov.querySelector('#teamName').value.trim();
      if (!name) { errEl.innerHTML = '<div class="teams-error">Team name is required.</div>'; return; }

      var selectedIds = Array.prototype.slice.call(ov.querySelectorAll('input[name="teamMember"]:checked')).map(function(cb){ return cb.value; });

      btn.disabled = true; btn.textContent = 'Saving\u2026';

      function saveMemberships(teamId){
        // Delete existing team_members, then insert selected.
        sb.from('bst_team_members').delete().eq('team_id', teamId).then(function(delRes){
          if (delRes.error) { errEl.innerHTML = '<div class="teams-error">Could not update members: ' + esc(delRes.error.message || 'error') + '</div>'; btn.disabled = false; btn.textContent = existing ? 'Save changes' : 'Create team'; return; }
          if (!selectedIds.length) { ov.remove(); load().then(render); return; }
          var rows = selectedIds.map(function(mid){ return { team_id: teamId, member_id: mid }; });
          sb.from('bst_team_members').insert(rows).then(function(insRes){
            btn.disabled = false; btn.textContent = existing ? 'Save changes' : 'Create team';
            if (insRes.error) { errEl.innerHTML = '<div class="teams-error">Team saved but members failed: ' + esc(insRes.error.message || 'error') + '</div>'; load().then(render); return; }
            ov.remove(); load().then(render);
          });
        });
      }

      if (existing) {
        // Update name then refresh members.
        sb.from('bst_teams').update({ name: name }).eq('id', existing.id).then(function(res){
          if (res.error) { errEl.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Could not update team.') + '</div>'; btn.disabled = false; btn.textContent = 'Save changes'; return; }
          saveMemberships(existing.id);
        });
      } else {
        sb.from('bst_teams').insert({ church_id: churchId, name: name }).select('id').single().then(function(res){
          if (res.error || !res.data) { errEl.innerHTML = '<div class="teams-error">' + esc((res.error && res.error.message) || 'Could not create team.') + '</div>'; btn.disabled = false; btn.textContent = 'Create team'; return; }
          saveMemberships(res.data.id);
        });
      }
    });
  }

  // ---- Caseloads ----
  function renderCaseloads(){
    var teachers = state.members.filter(function(m){ return m.role === 'teacher' && m.status === 'active'; });
    var body = teachers.length
      ? teachers.map(function(t){ return '<div class="teams-row"><div><strong style="font-size:var(--t-sm)">' + esc(t.full_name) + '</strong></div></div>'; }).join('')
      : '<div class="teams-card-desc">No active teachers yet.</div>';
    return '<section class="teams-card" style="margin-bottom:var(--s-5)"><h3 class="teams-card-label">Caseloads</h3>' + body + '</section>';
  }

  // ---- All Overdue Follow-ups ----
  function renderOverdue(){
    var body = state.overdue.length
      ? state.overdue.map(function(f){
          var name = state.students[f.student_id] || 'Prospect';
          return '<a class="teams-row" href="/teams/student/?id=' + esc(f.student_id) + '"><div><strong style="font-size:var(--t-sm)">' + esc(name) + '</strong><div class="teams-card-desc">' + esc(f.channel || '') + '</div></div></a>';
        }).join('')
      : '<div class="teams-card-desc">No overdue follow-ups.</div>';
    return '<section class="teams-card"><h3 class="teams-card-label">All Overdue Follow-ups</h3>' + body + '</section>';
  }

  // ---- Weekly Schedule Defaults ----
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
  function timeVal(t){
    if (!t) return '';
    // Postgres time comes back as 'HH:MM:SS'; input[type=time] wants 'HH:MM'.
    return String(t).slice(0, 5);
  }
  function renderChurchSlotRow(slot){
    // slot may be a persisted row (has id) or a draft (no id).
    var id = slot.id || '';
    return '<div class="teams-row" data-slot-row="' + esc(id) + '" style="gap:8px;flex-wrap:wrap">' +
      '<input class="wdSlotLabel" type="text" placeholder="Label (optional)" value="' + esc(slot.label || '') + '" style="flex:2;min-width:140px" />' +
      '<select class="wdSlotDow" style="flex:1;min-width:140px">' + dayOptionsHtml(slot.dow) + '</select>' +
      '<input class="wdSlotTime" type="time" value="' + esc(timeVal(slot.service_time)) + '" style="flex:0 0 120px" />' +
      '<button class="teams-btn teams-btn-sm teams-btn-secondary wdSlotRemove" type="button" aria-label="Remove">Remove</button>' +
    '</div>';
  }

  function renderWeeklyDefaults(){
    var s = state.settings || {};
    var slots = state.churchSlots || [];
    var slotsHtml = slots.map(renderChurchSlotRow).join('');

    return '<section class="teams-card" style="margin-bottom:var(--s-5)">' +
      '<h3 class="teams-card-label">Weekly Schedule Defaults</h3>' +
      '<div class="teams-card-desc" style="margin-bottom:var(--s-3)">Set the recurring day and time for cultivation and church services. When scheduling those types, the date and time pre-fill to the next occurrence and can still be adjusted per session.</div>' +

      '<div class="teams-field"><label>Cultivation <span class="teams-card-desc" style="font-weight:400">(one per week)</span></label>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<select id="wdCultDow" style="flex:1;min-width:140px">' + dayOptionsHtml(s.cultivation_dow) + '</select>' +
          '<input id="wdCultTime" type="time" value="' + esc(timeVal(s.cultivation_time)) + '" style="flex:0 0 120px" />' +
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

    // --- Cultivation ---
    var cultBtn = document.getElementById('wdCultSaveBtn');
    if (cultBtn) {
      cultBtn.addEventListener('click', function(){
        var errEl = document.getElementById('wdCultErr');
        var okEl = document.getElementById('wdCultOk');
        errEl.innerHTML = ''; okEl.textContent = '';
        var dowRaw = document.getElementById('wdCultDow').value;
        var timeRaw = document.getElementById('wdCultTime').value;
        var payload = {
          church_id: churchId,
          cultivation_dow: dowRaw === '' ? null : parseInt(dowRaw, 10),
          cultivation_time: timeRaw || null,
          updated_at: new Date().toISOString()
        };
        cultBtn.disabled = true; cultBtn.textContent = 'Saving\u2026';
        sb.from('bst_church_settings').upsert(payload, { onConflict: 'church_id' }).then(function(res){
          cultBtn.disabled = false; cultBtn.textContent = 'Save cultivation';
          if (res.error) { errEl.innerHTML = '<div class="teams-error">' + esc(res.error.message || 'Could not save.') + '</div>'; return; }
          okEl.textContent = 'Saved.';
          load().then(render);
        });
      });
    }

    // --- Church slots: add / remove / save ---
    var addBtn = document.getElementById('wdSlotAdd');
    var slotsWrap = document.getElementById('wdSlots');

    function attachRowHandlers(row){
      var removeBtn = row.querySelector('.wdSlotRemove');
      if (removeBtn) removeBtn.addEventListener('click', function(){ row.remove(); if (!slotsWrap.querySelector('[data-slot-row]')) slotsWrap.innerHTML = '<div class="teams-card-desc">No church services yet.</div>'; });
    }
    Array.prototype.forEach.call(slotsWrap.querySelectorAll('[data-slot-row]'), attachRowHandlers);

    if (addBtn) {
      addBtn.addEventListener('click', function(){
        // Replace the empty-state message on first add.
        if (!slotsWrap.querySelector('[data-slot-row]')) slotsWrap.innerHTML = '';
        var tmp = document.createElement('div');
        tmp.innerHTML = renderChurchSlotRow({});
        var row = tmp.firstChild;
        slotsWrap.appendChild(row);
        attachRowHandlers(row);
      });
    }

    var chBtn = document.getElementById('wdChSaveBtn');
    if (chBtn) {
      chBtn.addEventListener('click', function(){
        var errEl = document.getElementById('wdChErr');
        var okEl = document.getElementById('wdChOk');
        errEl.innerHTML = ''; okEl.textContent = '';

        var rows = slotsWrap.querySelectorAll('[data-slot-row]');
        var rowsData = [];
        var bad = false;
        Array.prototype.forEach.call(rows, function(r, idx){
          var id = r.getAttribute('data-slot-row') || '';
          var label = r.querySelector('.wdSlotLabel').value.trim();
          var dowRaw = r.querySelector('.wdSlotDow').value;
          var timeRaw = r.querySelector('.wdSlotTime').value;
          if (dowRaw === '' || !timeRaw) { bad = true; return; }
          rowsData.push({
            id: id || null,
            label: label || null,
            dow: parseInt(dowRaw, 10),
            service_time: timeRaw,
            sort_order: idx
          });
        });
        if (bad) { errEl.innerHTML = '<div class="teams-error">Every service needs a day and a time.</div>'; return; }

        chBtn.disabled = true; chBtn.textContent = 'Saving\u2026';

        // Diff against state.churchSlots: delete removed, upsert kept/added.
        var keepIds = rowsData.filter(function(r){ return r.id; }).map(function(r){ return r.id; });
        var toDelete = (state.churchSlots || []).filter(function(s){ return keepIds.indexOf(s.id) === -1; }).map(function(s){ return s.id; });
        var toUpsert = rowsData.map(function(r){
          var row = {
            church_id: churchId,
            label: r.label,
            dow: r.dow,
            service_time: r.service_time,
            sort_order: r.sort_order,
            updated_at: new Date().toISOString()
          };
          if (r.id) row.id = r.id;
          return row;
        });

        var deletePromise = toDelete.length
          ? sb.from('bst_church_service_slots').delete().in('id', toDelete)
          : Promise.resolve({ error: null });

        deletePromise.then(function(delRes){
          if (delRes && delRes.error) throw delRes.error;
          if (!toUpsert.length) return { error: null };
          return sb.from('bst_church_service_slots').upsert(toUpsert);
        }).then(function(upRes){
          chBtn.disabled = false; chBtn.textContent = 'Save church services';
          if (upRes && upRes.error) { errEl.innerHTML = '<div class="teams-error">' + esc(upRes.error.message || 'Could not save.') + '</div>'; return; }
          okEl.textContent = 'Saved.';
          load().then(render);
        }).catch(function(err){
          chBtn.disabled = false; chBtn.textContent = 'Save church services';
          errEl.innerHTML = '<div class="teams-error">' + esc((err && err.message) || 'Could not save.') + '</div>';
        });
      });
    }
  }

  function render(){
    tabbarSlot.innerHTML = window.TeamsCtx.bottomTabs('admin');
    root.innerHTML = renderPending() + renderSettings() + renderWeeklyDefaults() + renderMembers() + renderTeams() + renderCaseloads() + renderOverdue();
    wirePending();
    wireSettings();
    wireWeeklyDefaults();
    wireMembers();
    wireTeams();
  }

  window.TeamsCtx.ready.then(function(){
    if (!window.TeamsCtx.requireAccess(root, { adminOnly: true })) return;
    load().then(render);
  });
})();
