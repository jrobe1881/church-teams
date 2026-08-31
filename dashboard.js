/* /teams/dashboard.js — Renders one of four views at /teams/ based on TeamsCtx:
   1. signed-out or signed-in-with-no-membership -> join-first form + register link
   2. signed-in with only pending membership -> waiting page
   3. signed-in with active membership (or site admin) -> dashboard cards
   Also mounts the mobile bottom tabs only for the dashboard state. */
(function(){
  var root = document.getElementById('teamsRoot');
  var subbarActions = document.getElementById('teamsSubbarActions');
  var tabbarSlot = document.getElementById('teamsTabbarSlot');

  function esc(s){ return (window.TeamsCtx && window.TeamsCtx.esc) ? window.TeamsCtx.esc(s) : String(s == null ? '' : s); }

  function renderJoinFirst(){
    // Delegates to the shared join-form renderer in /teams/join/join.js so
    // the inline landing form and the standalone /teams/join/ page stay
    // in lockstep. join.js is loaded on this page before dashboard.js.
    window.TeamsJoin.renderInto(root);
  }

  function renderPending(){
    var m = window.TeamsCtx.memberships.filter(function(x){ return x.status === 'pending'; })[0];
    root.innerHTML =
      '<div class="teams-empty" style="padding-top:var(--s-16)">' +
        '<span class="teams-empty-glyph" aria-hidden="true">\u2756</span>' +
        '<h2>Waiting on approval</h2>' +
        '<p>You have requested to join <strong>' + esc(m ? m.church_name : 'this church') + '</strong>. A church admin will approve you shortly. This page will refresh automatically.</p>' +
        '<button class="teams-btn teams-btn-secondary teams-btn-sm" id="leaveRequestBtn" type="button">Not the right church? Leave request</button>' +
        '<div id="leaveErr"></div>' +
      '</div>';

    document.getElementById('leaveRequestBtn').addEventListener('click', function(){
      if (!m) return;
      window.TeamsCtx.sb.rpc('bst_reject_pending_member', { p_member: m.id }).then(function(res){
        if (res.error) {
          document.getElementById('leaveErr').innerHTML = '<div class="teams-error">Contact your admin to withdraw your request.</div>';
          return;
        }
        window.TeamsCtx.reloadMemberships().then(function(){ location.reload(); });
      });
    });

    setInterval(function(){
      window.TeamsCtx.reloadMemberships().then(function(){
        if (window.TeamsCtx.hasTeamsAccess) location.reload();
      });
    }, 30000);
  }

  function skeletonCards(n){
    var html = '<div class="teams-grid">';
    for (var i=0;i<n;i++) html += '<div class="skeleton teams-skel-card"></div>';
    return html + '</div>';
  }

  function cardLink(href, num, label, desc, extraClass){
    return '<a class="teams-card' + (extraClass ? ' ' + extraClass : '') + '" href="' + href + '">' +
      '<div class="teams-card-num">' + num + '</div>' +
      '<div class="teams-card-label">' + esc(label) + '</div>' +
      '<div class="teams-card-desc">' + esc(desc) + '</div>' +
    '</a>';
  }

  function greetingText(){
    var h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function renderDashboard(){
    // Show church name in the subbar heading
    var m = window.TeamsCtx.activeMember;
    var churchName = m && m.church_name ? m.church_name : '';
    var subbarH1 = document.querySelector('.teams-subbar h1[data-i18n="nav.teams"]');
    if (subbarH1 && churchName) {
      subbarH1.textContent = churchName;
    }

    tabbarSlot.innerHTML = window.TeamsCtx.bottomTabs('dashboard');
    root.innerHTML = skeletonCards(6);
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;

    function countOf(table, filters){
      var q = sb.from(table).select('id', { count:'exact', head:true });
      if (churchId) q = q.eq('church_id', churchId);
      Object.keys(filters || {}).forEach(function(k){ q = q.eq(k, filters[k]); });
      return q.then(function(res){ return res.error ? 0 : (res.count || 0); });
    }

    var weekStart = new Date();
    var day = weekStart.getDay();
    var diffToMon = (day === 0 ? -6 : 1 - day);
    weekStart.setDate(weekStart.getDate() + diffToMon);
    weekStart.setHours(0,0,0,0);
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    var today = new Date().toISOString().slice(0,10);

    var tasksList = [
      countOf('bst_students', { status: 'new_intake' }),
      countOf('bst_students', { status: 'active' }),
      // Count of "teachers" for dashboard = teachers + admins who opted in as teachers.
      sb.from('bst_members').select('id, role, also_teaches, active, status')
        .eq('church_id', churchId).eq('status','active').eq('active', true)
        .then(function(res){
          if (res.error) return 0;
          return (res.data || []).filter(function(m){ return m.role === 'teacher' || (m.role === 'church_admin' && m.also_teaches === true); }).length;
        }),
      countOf('bst_followups', { status: 'overdue' }),
      sb.from('bst_calendar_events').select('id', { count:'exact', head:true })
        .eq('church_id', churchId)
        .gte('starts_at', weekStart.toISOString()).lt('starts_at', weekEnd.toISOString())
        .then(function(res){ return res.error ? 0 : (res.count || 0); })
    ];

    var isAdmin = window.TeamsCtx.isChurchAdmin || window.TeamsCtx.isSiteAdmin;
    var showBaptisms = isAdmin;
    if (showBaptisms) {
      tasksList.push(
        sb.from('bst_baptisms').select('id', { count:'exact', head:true })
          .eq('church_id', churchId).gte('baptism_date', today).in('status', ['planned','confirmed'])
          .then(function(res){ return res.error ? 0 : (res.count || 0); })
      );
    }
    var showPending = window.TeamsCtx.isChurchAdmin;
    if (showPending) tasksList.push(window.TeamsCtx.pendingCount());

    /* At-risk count for the Insights card: working prospects with no
       follow-up in 21+ days AND no session in 30+ days. */
    var showInsights = isAdmin;
    if (showInsights) {
      tasksList.push(
        Promise.all([
          sb.from('bst_students').select('id,status,created_at').eq('church_id', churchId).in('status', ['new_intake','prospect','cultivating','active']),
          sb.from('bst_followups').select('student_id,created_at').eq('church_id', churchId).order('created_at', { ascending: false }),
          sb.from('bst_sessions').select('student_id,scheduled_at').eq('church_id', churchId).order('scheduled_at', { ascending: false })
        ]).then(function(r){
          if (r[0].error) return 0;
          var students  = r[0].data || [];
          var followups = r[1].error ? [] : (r[1].data || []);
          var sessions  = r[2].error ? [] : (r[2].data || []);
          var now = Date.now();
          var fuMap = {}, sessMap = {};
          followups.forEach(function(f){ if (!fuMap[f.student_id]) fuMap[f.student_id] = f.created_at; });
          sessions.forEach(function(s){ if (!sessMap[s.student_id]) sessMap[s.student_id] = s.scheduled_at; });
          return students.filter(function(s){
            var daysFu   = Math.floor((now - new Date(fuMap[s.id]   || s.created_at).getTime()) / 86400000);
            var daysSess = Math.floor((now - new Date(sessMap[s.id] || s.created_at).getTime()) / 86400000);
            return daysFu >= 21 && daysSess >= 30;
          }).length;
        })
      );
    }

    Promise.all(tasksList).then(function(results){
      var i = 0;
      var newIntakes = results[i++], activeStudents = results[i++], activeTeachers = results[i++],
          overdue = results[i++], weekEvents = results[i++];
      var baptisms = showBaptisms ? results[i++] : null;
      var pending = showPending ? results[i++] : null;
      var atRisk = showInsights ? results[i++] : null;

      // Refresh tabbar with live badge counts now that we have the numbers
      var tasksBadge = overdue > 0 ? overdue : 0;
      var adminBadge = (showPending && pending > 0) ? pending : 0;
      tabbarSlot.innerHTML = window.TeamsCtx.bottomTabs('dashboard', { tasksBadge: tasksBadge, adminBadge: adminBadge });

      var userName = window.TeamsCtx.user && (window.TeamsCtx.user.user_metadata && window.TeamsCtx.user.user_metadata.full_name);
      var greeting = greetingText() + (userName ? ', ' + userName.split(' ')[0] : '') + '.';
      var html = '<p style="font-family:var(--font-serif);font-size:var(--t-lg);color:var(--ink-2);margin-bottom:var(--s-5)">' + greeting + '</p>';
      html += '<div class="teams-grid">';
      html += cardLink('/students/', newIntakes, 'New Intakes Awaiting Contact', 'Reach out within the follow-up window');
      html += cardLink('/students/', activeStudents, 'Active Prospects', 'Currently in ongoing study');
      html += cardLink('/admin/', activeTeachers, 'Active Teachers', 'Serving this church');
      html += cardLink('/tasks/', overdue, 'Overdue Follow-ups', 'Past their due date', overdue > 0 ? 'is-overdue' : '');
      html += cardLink('/schedule/', weekEvents, 'This-Week Events', 'Studies, cultivation & baptisms');
      if (showBaptisms) html += cardLink('/baptisms/', baptisms, 'Upcoming Baptisms', 'Planned or confirmed');
      if (showPending) html += cardLink('/admin/#pending', pending, 'Pending Approvals', pending > 0 ? 'Awaiting your review' : 'No requests waiting', pending > 0 ? 'is-pending' : '');
      if (showInsights) html += cardLink('/insights/', atRisk, 'At-Risk Prospects', atRisk > 0 ? 'No recent follow-up or session' : 'All prospects active', atRisk > 0 ? 'is-overdue' : '');
      html += '</div>';
      root.innerHTML = html;
    });
  }

  function maybeShowRegisterToast(){
    var raw = null;
    try { raw = (window.safeLS || localStorage).getItem('teams_new_church_toast'); } catch(e){}
    if (!raw) return;
    try { (window.safeLS || localStorage).removeItem('teams_new_church_toast'); } catch(e){}
    var rec = null;
    try { rec = JSON.parse(raw); } catch(e){}
    if (!rec || !rec.slug) return;
    var fullLink = 'https://churchteams.tech/join/?slug=' + encodeURIComponent(rec.slug);
    var toast = document.createElement('div');
    toast.className = 'teams-toast';
    toast.innerHTML = '✓ Church registered! Share invite: <strong>' + esc(rec.slug) + '</strong> <button type="button" class="teams-btn teams-btn-sm teams-btn-secondary" id="toastCopyBtn" style="margin-left:8px">Copy link</button>';
    document.body.appendChild(toast);
    requestAnimationFrame(function(){ toast.classList.add('show'); });
    var copyBtn = toast.querySelector('#toastCopyBtn');
    if (copyBtn) copyBtn.addEventListener('click', function(){
      if (navigator.clipboard) { navigator.clipboard.writeText(fullLink).then(function(){ copyBtn.textContent = '✓ Copied'; }).catch(function(){}); }
      else { copyBtn.textContent = fullLink; }
    });
    setTimeout(function(){ toast.classList.remove('show'); setTimeout(function(){ toast.remove(); }, 300); }, 10000);
  }

  window.TeamsCtx.ready.then(function(){
    if (window.TeamsCtx.isPending) { renderPending(); return; }
    if (window.TeamsCtx.hasTeamsAccess) { renderDashboard(); maybeShowRegisterToast(); return; }
    renderJoinFirst();
  });
})();
