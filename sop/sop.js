/* /teams/sop/sop.js — Standard operating procedures: list, search, category
   filter, step checklist, create/edit/delete (admin only), and a contextual
   "Use this SOP" link that deep-links back to a student profile.

   DB columns used: id, church_id, title, body, category (text, nullable).
   The `category` column is written on insert/update but never required for
   reads — rows without it still render under "General". */
(function(){
  var root      = document.getElementById('sopRoot');
  var actionsEl = document.getElementById('sopActions');
  var tabbarSlot = document.getElementById('teamsTabbarSlot');

  function esc(s){ return (window.TeamsCtx && window.TeamsCtx.esc) ? window.TeamsCtx.esc(s) : String(s == null ? '' : s); }

  /* -------- categories -------- */
  var CATEGORIES = [
    { key: 'all',        label: 'All' },
    { key: 'intake',     label: 'Intake' },
    { key: 'cultivation',label: 'Cultivation' },
    { key: 'follow_up',  label: 'Follow-up' },
    { key: 'baptism',    label: 'Baptism' },
    { key: 'general',    label: 'General' }
  ];

  /* Maps a prospect status to a suggested SOP category — shown on the student
     profile page when TeamsCtx exposes a `sopsByCategory` helper. */
  var STATUS_TO_CATEGORY = {
    new_intake:   'intake',
    prospect:     'intake',
    cultivating:  'cultivation',
    active:       'cultivation',
    paused:       'follow_up',
    baptized:     'baptism',
    dropped:      'follow_up'
  };

  /* ── Checklist state persistence (localStorage) ── */
  var LS_KEY = 'teams_sop_checks_v1';
  function loadCheckState(){
    try { return JSON.parse((window.safeLS || localStorage).getItem(LS_KEY) || '{}'); } catch(e){ return {}; }
  }
  function saveCheckState(cs){
    try { (window.safeLS || localStorage).setItem(LS_KEY, JSON.stringify(cs)); } catch(e){}
  }

  var state = {
    sops:        [],
    openId:      null,
    filter:      'all',   // category key
    search:      '',
    checkState:  loadCheckState()  // { [sopId]: { [stepIdx]: bool } } — persisted in localStorage
  };

  /* -------- helpers -------- */

  function categoryLabel(key){
    var c = CATEGORIES.filter(function(c){ return c.key === key; })[0];
    return c ? c.label : 'General';
  }

  /* Parse `body` for Markdown-style checklist items:
       - [ ] Step one
       - [x] Step two
     Returns an array of { text, checked } or null if no steps found. */
  function parseSteps(body){
    if (!body) return null;
    var lines = body.split('\n');
    var steps = [];
    lines.forEach(function(line){
      var m = line.match(/^[\s]*-\s*\[([ xX])\]\s*(.*)/);
      if (m) steps.push({ text: m[2].trim(), checked: m[1].toLowerCase() === 'x' });
    });
    return steps.length ? steps : null;
  }

  /* Render a checklist for an SOP that has steps. Step check state is stored
     in state.checkState[sopId] and persisted to localStorage. */
  function renderChecklist(sopId, steps){
    var cs = state.checkState[sopId] || {};
    var html = '<div class="sop-checklist" style="margin-top:10px">';
    steps.forEach(function(step, i){
      var checked = (i in cs) ? cs[i] : step.checked;
      html += '<label class="sop-step' + (checked ? ' is-done' : '') + '" data-sop-step="' + sopId + ':' + i + '" style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;cursor:pointer;border-bottom:1px solid var(--border);font-size:var(--t-sm)">' +
        '<input type="checkbox"' + (checked ? ' checked' : '') + ' style="margin-top:2px;flex:none" />' +
        '<span style="' + (checked ? 'text-decoration:line-through;color:var(--ink-3)' : '') + '">' + esc(step.text) + '</span>' +
      '</label>';
    });
    var total = steps.length;
    var done = steps.filter(function(s, i){ return (i in cs) ? cs[i] : s.checked; }).length;
    var allDone = done === total && total > 0;
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;gap:8px;flex-wrap:wrap">' +
      '<span style="font-size:var(--t-xs);color:' + (allDone ? 'var(--accent)' : 'var(--ink-3)') + '">' + (allDone ? '\u2713 All ' + total + ' steps completed' : done + ' of ' + total + ' steps completed') + '</span>' +
      (done > 0 ? '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-sop-reset="' + sopId + '" type="button" style="font-size:var(--t-xs);padding:4px 10px;min-height:28px">Reset</button>' : '') +
    '</div>';
    html += '</div>';
    return html;
  }

  /* Render the non-step body text (prose paragraphs that aren't checklist lines). */
  function renderProse(body){
    if (!body) return '';
    var lines = body.split('\n').filter(function(l){ return !l.match(/^[\s]*-\s*\[([ xX])\]/); });
    var prose = lines.join('\n').trim();
    if (!prose) return '';
    return '<div class="teams-card-desc" style="margin-top:8px;white-space:pre-wrap">' + esc(prose) + '</div>';
  }

  /* -------- filtering -------- */

  function filtered(){
    return state.sops.filter(function(s){
      var cat = s.category || 'general';
      if (state.filter !== 'all' && cat !== state.filter) return false;
      if (state.search) {
        var q = state.search.toLowerCase();
        if ((s.title || '').toLowerCase().indexOf(q) === -1 &&
            (s.body  || '').toLowerCase().indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  /* -------- actions bar -------- */

  function renderActions(){
    var isAdmin = window.TeamsCtx.isChurchAdmin || window.TeamsCtx.isSiteAdmin;
    actionsEl.innerHTML = (isAdmin ? '<button class="teams-btn teams-btn-sm" id="newSopBtn" type="button">+ New SOP</button>' : '');
    if (isAdmin) document.getElementById('newSopBtn').addEventListener('click', function(){ openComposer(); });
  }

  /* -------- load -------- */

  function load(){
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;
    return sb.from('bst_sops').select('*').eq('church_id', churchId).order('title', { ascending: true }).then(function(res){
      state.sops = res.error ? [] : (res.data || []);
      if (res.error) console.error('[Teams sop] load error', res.error);
    });
  }

  /* -------- render -------- */

  function sopRow(s){
    var open  = state.openId === s.id;
    var steps = open ? parseSteps(s.body) : null;
    var cat   = s.category || 'general';
    var isAdmin = window.TeamsCtx.isChurchAdmin || window.TeamsCtx.isSiteAdmin;

    var adminActions = isAdmin && open
      ? '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
          '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-sop-edit="' + esc(s.id) + '" type="button">Edit</button>' +
          '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-sop-del="' + esc(s.id) + '" type="button" style="color:#7a1f2b;border-color:#e5c7cb">Delete</button>' +
          '<button class="teams-btn teams-btn-sm teams-btn-secondary" data-sop-copy="' + esc(s.id) + '" type="button">Copy text</button>' +
        '</div>'
      : '';

    /* Deep-link: if the user arrived from a student profile (?from=studentId),
       offer a "Back to prospect" chip so they can return immediately. */
    var fromId = (function(){ try { return new URLSearchParams(location.search).get('from'); } catch(e){ return null; } })();
    var backLink = fromId && open
      ? '<div style="margin-top:10px"><a class="teams-btn teams-btn-sm teams-btn-secondary" href="/student/?id=' + esc(fromId) + '">\u2039 Back to prospect</a></div>'
      : '';

    return '<div class="teams-card" style="margin-bottom:var(--s-3)">' +
      '<div data-sop-id="' + esc(s.id) + '" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;gap:var(--s-2)">' +
        '<div>' +
          '<strong>' + esc(s.title || 'Untitled SOP') + '</strong>' +
          '<span class="teams-chip is-neutral" style="margin-left:8px">' + esc(categoryLabel(cat)) + '</span>' +
        '</div>' +
        '<span aria-hidden="true">' + (open ? '\u2304' : '\u203a') + '</span>' +
      '</div>' +
      (open
        ? (steps ? renderChecklist(s.id, steps) : '') +
          renderProse(s.body) +
          adminActions +
          backLink
        : '') +
    '</div>';
  }

  function render(){
    tabbarSlot.innerHTML = window.TeamsCtx.bottomTabs('sop');

    /* Category filter chips + search bar */
    var chipRow = '<div style="display:flex;gap:var(--s-2);flex-wrap:wrap;margin-bottom:var(--s-3);align-items:center">' +
      CATEGORIES.map(function(c){
        return '<button class="teams-chip' + (state.filter === c.key ? ' is-selected' : '') + '" data-cat="' + c.key + '" type="button">' + esc(c.label) + '</button>';
      }).join('') +
    '</div>' +
    '<div style="margin-bottom:var(--s-4)">' +
      '<input type="search" id="sopSearch" placeholder="Search SOPs\u2026" value="' + esc(state.search) + '" style="width:100%" />' +
    '</div>';

    var rows = filtered();
    var body = rows.length
      ? rows.map(sopRow).join('')
      : '<div class="teams-empty"><span class="teams-empty-glyph" aria-hidden="true">\u25F7</span><h2>No SOPs' +
          (state.filter !== 'all' || state.search ? ' match' : ' yet') + '</h2>' +
          '<p>Standard operating procedures for cultivation, intake, and follow-up will appear here.</p>' +
        '</div>';

    root.innerHTML = chipRow + body;

    /* Wire category chips */
    Array.prototype.forEach.call(root.querySelectorAll('[data-cat]'), function(btn){
      btn.addEventListener('click', function(){
        state.filter = btn.getAttribute('data-cat');
        render();
      });
    });

    /* Wire search */
    var searchEl = document.getElementById('sopSearch');
    if (searchEl) searchEl.addEventListener('input', function(e){ state.search = e.target.value; render(); });

    /* Wire expand/collapse */
    Array.prototype.forEach.call(root.querySelectorAll('[data-sop-id]'), function(row){
      row.addEventListener('click', function(){
        var id = row.getAttribute('data-sop-id');
        state.openId = state.openId === id ? null : id;
        render();
      });
    });

    /* Wire checklist checkboxes */
    Array.prototype.forEach.call(root.querySelectorAll('[data-sop-step]'), function(label){
      label.addEventListener('click', function(e){
        e.stopPropagation();
        var parts = label.getAttribute('data-sop-step').split(':');
        var sopId = parts[0];
        var idx   = parseInt(parts[1], 10);
        var cb    = label.querySelector('input[type="checkbox"]');
        if (!state.checkState[sopId]) state.checkState[sopId] = {};
        /* Toggle based on the checkbox value AFTER the native click flips it */
        state.checkState[sopId][idx] = cb ? cb.checked : !state.checkState[sopId][idx];
        saveCheckState(state.checkState);
        render();
      });
    });

    /* Wire checklist reset buttons */
    Array.prototype.forEach.call(root.querySelectorAll('[data-sop-reset]'), function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var sopId = btn.getAttribute('data-sop-reset');
        delete state.checkState[sopId];
        saveCheckState(state.checkState);
        render();
      });
    });

    /* Wire admin edit/delete/copy */
    Array.prototype.forEach.call(root.querySelectorAll('[data-sop-edit]'), function(btn){
      btn.addEventListener('click', function(e){ e.stopPropagation(); var id = btn.getAttribute('data-sop-edit'); var s = state.sops.filter(function(x){ return x.id === id; })[0]; if (s) openComposer(s); });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-sop-del]'), function(btn){
      btn.addEventListener('click', function(e){ e.stopPropagation(); var id = btn.getAttribute('data-sop-del'); var s = state.sops.filter(function(x){ return x.id === id; })[0]; if (s) confirmDelete(s); });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-sop-copy]'), function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var id = btn.getAttribute('data-sop-copy');
        var s = state.sops.filter(function(x){ return x.id === id; })[0];
        if (!s) return;
        var text = (s.title || '') + '\n\n' + (s.body || '');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(function(){
            btn.textContent = 'Copied!';
            setTimeout(function(){ btn.textContent = 'Copy text'; }, 2000);
          }).catch(function(){});
        }
      });
    });
  }

  /* -------- overlay helper -------- */

  function overlay(innerHtml){
    var ov = document.createElement('div');
    ov.className = 'teams-overlay open';
    ov.innerHTML = '<div class="teams-sheet">' + innerHtml + '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if (e.target === ov) ov.remove(); });
    return ov;
  }

  /* -------- create / edit composer -------- */

  function openComposer(existing){
    var sb = window.TeamsCtx.sb;
    var churchId = window.TeamsCtx.activeChurchId;
    var isEdit = !!existing;
    var catOptions = CATEGORIES.filter(function(c){ return c.key !== 'all'; }).map(function(c){
      var sel = existing && (existing.category || 'general') === c.key ? ' selected' : (!existing && c.key === 'general' ? ' selected' : '');
      return '<option value="' + c.key + '"' + sel + '>' + esc(c.label) + '</option>';
    }).join('');

    var ov = overlay(
      '<button class="teams-sheet-close" type="button" aria-label="Close">\u2715</button>' +
      '<h2>' + (isEdit ? 'Edit SOP' : 'New SOP') + '</h2>' +
      '<div class="teams-field"><label for="sopTitle">Title</label><input id="sopTitle" type="text" value="' + esc(isEdit ? existing.title : '') + '" /></div>' +
      '<div class="teams-field"><label for="sopCategory">Category</label>' +
        '<select id="sopCategory">' + catOptions + '</select>' +
        '<div class="teams-hint">Helps teachers find the right procedure quickly.</div>' +
      '</div>' +
      '<div class="teams-field"><label for="sopBody">Body</label>' +
        '<textarea id="sopBody" rows="10" placeholder="Describe the procedure\u2026\n\nTip: add checklist steps like:\n- [ ] Call the prospect\n- [ ] Schedule a study">' + esc(isEdit ? (existing.body || '') : '') + '</textarea>' +
        '<div class="teams-hint">Use <code>- [ ] Step text</code> lines to create interactive checklist steps.</div>' +
      '</div>' +
      '<div id="sopErr"></div>' +
      '<button class="teams-btn teams-btn-block" id="sopSaveBtn" type="button">' + (isEdit ? 'Save changes' : 'Save SOP') + '</button>'
    );
    ov.querySelector('.teams-sheet-close').addEventListener('click', function(){ ov.remove(); });

    ov.querySelector('#sopSaveBtn').addEventListener('click', function(){
      var btn    = ov.querySelector('#sopSaveBtn');
      var errEl  = ov.querySelector('#sopErr');
      var title  = ov.querySelector('#sopTitle').value.trim();
      var body   = ov.querySelector('#sopBody').value.trim();
      var cat    = ov.querySelector('#sopCategory').value;
      if (!title) { errEl.innerHTML = '<div class="teams-error">Title is required.</div>'; return; }
      btn.disabled = true; btn.textContent = 'Saving\u2026';

      var payload = { church_id: churchId, title: title, body: body || null, category: cat };
      var p = isEdit
        ? sb.from('bst_sops').update({ title: title, body: body || null, category: cat }).eq('id', existing.id)
        : sb.from('bst_sops').insert(payload);

      p.then(function(res){
        btn.disabled = false; btn.textContent = isEdit ? 'Save changes' : 'Save SOP';
        if (res.error){
          errEl.innerHTML = '<div class="teams-error">Could not save: ' + esc(res.error.message || 'permission denied') + '</div>';
          return;
        }
        ov.remove();
        state.openId = null;
        load().then(render);
      });
    });
  }

  /* -------- delete -------- */

  function confirmDelete(s){
    var sb = window.TeamsCtx.sb;
    var ov = overlay(
      '<button class="teams-sheet-close" type="button" aria-label="Close">\u2715</button>' +
      '<h2>Delete SOP?</h2>' +
      '<p class="teams-sub">Delete <strong>' + esc(s.title) + '</strong>? This cannot be undone.</p>' +
      '<div id="delErr"></div>' +
      '<div style="display:flex;gap:var(--s-3)">' +
        '<button class="teams-btn teams-btn-block teams-btn-danger" id="delConfirmBtn" type="button">Delete</button>' +
        '<button class="teams-btn teams-btn-block teams-btn-secondary" id="delCancelBtn" type="button">Cancel</button>' +
      '</div>'
    );
    ov.querySelector('.teams-sheet-close').addEventListener('click', function(){ ov.remove(); });
    ov.querySelector('#delCancelBtn').addEventListener('click', function(){ ov.remove(); });
    ov.querySelector('#delConfirmBtn').addEventListener('click', function(){
      var btn = ov.querySelector('#delConfirmBtn');
      var errEl = ov.querySelector('#delErr');
      btn.disabled = true; btn.textContent = 'Deleting\u2026';
      sb.from('bst_sops').delete().eq('id', s.id).then(function(res){
        btn.disabled = false; btn.textContent = 'Delete';
        if (res.error){
          errEl.innerHTML = '<div class="teams-error">Could not delete: ' + esc(res.error.message || 'permission denied') + '</div>';
          return;
        }
        ov.remove();
        state.openId = null;
        load().then(render);
      });
    });
  }

  /* -------- public helper: expose category suggestions for other pages -------- */
  /* Called by student.js (after this script loads) to get SOPs relevant to a
     given prospect status. Returns an array of { id, title, category }. */
  window.TeamsSOP = {
    forStatus: function(status){
      var cat = STATUS_TO_CATEGORY[status] || 'general';
      return state.sops.filter(function(s){ return (s.category || 'general') === cat || (s.category || 'general') === 'general'; });
    },
    categoryLabel: categoryLabel
  };

  /* -------- bootstrap -------- */

  window.TeamsCtx.ready.then(function(){
    if (!window.TeamsCtx.requireAccess(root)) return;
    renderActions();
    load().then(render);
  });
})();
