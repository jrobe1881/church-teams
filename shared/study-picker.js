/* study-picker.js
   Site-wide "Add to study" modal and active-study selector.
   Works on any tool page that loads journey-studies.js before this file.

   Public API on window.StudyPicker:
     open(evt, opts)   — open the picker to add a timeline event to a study
                          evt: { title, kind, ref, canonical, source, meta }
                          opts: { onAdd(studyId) }
     openSelector()    — open just to change the active study (no item to add)
     getActive()       — shortcut → JourneyStudies.getActive()
     setActive(id)     — shortcut → JourneyStudies.setActive(id)

   The modal injects its own styles via a <style> tag (tokens.css variables).
*/
(function () {
  'use strict';
  if (window.StudyPicker) return;

  /* ---- Helpers ---- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  /* ---- Styles (dark/light via CSS variables) ---- */
  var CSS = [
    /* backdrop */
    '.sp-backdrop{position:fixed;inset:0;z-index:10100;background:rgba(0,0,0,.45);',
    'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);',
    'display:flex;align-items:center;justify-content:center;padding:16px;',
    'opacity:0;transition:opacity .18s;}',
    '.sp-backdrop.sp-open{opacity:1;}',

    /* dialog card */
    '.sp-card{position:relative;width:100%;max-width:520px;max-height:88dvh;',
    'background:var(--surface,#fff);color:var(--ink,#1a1a1a);',
    'border:1px solid var(--border,#e5e5e5);border-radius:16px;',
    'box-shadow:0 24px 72px rgba(0,0,0,.22);overflow:hidden;',
    'display:flex;flex-direction:column;',
    'transform:translateY(10px) scale(.98);transition:transform .18s,opacity .18s;opacity:0;}',
    '.sp-backdrop.sp-open .sp-card{transform:none;opacity:1;}',

    /* header */
    '.sp-head{padding:18px 20px 14px;border-bottom:1px solid var(--border,#e5e5e5);flex:0 0 auto;',
    'background:linear-gradient(180deg,rgba(122,31,43,.06),transparent);',
    'display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}',
    '.sp-head-inner{display:flex;flex-direction:column;gap:3px;min-width:0;}',
    '.sp-head-title{font:500 18px/1.2 var(--font-serif,"EB Garamond",Georgia,serif);',
    'color:var(--ink,#1a1a1a);}',
    '.sp-head-sub{font:400 12px/1 var(--font-sans,"Inter",system-ui);',
    'color:var(--ink-3,#7a7a7a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:36ch;}',
    '.sp-close{width:28px;height:28px;flex:0 0 auto;display:grid;place-items:center;',
    'background:transparent;border:0;color:var(--ink-3,#7a7a7a);border-radius:6px;',
    'cursor:pointer;font-size:13px;transition:background .12s,color .12s;}',
    '.sp-close:hover{background:var(--surface-2,#f7f6f4);color:var(--ink,#1a1a1a);}',

    /* context chip (item being added) */
    '.sp-context{padding:10px 20px 0;flex:0 0 auto;}',
    '.sp-context-chip{display:inline-flex;align-items:center;gap:6px;',
    'padding:5px 10px;background:var(--accent-tint,rgba(122,31,43,.08));',
    'border:1px solid rgba(122,31,43,.18);border-radius:999px;',
    'font:600 11px/1 var(--font-sans,"Inter",system-ui);',
    'color:var(--accent,#7a1f2b);max-width:100%;overflow:hidden;}',
    '.sp-context-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',

    /* body */
    '.sp-body{flex:1 1 auto;overflow-y:auto;padding:14px 20px 4px;}',
    '.sp-body::-webkit-scrollbar{width:4px;}',
    '.sp-body::-webkit-scrollbar-thumb{background:var(--border,#e5e5e5);border-radius:2px;}',

    /* section label */
    '.sp-section-label{font:600 10px/1 var(--font-sans,"Inter",system-ui);',
    'letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3,#7a7a7a);',
    'margin:0 0 8px;padding:0 2px;}',

    /* studies list */
    '.sp-list{display:flex;flex-direction:column;gap:6px;margin-bottom:14px;}',

    /* study row */
    '.sp-study-row{display:flex;align-items:center;gap:10px;padding:10px 12px;',
    'border:1px solid var(--border,#e5e5e5);border-radius:10px;',
    'background:var(--surface-2,#f7f6f4);cursor:pointer;',
    'transition:border-color .13s,background .13s,transform .13s;',
    'font:inherit;color:inherit;width:100%;text-align:left;}',
    '.sp-study-row:hover{border-color:var(--accent,#7a1f2b);',
    'background:rgba(122,31,43,.07);transform:translateY(-1px);}',
    '.sp-study-row.sp-active{border-color:var(--accent,#7a1f2b);',
    'background:rgba(122,31,43,.08);}',
    '.sp-study-row.sp-active::after{content:"Active";flex:0 0 auto;',
    'font:600 10px/1 var(--font-sans,"Inter",system-ui);',
    'letter-spacing:.06em;text-transform:uppercase;',
    'color:var(--accent,#7a1f2b);background:rgba(122,31,43,.10);',
    'padding:3px 7px;border-radius:999px;border:1px solid rgba(122,31,43,.2);}',
    '.sp-swatch{width:8px;height:28px;border-radius:3px;flex:0 0 auto;',
    'background:var(--accent,#7a1f2b);}',
    '.sp-study-body{flex:1 1 auto;min-width:0;}',
    '.sp-study-title{font:600 13px/1.3 var(--font-sans,"Inter",system-ui);',
    'color:var(--ink,#1a1a1a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.sp-study-meta{font:400 11px/1 var(--font-sans,"Inter",system-ui);',
    'color:var(--ink-3,#7a7a7a);margin-top:2px;}',
    '.sp-add-icon{font:600 16px/1 var(--font-sans,"Inter",system-ui);',
    'color:var(--ink-3,#7a7a7a);flex:0 0 auto;transition:color .13s;}',
    '.sp-study-row:hover .sp-add-icon{color:var(--accent,#7a1f2b);}',

    /* new study inline form */
    '.sp-new-row{display:flex;align-items:center;gap:8px;margin-bottom:16px;}',
    '.sp-new-input{flex:1 1 auto;min-width:0;padding:9px 12px;',
    'border:1px solid var(--border,#e5e5e5);border-radius:8px;',
    'font:400 13px/1 var(--font-sans,"Inter",system-ui);',
    'color:var(--ink,#1a1a1a);background:var(--surface,#fff);',
    'transition:border-color .13s,box-shadow .13s;}',
    '.sp-new-input:focus{outline:none;border-color:var(--accent,#7a1f2b);',
    'box-shadow:0 0 0 3px rgba(122,31,43,.14);}',
    '.sp-new-btn{padding:9px 14px;border:0;border-radius:8px;',
    'background:var(--accent,#7a1f2b);color:#fff;',
    'font:600 12px/1 var(--font-sans,"Inter",system-ui);',
    'cursor:pointer;flex:0 0 auto;white-space:nowrap;transition:background .13s;}',
    '.sp-new-btn:hover{background:#661820;}',
    '.sp-new-btn:disabled{opacity:.5;cursor:default;}',

    /* selector-mode footer (active study) */
    '.sp-footer{padding:12px 20px 16px;border-top:1px solid var(--border,#e5e5e5);',
    'flex:0 0 auto;background:var(--surface-2,#f7f6f4);}',
    '.sp-footer-hint{font:400 11px/1.4 var(--font-sans,"Inter",system-ui);',
    'color:var(--ink-3,#7a7a7a);}',

    /* empty state */
    '.sp-empty{padding:32px 20px;text-align:center;',
    'color:var(--ink-3,#7a7a7a);font:400 13px/1.55 var(--font-sans,"Inter",system-ui);',
    'border:1px dashed var(--border,#e5e5e5);border-radius:10px;margin-bottom:12px;}',
    '.sp-empty-title{font:500 15px/1.3 var(--font-serif,"EB Garamond",Georgia,serif);',
    'color:var(--ink,#1a1a1a);margin:0 0 4px;}',

    /* toast */
    '.sp-toast{position:fixed;left:50%;bottom:24px;',
    'transform:translateX(-50%) translateY(12px);',
    'background:var(--ink,#1a1a1a);color:var(--surface,#fff);',
    'padding:9px 18px;border-radius:999px;',
    'font:600 13px/1 var(--font-sans,"Inter",system-ui);',
    'box-shadow:0 8px 24px rgba(0,0,0,.2);z-index:10200;',
    'opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;}',
    '.sp-toast.sp-show{opacity:1;transform:translateX(-50%) translateY(0);}',

    '@media(prefers-reduced-motion:reduce){',
    '.sp-backdrop,.sp-card,.sp-study-row{transition:none;}}',
  ].join('');

  /* inject styles once */
  if (!document.getElementById('sp-styles')) {
    var styleEl = document.createElement('style');
    styleEl.id = 'sp-styles';
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  /* ---- Toast ---- */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'sp-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('sp-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('sp-show'); }, 2400);
  }

  /* ---- Modal state ---- */
  var backdrop = null;
  var _pendingEvt = null;
  var _pendingOpts = null;
  var _selectorMode = false;  // true = just picking active study, not adding an item

  function getJS() { return window.JourneyStudies; }
  function fmtCount(n) { return n + ' item' + (n === 1 ? '' : 's'); }
  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var now = new Date();
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()) return 'Today';
    var yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (d.getFullYear() === yest.getFullYear() && d.getMonth() === yest.getMonth() &&
        d.getDate() === yest.getDate()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* ---- Build & open ---- */
  function open(evt, opts) {
    _pendingEvt  = evt  || null;
    _pendingOpts = opts || {};
    _selectorMode = false;
    _render();
  }
  function openSelector() {
    _pendingEvt  = null;
    _pendingOpts = {};
    _selectorMode = true;
    _render();
  }

  function _render() {
    if (backdrop) { backdrop.remove(); backdrop = null; }

    var JS = getJS();
    var studies = JS ? JS.list() : [];
    var active  = JS ? JS.getActive() : null;
    var evt     = _pendingEvt;

    backdrop = el('div', 'sp-backdrop');
    var card  = el('div', 'sp-card');

    /* --- Header --- */
    var head = el('div', 'sp-head');
    var inner = el('div', 'sp-head-inner');
    var titleText = _selectorMode
      ? 'Active study'
      : 'Add to study';
    var subText = _selectorMode
      ? 'Items from all tools will be added to this study'
      : (studies.length ? 'Choose a study or create a new one' : 'Create a study to get started');
    inner.appendChild(el('div', 'sp-head-title', esc(titleText)));
    inner.appendChild(el('div', 'sp-head-sub', esc(subText)));
    var closeBtn = el('button', 'sp-close', '&#x2715;');
    closeBtn.setAttribute('aria-label', 'Close');
    head.appendChild(inner);
    head.appendChild(closeBtn);
    card.appendChild(head);

    /* --- Context chip (item being added) --- */
    if (!_selectorMode && evt && evt.title) {
      var ctx = el('div', 'sp-context');
      var chip = el('div', 'sp-context-chip');
      var src = evt.source ? '<span style="opacity:.65">'+esc(evt.source)+' · </span>' : '';
      chip.innerHTML = src + '<span class="sp-context-label">'+esc(evt.title)+'</span>';
      ctx.appendChild(chip);
      card.appendChild(ctx);
    }

    /* --- Body --- */
    var body = el('div', 'sp-body');

    /* New study row */
    var secNew = el('div', 'sp-section-label', 'New study');
    body.appendChild(secNew);
    var newRow = el('div', 'sp-new-row');
    var newInput = el('input', 'sp-new-input');
    newInput.type = 'text';
    newInput.placeholder = 'Study title…';
    newInput.maxLength = 200;
    var newBtn = el('button', 'sp-new-btn', '+ Create');
    newBtn.type = 'button';
    newBtn.disabled = true;
    newInput.addEventListener('input', function () {
      newBtn.disabled = !newInput.value.trim();
    });
    newInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && newInput.value.trim()) { e.preventDefault(); createAndAct(); }
    });
    newBtn.addEventListener('click', createAndAct);
    function createAndAct() {
      var title = newInput.value.trim();
      if (!title) return;
      var s = JS.create({ title: title });
      if (!s) { toast('Could not create study'); return; }
      if (!_selectorMode) {
        _addItem(s.id);
      } else {
        JS.setActive(s.id);
        toast('Active study: ' + s.title);
        _close();
      }
    }
    newRow.appendChild(newInput);
    newRow.appendChild(newBtn);
    body.appendChild(newRow);

    /* Existing studies */
    if (studies.length) {
      var secLabel = el('div', 'sp-section-label', 'Your studies');
      body.appendChild(secLabel);
      var list = el('div', 'sp-list');
      studies.forEach(function (s) {
        var isActive = active && active.id === s.id;
        var row = el('button', 'sp-study-row' + (isActive ? ' sp-active' : ''));
        row.type = 'button';
        row.setAttribute('aria-label', (_selectorMode ? 'Set active: ' : 'Add to: ') + s.title);

        var swatch = el('div', 'sp-swatch');
        var sbody  = el('div', 'sp-study-body');
        var stitle = el('div', 'sp-study-title', esc(s.title));
        var n = (s.items && s.items.length) || 0;
        var smeta  = el('div', 'sp-study-meta',
          esc(fmtCount(n)) + (s.updated ? ' · ' + esc(fmtDate(s.updated)) : ''));
        sbody.appendChild(stitle);
        sbody.appendChild(smeta);

        var icon = el('span', 'sp-add-icon', _selectorMode ? '◉' : '+');

        row.appendChild(swatch);
        row.appendChild(sbody);
        row.appendChild(icon);

        row.addEventListener('click', function () {
          if (_selectorMode) {
            JS.setActive(s.id);
            toast('Active study: ' + s.title);
            _close();
          } else {
            _addItem(s.id);
          }
        });
        list.appendChild(row);
      });
      body.appendChild(list);
    } else if (!_selectorMode) {
      var emptyDiv = el('div', 'sp-empty');
      emptyDiv.innerHTML = '<div class="sp-empty-title">No studies yet</div>Create your first study above to start organizing.';
      body.appendChild(emptyDiv);
    }

    card.appendChild(body);

    /* Selector-mode footer */
    if (_selectorMode && active) {
      var foot = el('div', 'sp-footer');
      foot.innerHTML = '<div class="sp-footer-hint">Items added from any tool will go into the active study. You can change this at any time.</div>';
      card.appendChild(foot);
    }

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    /* Animate in */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        backdrop.classList.add('sp-open');
        newInput.focus();
      });
    });

    /* Close on backdrop click */
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) _close();
    });
    closeBtn.addEventListener('click', _close);
    document.addEventListener('keydown', _escHandler);
  }

  function _escHandler(e) {
    if (e.key === 'Escape') _close();
  }

  function _close() {
    document.removeEventListener('keydown', _escHandler);
    if (!backdrop) return;
    backdrop.classList.remove('sp-open');
    var b = backdrop;
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 200);
    backdrop = null;
    _pendingEvt = null;
    _pendingOpts = null;
  }

  function _addItem(studyId) {
    var JS = getJS();
    var evt = _pendingEvt;
    var opts = _pendingOpts || {};
    if (!JS || !evt) { _close(); return; }
    var kindMap = {
      chat: 'chat', note: 'note', reader_open: 'verse', tray_add: 'tray',
      wordstudy: 'wordstudy', strongs: 'strongs', reading_plan: 'reading_plan',
      sermon_edit: 'sermon', passage_guide: 'passage_guide', saved_topic: 'link'
    };
    var item = JS.addItem(studyId, {
      kind: kindMap[evt.kind] || 'link',
      ref: evt.ref || null,
      canonical: evt.canonical || null,
      label: evt.title,
      source: evt.source || null,
      extra: evt.meta || null
    });
    if (item) {
      var study = JS.get(studyId);
      toast('Added to "' + (study ? study.title : 'study') + '"');
      if (opts.onAdd) opts.onAdd(studyId);
    } else {
      toast('Already in that study');
    }
    _close();
  }

  /* ---- Public API ---- */
  window.StudyPicker = {
    open: open,
    openSelector: openSelector,
    getActive: function () { return getJS() ? getJS().getActive() : null; },
    setActive: function (id) { if (getJS()) getJS().setActive(id); }
  };
})();
