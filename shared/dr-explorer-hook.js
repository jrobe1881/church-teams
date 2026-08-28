/*
  dr-explorer-hook.js — Adds Deep Research mode to the Explorer AI page.

  Behavior:
    - Mounts the DR pill inside #dr-toggle-host.
    - Shows/hides #dr-hint according to state.
    - When DR is ON and the user clicks Ask AI (or presses Enter in #qbox),
      intercept the default handler and instead call /api/dr-ask, rendering
      the answer + inline citations + source cards into #qanswer.
    - When DR is OFF, the original explorer-qa.js flow runs unchanged.

  Depends on: /shared/dr-mode.js (loaded before this file).
*/
(function () {
  const $ = (s) => document.querySelector(s);

  // --- Persistence -------------------------------------------------------
  // DR turns are stored via the shared ChatHistory sessions store. Falls
  // back to a local array if ChatHistory is unavailable.
  const DR_MAX_TURNS = 8;
  let _drConvo = [];

  function loadDrConvo() {
    if (window.ChatHistory) {
      const s = window.ChatHistory.getCurrent('dr');
      _drConvo = s ? (s.turns || []).slice(-DR_MAX_TURNS) : [];
    } else {
      _drConvo = [];
    }
  }
  function persistTurn(turn) {
    if (window.ChatHistory) {
      window.ChatHistory.saveTurn('dr', turn);
      const s = window.ChatHistory.getCurrent('dr');
      _drConvo = s ? (s.turns || []).slice(-DR_MAX_TURNS) : [];
    } else {
      _drConvo.push(turn);
      if (_drConvo.length > DR_MAX_TURNS) _drConvo = _drConvo.slice(-DR_MAX_TURNS);
    }
  }
  function clearDrConvo() {
    _drConvo = [];
    if (window.ChatHistory) window.ChatHistory.startNew('dr');
  }
  loadDrConvo();

  // React to session switches from the history drawer or URL deep-link.
  // bp:chat-history-open is used to keep _drConvo in sync (clear it for non-DR sessions).
  window.addEventListener('bp:chat-history-open', (e) => {
    const s = e && e.detail && e.detail.session;
    if (!s) return;
    if (s.mode !== 'dr') { _drConvo = []; }
    // Actual rendering for DR sessions is handled by bp:dr-recall below,
    // which fires after the toggle is guaranteed to be ON.
  });

  // Dedicated DR recall event — fired by chat-history-ui after DR toggle is
  // already set to ON. We unconditionally load the session's turns and render.
  window.addEventListener('bp:dr-recall', (e) => {
    const s = e && e.detail && e.detail.session;
    if (!s || s.mode !== 'dr') return;
    _drConvo = (s.turns || []).slice(-DR_MAX_TURNS);
    renderDrConvo();
  });

  function mountPill() {
    const host = $('#dr-toggle-host');
    if (!host || host.dataset.drMounted) return;
    if (!window.DR || !DR.pill) { setTimeout(mountPill, 50); return; }
    host.dataset.drMounted = '1';
    // Wrap so the pill + segmented control sit inline together.
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap';
    host.appendChild(wrap);
    DR.pill(wrap);
    if (DR.answerModeControl) {
      const modeHost = document.createElement('span');
      modeHost.id = 'dr-answer-mode-host';
      modeHost.style.display = DR.isOn() ? 'inline-flex' : 'none';
      wrap.appendChild(modeHost);
      DR.answerModeControl(modeHost);
    }
  }

  function toggleHint() {
    const hint = $('#dr-hint');
    if (hint && window.DR) hint.hidden = !DR.isOn();
    const modeHost = document.getElementById('dr-answer-mode-host');
    if (modeHost && window.DR) modeHost.style.display = DR.isOn() ? 'inline-flex' : 'none';
  }

  // Sanitize snippet HTML from ts_headline: allow only <b>/</b>, escape
  // everything else.
  function safeSnippet(s) {
    if (!s) return '';
    // First escape, then re-enable <b>/</b> tags
    let html = escapeHtml(s)
      .replace(/&lt;b&gt;/g, '<b>')
      .replace(/&lt;\/b&gt;/g, '</b>');
    // Clean OCR artifacts while preserving <b>...</b> highlights
    if (window.BPTextCleanup && window.BPTextCleanup.cleanHtml) {
      html = window.BPTextCleanup.cleanHtml(html);
    }
    return html;
  }

  // Render markdown-lite (bold + paragraphs) with citations linked to sources.
  // `citeSuffix` is appended to the anchor href so per-turn source cards
  // stay unique when multiple turns are stacked.
  function renderAnswerMarkdown(text, citeSuffix) {
    citeSuffix = citeSuffix || '';
    let html = escapeHtml(text);
    // Convert [n] citations first (before bold parsing) so they get pills.
    html = html.replace(/\[(\d+(?:,\s*\d+)*)\]/g, (_, group) => {
      return group.split(/,\s*/).map(n => {
        const i = parseInt(n, 10);
        return `<a class="dr-cite" href="#dr-src-${i}${citeSuffix}">[${i}]</a>`;
      }).join(' ');
    });
    // **bold** on its own line → heading
    html = html.replace(/^\*\*(.+?)\*\*\s*$/gm, '<h4 class="dr-h">$1</h4>');
    // Inline **bold**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Paragraphs
    html = html.split(/\n{2,}/).map(p => {
      if (/^<h4 /.test(p.trim())) return p;
      return `<p class="dr-p">${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');
    return html;
  }

  // Render HTML for a single DR turn. Includes the question line, the
  // answer (with citation pills), and the source cards. `turnIndex` is used
  // to namespace the source-card ids across multiple stacked turns so
  // in-answer citations still anchor correctly.
  function renderDrTurnHtml(turn, turnIndex, opts) {
    opts = opts || {};
    const sfx = `-t${turnIndex}`;
    let html = renderAnswerMarkdown(turn.answer || '', sfx);
    const sources = (turn.sources || []).map((s, i) => {
      const restricted = s.library_visible === false || !s.doc_slug;
      // Restricted / copyrighted books: show MLA citation only, no clickable link.
      const titleHtml = restricted
        ? `<span class="dr-source-title dr-source-restricted">${escapeHtml(s.doc_title || 'Restricted source')}</span>`
        : `<a href="/library/#/${encodeURIComponent(s.doc_slug)}/${s.ordinal}" data-slug="${escapeHtml(s.doc_slug)}" data-ord="${s.ordinal}">${escapeHtml(s.doc_title)}</a>`;
      const metaHtml = restricted
        ? `<span class="dr-source-meta" title="Copyrighted \u2014 quoted under fair use">restricted</span>`
        : `<span class="dr-source-meta">\u00a7${s.ordinal}</span>`;
      const mlaHtml = restricted && s.mla_citation
        ? `<div class="dr-source-mla" style="font-size:12px;color:var(--muted);margin-top:4px;font-style:italic">${escapeHtml(s.mla_citation)}</div>`
        : '';
      return `
      <article class="dr-source${restricted ? ' dr-source--restricted' : ''}" id="dr-src-${i + 1}${sfx}">
        <div class="dr-source-head">
          ${titleHtml}
          ${metaHtml}
        </div>
        ${mlaHtml}
        <div class="dr-source-snippet">${safeSnippet(s.snippet)}</div>
      </article>`;
    }).join('');
    const label = opts.isCurrent ? 'Deep Research Answer' : 'Earlier Deep Research answer';
    const cardStyle = opts.isCurrent
      ? 'background:var(--surface);padding:14px 16px;margin-top:12px'
      : 'background:var(--surface);padding:14px 16px;margin-top:12px;border-left:3px solid var(--border);opacity:.92';

    // Mode chip: corpus-grounded (default) / hybrid / scripture-only
    let modeChip = '';
    if (turn.mode === 'scripture_only') {
      modeChip = '<span title="No corpus match \u2014 answered from KJV Scripture under Apostolic doctrinal framing" style="font:600 10px var(--font-sans);padding:2px 8px;border-radius:99px;background:rgba(122,31,43,.12);color:var(--accent);text-transform:uppercase;letter-spacing:.05em">Scripture-only</span>';
    } else if (turn.mode === 'hybrid') {
      modeChip = '<span title="Thin corpus match \u2014 answer leans on KJV Scripture" style="font:600 10px var(--font-sans);padding:2px 8px;border-radius:99px;background:rgba(122,31,43,.08);color:var(--ink-2);text-transform:uppercase;letter-spacing:.05em">Hybrid</span>';
    }

    // Sources section only shown when we have at least one.
    const hasSources = (turn.sources || []).length > 0;
    const sourcesBlock = hasSources ? `
        <hr style="margin:14px 0;border:none;border-top:1px solid var(--border)">
        <div style="font:600 12px var(--font-sans);color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Sources</div>
        ${sources}` : '';

    // Follow-up question chips.
    const fups = Array.isArray(turn.followups) ? turn.followups.filter(Boolean) : [];
    const followupBlock = fups.length ? `
        <hr style="margin:14px 0;border:none;border-top:1px solid var(--border)">
        <div style="font:600 12px var(--font-sans);color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Related questions</div>
        <div class="dr-followups" style="display:flex;flex-wrap:wrap;gap:6px">
          ${fups.map(f => `<button type="button" class="dr-fup-btn" data-fup="${escapeHtml(f)}" style="font:500 13px var(--font-sans);padding:6px 12px;border:1px solid var(--border);background:var(--bg);color:var(--ink);border-radius:99px;cursor:pointer;text-align:left">${escapeHtml(f)}</button>`).join('')}
        </div>` : '';

    return `
      <div class="hub-card" style="${cardStyle}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap">
          <strong style="font-family:var(--font-serif);font-size:16px">${label}</strong>
          <div style="display:flex;gap:6px;align-items:center">
            ${modeChip}
            <span class="dr-pill is-on" style="pointer-events:none;font-size:10px">${(turn.sources || []).length} source${(turn.sources || []).length === 1 ? '' : 's'}</span>
          </div>
        </div>
        ${turn.q ? `<div style="font:600 13px var(--font-sans);color:var(--ink-2);margin-bottom:8px;padding:8px 10px;background:var(--bg);border-radius:var(--r-md);border-left:2px solid var(--accent)">${escapeHtml(turn.q)}</div>` : ''}
        <div class="dr-answer" style="font:15px/1.6 var(--font-sans);color:var(--ink)">${html}</div>
        ${sourcesBlock}
        ${followupBlock}
      </div>
    `;
  }

  // Render the full DR conversation into #qanswer (oldest first). Also
  // includes a compact toolbar with a "New chat" affordance so the user
  // can archive the current DR chat without needing an AI-mode convo.
  function renderDrConvo() {
    const target = $('#qanswer');
    if (!target) return;
    if (!_drConvo.length) { target.innerHTML = ''; return; }
    const last = _drConvo.length - 1;
    const bar = `
      <div id="dr-convo-bar" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;padding:6px 4px 0">
        <span style="font:600 11px var(--font-sans);color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em">Deep Research chat · ${_drConvo.length} turn${_drConvo.length===1?'':'s'}</span>
        <button type="button" id="dr-new-chat" class="bp-hist-btn" style="font:500 12px var(--font-sans);padding:5px 10px;border:1px solid var(--border);background:transparent;color:var(--ink-2);border-radius:6px;cursor:pointer">New chat</button>
      </div>`;
    target.innerHTML = bar + _drConvo.map((t, i) => {
      if (t && t.answer_type === 'evidence_first') return renderEvidenceTurnHtml(t, i, { isCurrent: i === last });
      return renderDrTurnHtml(t, i, { isCurrent: i === last });
    }).join('');
    // Wire Builder Tray buttons for evidence cards.
    wireEvidenceButtons(target);
    const nc = document.getElementById('dr-new-chat');
    if (nc) nc.addEventListener('click', () => {
      clearDrConvo();
      target.innerHTML = '';
    });
    const qres = $('#qresults'); if (qres) qres.innerHTML = '';
    const qst = $('#qstatus'); if (qst) { qst.style.display = 'none'; qst.textContent = ''; }
  }

  // ---------- Evidence-first rendering ----------
  function renderScriptureCard(v, opts) {
    opts = opts || {};
    const ref = escapeHtml(v.ref || '');
    const canonical = v.canonical || '';
    // Reader link: /read/#b=CODE&c=N&v=N
    let readerHref = '#';
    const m = /^([A-Z0-9]{2,4})\.(\d+)\.(\d+)$/i.exec(canonical);
    if (m) readerHref = `/read/#b=${m[1].toUpperCase()}&c=${+m[2]}&v=${+m[3]}`;
    const text = v.text ? escapeHtml(v.text) : '<span style="color:var(--ink-3);font-style:italic">Open in reader for full text.</span>';
    return `
      <div class="dr-ev-verse" data-canonical="${escapeHtml(canonical)}" style="padding:10px 12px;background:var(--bg);border-left:3px solid var(--accent);border-radius:0 var(--r-md) var(--r-md) 0;margin:6px 0">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px">
          <a href="${readerHref}" style="font:700 12px var(--font-sans);color:var(--accent);text-transform:uppercase;letter-spacing:.04em;text-decoration:none">${ref}</a>
          <button type="button" class="bp-tray-add-verse" data-ref="${ref}" data-canonical="${escapeHtml(canonical)}" title="Add to Builder Tray" style="font:600 10px var(--font-sans);padding:3px 8px;border:1px solid var(--border);background:transparent;color:var(--ink-3);border-radius:99px;cursor:pointer;text-transform:uppercase;letter-spacing:.04em">+ Tray</button>
        </div>
        <div style="font:14px/1.6 var(--font-serif);color:var(--ink)">${text}</div>
      </div>`;
  }

  function renderCorpusCard(w, sourcesForTurn, sfx) {
    const idx = w.sourceIdx;
    const src = sourcesForTurn[idx - 1];
    if (!src) return '';
    const restricted = src.library_visible === false || !src.doc_slug;
    const titleHtml = restricted
      ? `<span style="color:var(--ink-2);font-style:italic">${escapeHtml(src.doc_title || 'Restricted source')}</span>`
      : `<a href="/library/#/${encodeURIComponent(src.doc_slug)}/${src.ordinal}" style="color:var(--ink-2);font-weight:600;text-decoration:none">${escapeHtml(src.doc_title || '')}</a>`;
    const authorLine = src.doc_author
      ? `<span style="color:var(--ink-3);font-size:11px">— ${escapeHtml(src.doc_author)}${src.doc_year ? ' (' + escapeHtml(String(src.doc_year)) + ')' : ''}</span>`
      : '';
    return `
      <div class="dr-ev-witness" style="padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);margin:6px 0">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
          <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap">
            <a class="dr-cite" href="#dr-src-${idx}${sfx}" style="font:700 11px var(--font-sans);color:var(--accent);text-decoration:none">[${idx}]</a>
            ${titleHtml}
            ${authorLine}
          </div>
        </div>
        <blockquote style="font:14px/1.55 var(--font-serif);color:var(--ink);margin:0;padding:0;font-style:italic">“${escapeHtml(w.quote)}”</blockquote>
      </div>`;
  }

  function renderEvidenceTurnHtml(turn, turnIndex, opts) {
    opts = opts || {};
    const sfx = `-t${turnIndex}`;
    const claims = Array.isArray(turn.claims) ? turn.claims : [];
    const objections = Array.isArray(turn.objections) ? turn.objections : [];
    const sources = Array.isArray(turn.sources) ? turn.sources : [];

    const claimsHtml = claims.map((c) => {
      const scripHtml = (c.scripture || []).map(v => renderScriptureCard(v)).join('');
      const witHtml   = (c.corpus || []).map(w => renderCorpusCard(w, sources, sfx)).join('');
      return `
        <section class="dr-ev-claim" style="margin:14px 0;padding:0">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">
            <h4 style="font:600 15px/1.4 var(--font-serif);color:var(--ink);margin:0;flex:1">${escapeHtml(c.claim)}</h4>
            <button type="button" class="bp-tray-add-claim" data-claim="${escapeHtml(c.claim)}" title="Add claim to Builder Tray" style="font:600 10px var(--font-sans);padding:4px 9px;border:1px solid var(--border);background:transparent;color:var(--ink-3);border-radius:99px;cursor:pointer;text-transform:uppercase;letter-spacing:.04em;flex-shrink:0">+ Tray</button>
          </div>
          ${scripHtml}
          ${witHtml}
        </section>`;
    }).join('');

    const objHtml = objections.length ? `
      <hr style="margin:16px 0 10px;border:none;border-top:1px solid var(--border)">
      <div style="font:600 12px var(--font-sans);color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Common objections</div>
      ${objections.map(o => `
        <details style="padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--r-md);margin:6px 0">
          <summary style="font:600 13px var(--font-sans);color:var(--ink-2);cursor:pointer">${escapeHtml(o.objection)}</summary>
          <div style="font:14px/1.6 var(--font-sans);color:var(--ink);margin-top:8px">${escapeHtml(o.response)}</div>
          ${(o.scripture||[]).map(v => renderScriptureCard(v)).join('')}
        </details>`).join('')}` : '';

    const sourcesHtml = sources.map((s, i) => {
      const restricted = s.library_visible === false || !s.doc_slug;
      const titleHtml = restricted
        ? `<span class="dr-source-title dr-source-restricted">${escapeHtml(s.doc_title || 'Restricted source')}</span>`
        : `<a href="/library/#/${encodeURIComponent(s.doc_slug)}/${s.ordinal}">${escapeHtml(s.doc_title)}</a>`;
      const mlaHtml = restricted && s.mla_citation
        ? `<div class="dr-source-mla" style="font-size:12px;color:var(--muted);margin-top:4px;font-style:italic">${escapeHtml(s.mla_citation)}</div>`
        : '';
      return `
        <article class="dr-source${restricted ? ' dr-source--restricted' : ''}" id="dr-src-${i + 1}${sfx}">
          <div class="dr-source-head">
            ${titleHtml}
            <span class="dr-source-meta">${restricted ? 'restricted' : '§' + s.ordinal}</span>
          </div>
          ${mlaHtml}
          <div class="dr-source-snippet">${safeSnippet(s.snippet)}</div>
        </article>`;
    }).join('');
    const sourcesBlock = sources.length ? `
      <hr style="margin:14px 0;border:none;border-top:1px solid var(--border)">
      <div style="font:600 12px var(--font-sans);color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Sources</div>
      ${sourcesHtml}` : '';

    const fups = Array.isArray(turn.followups) ? turn.followups.filter(Boolean) : [];
    const followupBlock = fups.length ? `
      <hr style="margin:14px 0;border:none;border-top:1px solid var(--border)">
      <div style="font:600 12px var(--font-sans);color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Related questions</div>
      <div class="dr-followups" style="display:flex;flex-wrap:wrap;gap:6px">
        ${fups.map(f => `<button type="button" class="dr-fup-btn" data-fup="${escapeHtml(f)}" style="font:500 13px var(--font-sans);padding:6px 12px;border:1px solid var(--border);background:var(--bg);color:var(--ink);border-radius:99px;cursor:pointer;text-align:left">${escapeHtml(f)}</button>`).join('')}
      </div>` : '';

    const label = opts.isCurrent ? 'Evidence-first answer' : 'Earlier evidence answer';
    const cardStyle = opts.isCurrent
      ? 'background:var(--surface);padding:14px 16px;margin-top:12px'
      : 'background:var(--surface);padding:14px 16px;margin-top:12px;border-left:3px solid var(--border);opacity:.92';

    let modeChip = '';
    if (turn.mode === 'scripture_only') {
      modeChip = '<span title="No corpus match \u2014 Scripture-only" style="font:600 10px var(--font-sans);padding:2px 8px;border-radius:99px;background:rgba(122,31,43,.12);color:var(--accent);text-transform:uppercase;letter-spacing:.05em">Scripture-only</span>';
    } else if (turn.mode === 'hybrid') {
      modeChip = '<span title="Thin corpus match" style="font:600 10px var(--font-sans);padding:2px 8px;border-radius:99px;background:rgba(122,31,43,.08);color:var(--ink-2);text-transform:uppercase;letter-spacing:.05em">Hybrid</span>';
    }

    const thesisHtml = turn.thesis
      ? `<div style="font:600 15px/1.5 var(--font-serif);color:var(--ink);padding:10px 12px;background:var(--bg);border-left:2px solid var(--accent);border-radius:0 var(--r-md) var(--r-md) 0;margin:8px 0 4px">${escapeHtml(turn.thesis)}</div>` : '';
    const summaryHtml = turn.summary
      ? `<hr style="margin:16px 0 10px;border:none;border-top:1px solid var(--border)"><div style="font:14px/1.6 var(--font-sans);color:var(--ink-2)"><strong style="font-family:var(--font-serif)">Summary. </strong>${escapeHtml(turn.summary)}</div>` : '';

    return `
      <div class="hub-card dr-evidence-card" style="${cardStyle}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap">
          <strong style="font-family:var(--font-serif);font-size:16px">${label}</strong>
          <div style="display:flex;gap:6px;align-items:center">
            ${modeChip}
            <span class="dr-pill is-on" style="pointer-events:none;font-size:10px">${claims.length} claim${claims.length === 1 ? '' : 's'}</span>
          </div>
        </div>
        ${turn.q ? `<div style="font:600 13px var(--font-sans);color:var(--ink-2);margin-bottom:8px;padding:8px 10px;background:var(--bg);border-radius:var(--r-md);border-left:2px solid var(--accent)">${escapeHtml(turn.q)}</div>` : ''}
        ${thesisHtml}
        ${claimsHtml}
        ${objHtml}
        ${summaryHtml}
        ${sourcesBlock}
        ${followupBlock}
      </div>`;
  }

  function renderAnswer(data, question) {
    const isEvidence = data && data.answer_type === 'evidence_first';
    if (isEvidence) {
      persistTurn({
        q: question || '',
        answer_type: 'evidence_first',
        thesis: data.thesis || '',
        claims: data.claims || [],
        objections: data.objections || [],
        summary: data.summary || '',
        sources: data.sources || [],
        mode: data.mode || null,
        followups: Array.isArray(data.followups) ? data.followups : [],
      });
    } else {
      persistTurn({
        q: question || '',
        answer: data.answer || '',
        sources: data.sources || [],
        mode: data.mode || null,
        followups: Array.isArray(data.followups) ? data.followups : [],
      });
    }
    renderDrConvo();

    // Wire follow-up chips to re-ask.
    const target = $('#qanswer');
    if (target) {
      target.querySelectorAll('.dr-fup-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const q = btn.getAttribute('data-fup') || '';
          if (!q) return;
          const qbox = $('#qbox');
          if (qbox) qbox.value = q;
          drAsk(q);
        });
      });
    }
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function setStatus(text, isError = false) {
    const el = $('#qstatus');
    if (!el) return;
    el.textContent = text;
    el.style.display = text ? 'block' : 'none';
    el.style.color = isError ? '#c1444d' : '';
  }

  function wireEvidenceButtons(root) {
    if (!root) return;
    root.querySelectorAll('.bp-tray-add-verse').forEach(btn => {
      if (btn.dataset.wired) return; btn.dataset.wired = '1';
      btn.addEventListener('click', () => {
        const ref = btn.getAttribute('data-ref') || '';
        const canonical = btn.getAttribute('data-canonical') || '';
        if (!ref) return;
        try {
          if (window.BuilderTray && window.BuilderTray.pushVerse) {
            window.BuilderTray.pushVerse(ref, { source: 'evidence-first', canonical });
            btn.textContent = '✓ Added';
            btn.style.color = 'var(--accent)';
            setTimeout(() => { btn.textContent = '+ Tray'; btn.style.color = ''; }, 1400);
          }
        } catch (_e) {}
      });
    });
    root.querySelectorAll('.bp-tray-add-claim').forEach(btn => {
      if (btn.dataset.wired) return; btn.dataset.wired = '1';
      btn.addEventListener('click', () => {
        const claim = btn.getAttribute('data-claim') || '';
        if (!claim) return;
        try {
          if (window.BuilderTray && window.BuilderTray.pushText) {
            window.BuilderTray.pushText('Claim', claim, { source: 'evidence-first' });
            btn.textContent = '✓ Added';
            btn.style.color = 'var(--accent)';
            setTimeout(() => { btn.textContent = '+ Tray'; btn.style.color = ''; }, 1400);
          }
        } catch (_e) {}
      });
    });
  }

  async function drAsk(question) {
    const useEvidence = window.DR && DR.getAnswerMode && DR.getAnswerMode() === 'evidence';
    setStatus(useEvidence ? 'Assembling evidence\u2026' : 'Retrieving Apostolic corpus\u2026');
    // Show existing turns while the new one is retrieving; append a
    // loading placeholder at the bottom.
    const target = $('#qanswer');
    if (target) {
      const prior = _drConvo.length
        ? _drConvo.map((t, i) => {
            if (t && t.answer_type === 'evidence_first') return renderEvidenceTurnHtml(t, i, { isCurrent: false });
            return renderDrTurnHtml(t, i, { isCurrent: false });
          }).join('')
        : '';
      const spinnerHtml = (window.BPSpinner && window.BPSpinner.html)
        ? window.BPSpinner.html({ size: 22, label: useEvidence ? 'Assembling evidence' : 'Retrieving Apostolic corpus', inline: true })
        : (useEvidence ? 'Assembling evidence\u2026' : 'Retrieving Apostolic corpus\u2026');
      target.innerHTML = prior + `
        <div class="hub-card" id="dr-loading" style="background:var(--surface);padding:16px;margin-top:12px;color:var(--ink-3);font:14px var(--font-sans);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="dr-pill is-on" style="pointer-events:none;font-size:10px">${useEvidence ? 'Evidence' : 'Deep Research'}</span>
          ${spinnerHtml}
        </div>`;
    }
    try {
      const data = useEvidence
        ? await DR.fetchAskEvidence({ question, k: 12 })
        : await DR.fetchAsk({ question, k: 12 });
      setStatus('');
      renderAnswer(data, question);
    } catch (e) {
      setStatus('Deep Research failed: ' + e.message, true);
      const load = $('#dr-loading'); if (load) load.remove();
    }
  }

  // Capture-phase interceptors so we run before the original handlers.
  function bindInterceptors() {
    // Click on Ask AI button
    document.addEventListener('click', (e) => {
      if (!window.DR || !DR.isOn()) return;
      const t = e.target;
      if (t && (t.id === 'qAskBtn' || (t.closest && t.closest('#qAskBtn')))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const q = ($('#qbox') || {}).value?.trim();
        if (q) drAsk(q);
      }
    }, true);
    // Enter key in the qbox
    document.addEventListener('keydown', (e) => {
      if (!window.DR || !DR.isOn()) return;
      if (e.key === 'Enter' && e.target && e.target.id === 'qbox') {
        const q = e.target.value.trim();
        if (!q) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        drAsk(q);
      }
    }, true);
  }

  // Hook the "New chat" button so it also archives the DR session.
  // Explorer's own handler starts a new AI session; we archive DR too so
  // both modes get a fresh chat on click. The DR toggle state is preserved.
  function bindNewChatHook() {
    const attach = () => {
      const nb = document.getElementById('qNewChat');
      if (!nb || nb.dataset.drBound) return;
      nb.dataset.drBound = '1';
      nb.addEventListener('click', () => {
        clearDrConvo();
        // Wipe rendered DR turns from #qanswer if DR is on.
        if (window.DR && DR.isOn()) {
          const target = $('#qanswer'); if (target) target.innerHTML = '';
        }
      });
    };
    attach();
    const mo = new MutationObserver(attach);
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // When DR is toggled ON, render saved turns; when OFF, restore Explorer's
  // native view by clearing #qanswer (Explorer's own renderConvoShellIfIdle
  // will repaint it).
  function onDrChanged() {
    toggleHint();
    const target = $('#qanswer');
    if (!target) return;
    if (window.DR && DR.isOn()) {
      if (_drConvo.length) renderDrConvo();
    } else {
      // Wipe DR-only content and let Explorer's idle renderer repaint.
      target.innerHTML = '';
      if (typeof window.renderConvoShellIfIdle === 'function') {
        try { window.renderConvoShellIfIdle(); } catch (_e) {}
      }
    }
  }

  function init() {
    mountPill();
    toggleHint();
    window.addEventListener('bp:dr-changed', onDrChanged);
    bindInterceptors();
    bindNewChatHook();
    // If page loads with DR on and we have saved turns, render them.
    if (window.DR && DR.isOn() && _drConvo.length) renderDrConvo();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
