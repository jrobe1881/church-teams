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

  function renderDashboard(){
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

    var showBaptisms = window.TeamsCtx.isChurchAdmin || window.TeamsCtx.isSiteAdmin;
    if (showBaptisms) {
      tasksList.push(
        sb.from('bst_baptisms').select('id', { count:'exact', head:true })
          .eq('church_id', churchId).gte('baptism_date', today).in('status', ['planned','confirmed'])
          .then(function(res){ return res.error ? 0 : (res.count || 0); })
      );
    }
    var showPending = window.TeamsCtx.isChurchAdmin;
    if (showPending) tasksList.push(window.TeamsCtx.pendingCount());

    Promise.all(tasksList).then(function(results){
      var i = 0;
      var newIntakes = results[i++], activeStudents = results[i++], activeTeachers = results[i++],
          overdue = results[i++], weekEvents = results[i++];
      var baptisms = showBaptisms ? results[i++] : null;
      var pending = showPending ? results[i++] : null;

      var html = '<div class="teams-grid">';
      html += cardLink('/teams/students/', newIntakes, 'New Intakes Awaiting Contact', 'Reach out within the follow-up window');
      html += cardLink('/teams/students/', activeStudents, 'Active Prospects', 'Currently in ongoing study');
      html += cardLink('/teams/admin/', activeTeachers, 'Active Teachers', 'Serving this church');
      html += cardLink('/teams/tasks/', overdue, 'Overdue Follow-ups', 'Past their due date', overdue > 0 ? 'is-overdue' : '');
      html += cardLink('/teams/schedule/', weekEvents, 'This-Week Events', 'Studies, cultivation & baptisms');
      if (showBaptisms) html += cardLink('/teams/baptisms/', baptisms, 'Upcoming Baptisms', 'Planned or confirmed');
      if (showPending) html += cardLink('/teams/admin/#pending', pending, 'Pending Approvals', pending > 0 ? 'Awaiting your review' : 'No requests waiting', pending > 0 ? 'is-pending' : '');
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
    var link = 'bibleparlor.com/teams/join/?slug=' + rec.slug;
    var toast = document.createElement('div');
    toast.className = 'teams-toast';
    toast.innerHTML = 'Church registered. Share your invite link: ' + link + ' <button type="button" class="teams-btn teams-btn-sm teams-btn-secondary" id="toastCopyBtn" style="margin-left:8px">Copy</button>';
    document.body.appendChild(toast);
    requestAnimationFrame(function(){ toast.classList.add('show'); });
    var copyBtn = toast.querySelector('#toastCopyBtn');
    if (copyBtn) copyBtn.addEventListener('click', function(){
      if (navigator.clipboard) navigator.clipboard.writeText('https://' + link).catch(function(){});
      copyBtn.textContent = 'Copied';
    });
    setTimeout(function(){ toast.classList.remove('show'); setTimeout(function(){ toast.remove(); }, 300); }, 8000);
  }

  window.TeamsCtx.ready.then(function(){
    if (window.TeamsCtx.isPending) { renderPending(); return; }
    if (window.TeamsCtx.hasTeamsAccess) { renderDashboard(); maybeShowRegisterToast(); return; }
    renderJoinFirst();
  });
})();
