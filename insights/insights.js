/* /insights/insights.js — Church Health dashboard (admin-only).
   Sections:
     1. Discipleship Funnel  — SVG bar chart of prospect counts per status stage
     2. At-Risk Prospects    — prospects meeting ≥2 stalling signals
     3. Activity Heatmap     — 13-week grid per active prospect (sessions + followups + notes)
   All queries are read-only, scoped to activeChurchId, and use existing tables only.
   No new DB columns or RPCs are required. */
(function(){
  var root = document.getElementById('insightsRoot');
  var actionsEl = document.getElementById('insightsActions');
  var tabbarSlot = document.getElementById('teamsTabbarSlot');
  function esc(s){ return (window.TeamsCtx && window.TeamsCtx.esc) ? window.TeamsCtx.esc(s) : String(s == null ? '' : s); }

  /* ── Constants ──────────────────────────────────────────────────────────── */
  var FUNNEL_STAGES = [
    { key: 'new_intake',   label: 'New Intake' },
    { key: 'prospect',     label: 'Prospect' },
    { key: 'cultivating',  label: 'Cultivating' },
    { key: 'active',       label: 'Active' },
    { key: 'baptized',     label: 'Baptized' }
  ];

  /* At-risk thresholds (days) */
  var THRESH_FOLLOWUP = 21;   /* no follow-up logged */
  var THRESH_SESSION  = 30;   /* no study session */
  var THRESH_STATUS   = 45;   /* status unchanged (proxy: created_at for new records) */

  /* Heatmap: last N weeks */
  var HEATMAP_WEEKS = 13;

  /* ── State ──────────────────────────────────────────────────────────────── */
  var state = {
    students:  [],   /* bst_students rows (active/prospect/cultivating/new_intake) */
    followups: [],   /* bst_followups rows for this church */
    sessions:  [],   /* bst_sessions rows for this church */
    notes:     []    /* bst_student_notes rows for this church */
  };

  /* ── Data loading ───────────────────────────────────────────────────────── */
  function load(){
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;

    /* We pull all non-dropped students so the funnel counts are accurate.
       Heatmap and at-risk only look at "working" statuses. */
    return Promise.all([
      sb.from('bst_students')
        .select('id,full_name,status,assigned_teacher_id,created_at')
        .eq('church_id', churchId)
        .neq('status', 'dropped')
        .order('full_name', { ascending: true }),

      sb.from('bst_followups')
        .select('id,student_id,created_at,status')
        .eq('church_id', churchId)
        .order('created_at', { ascending: false }),

      sb.from('bst_sessions')
        .select('id,student_id,scheduled_at,status')
        .eq('church_id', churchId)
        .order('scheduled_at', { ascending: false }),

      sb.from('bst_student_notes')
        .select('id,student_id,created_at')
        .eq('church_id', churchId)
        .order('created_at', { ascending: false })
    ]).then(function(results){
      state.students  = results[0].error ? [] : (results[0].data || []);
      state.followups = results[1].error ? [] : (results[1].data || []);
      state.sessions  = results[2].error ? [] : (results[2].data || []);
      state.notes     = results[3].error ? [] : (results[3].data || []);
      if (results[0].error) console.error('[Insights] students load error', results[0].error);
      if (results[1].error) console.error('[Insights] followups load error', results[1].error);
      if (results[2].error) console.error('[Insights] sessions load error', results[2].error);
      if (results[3].error) console.error('[Insights] notes load error', results[3].error);
    });
  }

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  function daysSince(isoDate){
    if (!isoDate) return Infinity;
    return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
  }

  function latestActivityDate(studentId){
    /* Returns Date or null for the most recent followup/session/note on this student. */
    var dates = [];
    state.followups.forEach(function(f){ if (f.student_id === studentId && f.created_at) dates.push(new Date(f.created_at)); });
    state.sessions.forEach(function(s){ if (s.student_id === studentId && s.scheduled_at) dates.push(new Date(s.scheduled_at)); });
    state.notes.forEach(function(n){ if (n.student_id === studentId && n.created_at) dates.push(new Date(n.created_at)); });
    if (!dates.length) return null;
    return new Date(Math.max.apply(null, dates));
  }

  /* Monday-anchored start of the ISO week containing date d. */
  function weekStart(d){
    var x = new Date(d);
    x.setHours(0,0,0,0);
    var day = x.getDay();
    x.setDate(x.getDate() - (day === 0 ? 6 : day - 1));
    return x;
  }

  /* ── Section 1: Discipleship Funnel ────────────────────────────────────── */
  function buildFunnel(){
    var counts = {};
    FUNNEL_STAGES.forEach(function(s){ counts[s.key] = 0; });
    state.students.forEach(function(s){
      if (counts[s.status] !== undefined) counts[s.status]++;
    });
    var max = FUNNEL_STAGES.reduce(function(m, s){ return Math.max(m, counts[s.key]); }, 1);

    var bars = FUNNEL_STAGES.map(function(stage, i){
      var count = counts[stage.key];
      var pct = Math.round((count / max) * 100);
      var barW = Math.max(pct, count > 0 ? 6 : 0);
      /* Conversion chip: show % that made it from previous stage */
      var prev = i > 0 ? counts[FUNNEL_STAGES[i-1].key] : null;
      var convChip = '';
      if (prev !== null && prev > 0){
        var rate = Math.round((count / prev) * 100);
        convChip = '<span class="ins-conv-chip">' + rate + '%</span>';
      }

      /* The bar lives inside a relative-positioned runway so the % width
         resolves correctly regardless of flex layout on the outer track. */
      return '<div class="ins-funnel-row">' +
        '<div class="ins-funnel-label">' + esc(stage.label) + convChip + '</div>' +
        '<div class="ins-funnel-track">' +
          '<div class="ins-funnel-runway">' +
            '<div class="ins-funnel-bar" style="width:' + barW + '%"></div>' +
          '</div>' +
          '<span class="ins-funnel-count">' + count + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<section class="teams-card ins-section" style="margin-bottom:var(--s-5)">' +
      '<h3 class="teams-card-label">Discipleship Funnel</h3>' +
      '<p class="teams-card-desc" style="margin-bottom:var(--s-4)">How many prospects are at each stage right now.</p>' +
      '<div class="ins-funnel">' + bars + '</div>' +
    '</section>';
  }

  /* ── Section 2: At-Risk Prospects ──────────────────────────────────────── */
  var WORKING_STATUSES = { new_intake:true, prospect:true, cultivating:true, active:true };

  function buildAtRisk(){
    var workingStudents = state.students.filter(function(s){ return WORKING_STATUSES[s.status]; });

    /* Build per-student latest dates. */
    var atRisk = [];
    workingStudents.forEach(function(s){
      var signals = 0;
      var reasons = [];

      /* Signal 1: no follow-up in THRESH_FOLLOWUP days */
      var lastFu = state.followups.filter(function(f){ return f.student_id === s.id; })[0];
      var daysFu = lastFu ? daysSince(lastFu.created_at) : daysSince(s.created_at);
      if (daysFu >= THRESH_FOLLOWUP){ signals++; reasons.push('No follow-up in ' + daysFu + ' days'); }

      /* Signal 2: no session in THRESH_SESSION days */
      var lastSess = state.sessions.filter(function(ss){ return ss.student_id === s.id; })[0];
      var daysSess = lastSess ? daysSince(lastSess.scheduled_at) : daysSince(s.created_at);
      if (daysSess >= THRESH_SESSION){ signals++; reasons.push('No session in ' + daysSess + ' days'); }

      /* Signal 3: record itself is stale (proxy for status unchanged) */
      var daysOld = daysSince(s.created_at);
      if (daysOld >= THRESH_STATUS && s.status === 'new_intake'){ signals++; reasons.push('Still "New Intake" for ' + daysOld + ' days'); }

      if (signals >= 2) atRisk.push({ student: s, signals: signals, reasons: reasons });
    });

    /* Sort most signals first, then by days since last any activity */
    atRisk.sort(function(a, b){
      if (b.signals !== a.signals) return b.signals - a.signals;
      var la = latestActivityDate(a.student.id);
      var lb = latestActivityDate(b.student.id);
      var ta = la ? la.getTime() : 0;
      var tb = lb ? lb.getTime() : 0;
      return ta - tb;
    });

    var body;
    if (!atRisk.length){
      body = '<div class="ins-all-clear">' +
        '<span class="ins-all-clear-glyph" aria-hidden="true">✓</span>' +
        '<span>All active prospects have recent activity.</span>' +
      '</div>';
    } else {
      body = atRisk.map(function(item){
        var s = item.student;
        var lastAct = latestActivityDate(s.id);
        var lastActStr = lastAct
          ? lastAct.toLocaleDateString(undefined, { month:'short', day:'numeric' })
          : 'Never';
        return '<a class="ins-risk-row" href="/student/?id=' + esc(s.id) + '">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
              '<strong style="font-size:var(--t-sm)">' + esc(s.full_name) + '</strong>' +
              '<span class="teams-chip is-neutral">' + esc(s.status.replace('_',' ')) + '</span>' +
              (item.signals >= 3 ? '<span class="teams-chip ins-chip-risk-high">High risk</span>' : '<span class="teams-chip ins-chip-risk-med">Needs attention</span>') +
            '</div>' +
            '<div class="teams-card-desc" style="margin-top:4px">' +
              esc(item.reasons.join(' · ')) +
            '</div>' +
            '<div class="teams-card-desc" style="margin-top:2px">Last activity: ' + esc(lastActStr) + '</div>' +
          '</div>' +
          '<span aria-hidden="true">›</span>' +
        '</a>';
      }).join('');
    }

    return '<section class="teams-card ins-section" style="margin-bottom:var(--s-5)">' +
      '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:var(--s-3);flex-wrap:wrap;margin-bottom:var(--s-2)">' +
        '<h3 class="teams-card-label" style="margin:0">At-Risk Prospects' + (atRisk.length ? ' <span class="teams-nav-badge">' + atRisk.length + '</span>' : '') + '</h3>' +
      '</div>' +
      '<p class="teams-card-desc" style="margin-bottom:var(--s-4)">Prospects with ' + THRESH_FOLLOWUP + '+ days without a follow-up, ' + THRESH_SESSION + '+ days without a session, or stalled in "New Intake".</p>' +
      body +
    '</section>';
  }

  /* ── Section 3: Activity Heatmap ────────────────────────────────────────── */
  function buildHeatmap(){
    var workingStudents = state.students.filter(function(s){ return WORKING_STATUSES[s.status]; });
    if (!workingStudents.length){
      return '<section class="teams-card ins-section">' +
        '<h3 class="teams-card-label">Activity Heatmap</h3>' +
        '<div class="teams-empty" style="padding:var(--s-8) 0"><span class="teams-empty-glyph" aria-hidden="true">◧</span><h2>No active prospects</h2><p>Add prospects to see their activity here.</p></div>' +
      '</section>';
    }

    /* Build week-bucket index: HEATMAP_WEEKS buckets, most-recent last. */
    var now = new Date();
    var refWeek = weekStart(now);
    /* buckets[0] = oldest week, buckets[HEATMAP_WEEKS-1] = current week */
    var bucketStarts = [];
    for (var w = HEATMAP_WEEKS - 1; w >= 0; w--){
      var bk = new Date(refWeek);
      bk.setDate(bk.getDate() - w * 7);
      bucketStarts.push(bk);
    }

    function bucketIndex(isoDate){
      if (!isoDate) return -1;
      var d = new Date(isoDate);
      var ws = weekStart(d).getTime();
      for (var i = bucketStarts.length - 1; i >= 0; i--){
        if (ws >= bucketStarts[i].getTime()) return i;
      }
      return -1;
    }

    /* Build month label row (show month name at first bucket of each month). */
    var monthLabels = bucketStarts.map(function(d, i){
      var isFirst = i === 0 || bucketStarts[i-1].getMonth() !== d.getMonth();
      return isFirst ? d.toLocaleDateString(undefined, { month:'short' }) : '';
    });

    /* Header row: month labels */
    var headerCells = monthLabels.map(function(lbl){
      return '<div class="ins-hm-month">' + esc(lbl) + '</div>';
    }).join('');

    /* Per-student rows */
    var rows = workingStudents.map(function(s){
      var buckets = new Array(HEATMAP_WEEKS).fill(0);

      state.followups.forEach(function(f){
        if (f.student_id !== s.id) return;
        var bi = bucketIndex(f.created_at);
        if (bi >= 0) buckets[bi]++;
      });
      state.sessions.forEach(function(ss){
        if (ss.student_id !== s.id) return;
        var bi = bucketIndex(ss.scheduled_at);
        if (bi >= 0) buckets[bi]++;
      });
      state.notes.forEach(function(n){
        if (n.student_id !== s.id) return;
        var bi = bucketIndex(n.created_at);
        if (bi >= 0) buckets[bi]++;
      });

      var cells = buckets.map(function(count, i){
        var level = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : 3;
        var weekLabel = bucketStarts[i].toLocaleDateString(undefined, { month:'short', day:'numeric' });
        var title = count > 0
          ? count + ' activit' + (count === 1 ? 'y' : 'ies') + ' — week of ' + weekLabel
          : 'No activity — week of ' + weekLabel;
        return '<div class="ins-hm-cell ins-hm-l' + level + '" title="' + esc(title) + '"></div>';
      }).join('');

      return '<div class="ins-hm-row">' +
        '<a class="ins-hm-name" href="/student/?id=' + esc(s.id) + '">' + esc(s.full_name) + '</a>' +
        '<div class="ins-hm-grid">' + cells + '</div>' +
      '</div>';
    }).join('');

    /* Legend */
    var legend =
      '<div class="ins-hm-legend">' +
        '<span class="teams-card-desc">Less</span>' +
        '<div class="ins-hm-cell ins-hm-l0"></div>' +
        '<div class="ins-hm-cell ins-hm-l1"></div>' +
        '<div class="ins-hm-cell ins-hm-l2"></div>' +
        '<div class="ins-hm-cell ins-hm-l3"></div>' +
        '<span class="teams-card-desc">More</span>' +
      '</div>';

    return '<section class="teams-card ins-section">' +
      '<h3 class="teams-card-label">Activity Heatmap</h3>' +
      '<p class="teams-card-desc" style="margin-bottom:var(--s-4)">Sessions, follow-ups, and notes logged per prospect over the last ' + HEATMAP_WEEKS + ' weeks.</p>' +
      '<div class="ins-hm-wrap">' +
        '<div class="ins-hm-header">' +
          '<div class="ins-hm-name-spacer"></div>' +
          '<div class="ins-hm-grid ins-hm-month-row">' + headerCells + '</div>' +
        '</div>' +
        rows +
        '<div class="ins-hm-footer">' + legend + '</div>' +
      '</div>' +
    '</section>';
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */
  function render(){
    tabbarSlot.innerHTML = window.TeamsCtx.bottomTabs('insights');
    root.innerHTML =
      buildFunnel() +
      buildAtRisk() +
      buildHeatmap();
  }

  /* ── Entry point ────────────────────────────────────────────────────────── */
  window.TeamsCtx.ready.then(function(){
    if (!window.TeamsCtx.requireAccess(root, { adminOnly: true })) return;
    /* No subbar actions needed for a read-only page. */
    if (actionsEl) actionsEl.innerHTML = '';
    load().then(render);
  });
})();
