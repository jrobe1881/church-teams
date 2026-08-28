/*
  passage-guide.js — Advanced Passage Guide client for the Explorer.

  Behavior:
    - Mounts a compact "Passage Guide" pill in #dr-toggle-host (next to DR pill).
    - Also injects a passage input row above the search bar (hidden by default;
      shown when the pill is active OR when the URL contains #pg=<ref>).
    - Deep link: #pg=Acts+2:38-41 auto-loads on page load / hashchange.
    - Renders 10 collapsible sections into #qanswer:
        Verses · Context · Structure · Keywords · Cross-references ·
        Doctrine · Application · Questions · Sermon · Witnesses
    - Each verse / doctrine point / application / sermon point / witness has
      a "+ Tray" button that pushes to BuilderTray.pushVerse or pushText.

  Depends on: /shared/bp-spinner.js, /shared/dr-explorer-hook.js (for its
  render helpers we mirror — kept independent to avoid coupling).
*/
(function () {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

  const STATE_KEY = 'bp_passage_guide_open';

  // ----------------------- util -----------------------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeText(s) { return esc(s == null ? '' : String(s)); }

  function readerUrlFromCanonical(canonical) {
    if (!canonical) return null;
    const m = String(canonical).match(/^([A-Z0-9]+)\.(\d+)\.(\d+)/i);
    if (!m) return null;
    return `/read/#b=${m[1].toUpperCase()}&c=${m[2]}&v=${m[3]}`;
  }

  function pushVerseToTray(ref, canonical, source) {
    try {
      if (window.BuilderTray && window.BuilderTray.pushVerse) {
        window.BuilderTray.pushVerse(ref, { source: source || 'Passage Guide', canonical });
        toast(`Added ${ref} to Builder Tray`);
      }
    } catch (_e) {}
  }
  function pushTextToTray(title, text) {
    try {
      if (window.BuilderTray && window.BuilderTray.pushText) {
        window.BuilderTray.pushText({ title, text, source: 'Passage Guide' });
        toast(`Added "${title}" to Builder Tray`);
      }
    } catch (_e) {}
  }

  // Tiny transient toast.
  let toastTimer = null;
  function toast(msg) {
    let n = $('#bp-pg-toast');
    if (!n) {
      n = document.createElement('div');
      n.id = 'bp-pg-toast';
      n.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#0e0e10;color:#fff;padding:8px 14px;border-radius:999px;font:500 13px/1 var(--font-sans,"Inter",system-ui);border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 24px rgba(0,0,0,.35);z-index:9999;opacity:0;transition:opacity .18s';
      document.body.appendChild(n);
    }
    n.textContent = msg;
    requestAnimationFrame(() => { n.style.opacity = '1'; });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { n.style.opacity = '0'; }, 2200);
  }

  // ----------------------- pill + input row -----------------------
  function mountPill() {
    const host = $('#dr-toggle-host');
    if (!host || host.dataset.pgMounted) return;
    host.dataset.pgMounted = '1';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:8px';
    host.appendChild(wrap);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'pg-pill';
    btn.className = 'pg-pill';
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M4 5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2-2-2V5z"/>' +
      '</svg>' +
      '<span>Passage Guide</span>';
    btn.addEventListener('click', () => togglePanel());
    wrap.appendChild(btn);
  }

  function mountInputRow() {
    if ($('#pg-input-row')) return;
    const searchBar = $('.exp-searchbar');
    if (!searchBar) return;

    const row = document.createElement('div');
    row.id = 'pg-input-row';
    row.className = 'pg-input-row';
    row.hidden = true;
    row.innerHTML = `
      <label class="pg-input-label" for="pg-ref">Passage Guide</label>
      <input id="pg-ref" class="pg-input" type="text"
             placeholder='e.g. "Acts 2:38", "Acts 2:38-41", "Acts 2"'
             autocomplete="off" spellcheck="false" />
      <button id="pg-go" class="pg-go" type="button">Assemble</button>
      <button id="pg-close" class="pg-close" type="button" title="Close Passage Guide" aria-label="Close">×</button>
    `;
    searchBar.parentNode.insertBefore(row, searchBar.nextSibling);

    $('#pg-go', row).addEventListener('click', () => runGuideFromInput());
    $('#pg-close', row).addEventListener('click', () => togglePanel(false));
    $('#pg-ref', row).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); runGuideFromInput(); }
    });
  }

  function isOpen() {
    const row = $('#pg-input-row');
    return !!(row && !row.hidden);
  }
  function togglePanel(force) {
    const row = $('#pg-input-row');
    const pill = $('#pg-pill');
    if (!row) return;
    const next = typeof force === 'boolean' ? force : row.hidden;
    row.hidden = !next;
    if (pill) pill.setAttribute('aria-pressed', String(next));
    if (pill) pill.classList.toggle('is-active', !!next);
    try { localStorage.setItem(STATE_KEY, next ? '1' : '0'); } catch (_e) {}
    if (next) setTimeout(() => { const el = $('#pg-ref'); if (el) el.focus(); }, 30);
  }

  // ----------------------- URL / hash routing -----------------------
  function refFromHash() {
    const raw = location.hash || '';
    const m = raw.match(/[#&]pg=([^&]+)/);
    if (!m) return null;
    try { return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim(); }
    catch (_e) { return m[1]; }
  }
  function setHashRef(ref) {
    const h = 'pg=' + encodeURIComponent(ref);
    // Replace any existing pg= param, keep other hash bits intact.
    const cur = (location.hash || '').replace(/^#/, '');
    const parts = cur.split('&').filter(p => p && !/^pg=/.test(p));
    parts.unshift(h);
    history.replaceState(null, '', '#' + parts.join('&'));
  }

  // ----------------------- fetch -----------------------
  async function fetchGuide(ref) {
    const r = await fetch('/api/dr-passage-guide', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ref }),
    });
    let body = null;
    try { body = await r.json(); } catch (_e) { body = { error: 'Bad response.' }; }
    if (!r.ok) throw new Error((body && body.error) || `Request failed (${r.status}).`);
    return body;
  }

  // ----------------------- render -----------------------
  function scriptureChipsHtml(list, source) {
    if (!list || !list.length) return '';
    return `<div class="pg-chips">${list.map(v => {
      const url = readerUrlFromCanonical(v.canonical || '');
      const anchor = url
        ? `<a class="pg-vchip" href="${url}" data-verse-ref="${esc(v.ref)}" data-canonical="${esc(v.canonical||'')}">${esc(v.ref)}</a>`
        : `<span class="pg-vchip">${esc(v.ref)}</span>`;
      const text = v.text ? `<span class="pg-vchip-text"> — ${safeText(v.text)}</span>` : '';
      const tray = `<button class="pg-tray-mini" type="button" data-verse-ref="${esc(v.ref)}" data-canonical="${esc(v.canonical||'')}" data-source="${esc(source||'Passage Guide')}" title="Add to Builder Tray">+ Tray</button>`;
      return `<div class="pg-vrow">${anchor}${text}${tray}</div>`;
    }).join('')}</div>`;
  }

  function verseCardHtml(v) {
    const url = readerUrlFromCanonical(v.canonical);
    return `
      <li class="pg-verse">
        <div class="pg-verse-head">
          <a class="pg-verse-ref" href="${url || '#'}" data-verse-ref="${esc(v.ref)}" data-canonical="${esc(v.canonical)}">${esc(v.ref)}</a>
          <button class="pg-tray-mini" type="button" data-verse-ref="${esc(v.ref)}" data-canonical="${esc(v.canonical)}" data-source="Passage Guide verse">+ Tray</button>
        </div>
        <div class="pg-verse-text">${safeText(v.text || '')}</div>
      </li>
    `;
  }

  function sectionHtml(id, title, contentHtml, opts) {
    opts = opts || {};
    const open = opts.open ? 'open' : '';
    return `
      <details class="pg-section" id="pg-sec-${id}" ${open}>
        <summary class="pg-section-head">
          <span class="pg-section-title">${esc(title)}</span>
          <span class="pg-section-caret" aria-hidden="true">▾</span>
        </summary>
        <div class="pg-section-body">${contentHtml}</div>
      </details>
    `;
  }

  function structureRoleColor(role) {
    const r = String(role || '').toLowerCase();
    if (r.includes('thesis') || r.includes('key'))  return 'accent';
    if (r.includes('transition'))                    return 'muted';
    if (r.includes('application') || r.includes('imperative') || r.includes('command')) return 'green';
    if (r.includes('question'))                      return 'blue';
    return 'default';
  }

  function renderGuide(host, data) {
    const title = safeText(data.ref || '');
    const verses = Array.isArray(data.verses) ? data.verses : [];

    // ---- Verses ----
    const versesHtml = `<ol class="pg-verses">${verses.map(verseCardHtml).join('')}</ol>`;

    // ---- Context ----
    const ctx = data.context || {};
    const contextHtml = `
      <div class="pg-context">
        ${ctx.book_overview ? `<div class="pg-ctx-block"><div class="pg-ctx-label">Book overview</div><p>${safeText(ctx.book_overview)}</p></div>` : ''}
        ${ctx.literary_context ? `<div class="pg-ctx-block"><div class="pg-ctx-label">Literary context</div><p>${safeText(ctx.literary_context)}</p></div>` : ''}
        ${ctx.audience_setting ? `<div class="pg-ctx-block"><div class="pg-ctx-label">Audience & setting</div><p>${safeText(ctx.audience_setting)}</p></div>` : ''}
      </div>
    `;

    // ---- Structure ----
    const structHtml = (data.structure || []).length
      ? `<ul class="pg-struct">${data.structure.map(s => {
          const url = readerUrlFromCanonical(s.canonical);
          const tone = structureRoleColor(s.role);
          return `
            <li class="pg-struct-row">
              <a class="pg-vchip" href="${url || '#'}" data-verse-ref="${esc(s.verse)}" data-canonical="${esc(s.canonical)}">${esc(s.verse)}</a>
              <span class="pg-role pg-role-${tone}">${esc(s.role)}</span>
              ${s.text ? `<span class="pg-struct-text">${safeText(s.text)}</span>` : ''}
            </li>`;
        }).join('')}</ul>`
      : '<div class="pg-empty">No structure notes.</div>';

    // ---- Keywords ----
    const kwHtml = (data.keywords || []).length
      ? `<ul class="pg-kw">${data.keywords.map(k => `
          <li class="pg-kw-row">
            <div class="pg-kw-head">
              <span class="pg-kw-lemma">${esc(k.lemma || k.strongs || '')}</span>
              ${k.translit ? `<span class="pg-kw-translit">${esc(k.translit)}</span>` : ''}
              ${k.strongs ? `<a class="pg-kw-strongs" href="/strongs/?s=${encodeURIComponent(k.strongs)}">${esc(k.strongs)}</a>` : ''}
              <span class="pg-kw-count">${k.count}\u00d7</span>
            </div>
            ${k.gloss ? `<div class="pg-kw-gloss">${safeText(k.gloss)}</div>` : ''}
            ${k.short_def ? `<div class="pg-kw-def">${safeText(k.short_def)}</div>` : ''}
            ${Array.isArray(k.verses) && k.verses.length ? `<div class="pg-kw-verses">${k.verses.map(v => {
              const url = readerUrlFromCanonical(v.canonical);
              return `<a class="pg-vchip pg-vchip-sm" href="${url || '#'}" data-verse-ref="${esc(v.ref)}" data-canonical="${esc(v.canonical)}">${esc(v.ref)}</a>`;
            }).join('')}</div>` : ''}
          </li>`).join('')}</ul>`
      : '<div class="pg-empty">No lemma data.</div>';

    // ---- Cross-references ----
    const xrefsHtml = (data.xrefs || []).length
      ? `<div class="pg-xrefs">${data.xrefs.map(x => `
          <details class="pg-xref-block">
            <summary>
              <span class="pg-xref-verse">${esc(x.verse || '')}</span>
              <span class="pg-xref-count">${(x.refs || []).length} cross-refs</span>
            </summary>
            <ul class="pg-xref-list">
              ${(x.refs || []).map(r => {
                const url = readerUrlFromCanonical(r.canonical);
                return `<li>
                  <a class="pg-vchip pg-vchip-sm" href="${url || '#'}" data-verse-ref="${esc(r.ref)}" data-canonical="${esc(r.canonical||'')}">${esc(r.ref)}</a>
                  ${r.text ? `<span class="pg-xref-text">${safeText(r.text)}</span>` : ''}
                </li>`;
              }).join('')}
            </ul>
          </details>
        `).join('')}</div>`
      : '<div class="pg-empty">No cross-references indexed for this passage.</div>';

    // ---- Doctrine ----
    const docHtml = (data.doctrine || []).length
      ? `<ol class="pg-list">${data.doctrine.map((d, i) => `
          <li class="pg-item">
            <div class="pg-item-head">
              <span class="pg-item-body">${safeText(d.point)}</span>
              <button class="pg-tray-mini" type="button"
                      data-push-text="1"
                      data-title="Doctrine — ${esc(title)} (${i + 1})"
                      data-text="${esc(d.point)} — Scripture: ${esc((d.scripture || []).map(s => s.ref).join('; '))}">
                + Tray
              </button>
            </div>
            ${scriptureChipsHtml(d.scripture, 'Doctrine')}
          </li>`).join('')}</ol>`
      : '<div class="pg-empty">No doctrinal points generated.</div>';

    // ---- Application ----
    const appHtml = (data.application || []).length
      ? `<ol class="pg-list">${data.application.map((a, i) => `
          <li class="pg-item">
            <div class="pg-item-head">
              <span class="pg-item-body">${safeText(a.application)}</span>
              <button class="pg-tray-mini" type="button"
                      data-push-text="1"
                      data-title="Application — ${esc(title)} (${i + 1})"
                      data-text="${esc(a.application)} — Scripture: ${esc((a.scripture || []).map(s => s.ref).join('; '))}">
                + Tray
              </button>
            </div>
            ${scriptureChipsHtml(a.scripture, 'Application')}
          </li>`).join('')}</ol>`
      : '<div class="pg-empty">No applications generated.</div>';

    // ---- Questions ----
    const qHtml = (data.questions || []).length
      ? `<ol class="pg-list pg-questions">${data.questions.map(q => `
          <li class="pg-item"><span class="pg-item-body">${safeText(q)}</span></li>
        `).join('')}</ol>`
      : '<div class="pg-empty">No study questions generated.</div>';

    // ---- Sermon ----
    const sermon = data.sermon || {};
    const sermonHtml = `
      <div class="pg-sermon">
        ${sermon.thesis ? `<div class="pg-sermon-thesis">
          <div class="pg-ctx-label">Thesis</div>
          <p>${safeText(sermon.thesis)}</p>
          <button class="pg-tray-mini" type="button"
                  data-push-text="1"
                  data-title="Sermon thesis — ${esc(title)}"
                  data-text="${esc(sermon.thesis)}">+ Tray</button>
        </div>` : ''}
        ${(sermon.points || []).length ? `<ol class="pg-list pg-sermon-points">${sermon.points.map((p, i) => `
          <li class="pg-item">
            <div class="pg-item-head">
              <span class="pg-item-body"><strong>${esc(p.heading)}.</strong> ${safeText(p.summary)}</span>
              <button class="pg-tray-mini" type="button"
                      data-push-text="1"
                      data-title="Sermon point ${i + 1} — ${esc(title)}"
                      data-text="${esc(p.heading)} — ${esc(p.summary)} — Scripture: ${esc((p.scripture || []).map(s => s.ref).join('; '))}">
                + Tray
              </button>
            </div>
            ${scriptureChipsHtml(p.scripture, 'Sermon')}
          </li>`).join('')}</ol>` : '<div class="pg-empty">No sermon points generated.</div>'}
      </div>
    `;

    // ---- Witnesses (corpus) ----
    const witHtml = (data.witnesses || []).length
      ? `<ul class="pg-witnesses">${data.witnesses.map(w => `
          <li class="pg-witness">
            <div class="pg-witness-head">
              <div class="pg-witness-title">${esc(w.title || 'Untitled')}</div>
              <div class="pg-witness-meta">${esc([w.author, w.year, w.type].filter(Boolean).join(' · '))}</div>
            </div>
            <div class="pg-witness-snippet">${safeText(w.snippet || '')}</div>
            <div class="pg-witness-verses">
              ${(w.verses || []).map(v => {
                const url = readerUrlFromCanonical(v.canonical);
                return `<a class="pg-vchip pg-vchip-sm" href="${url || '#'}" data-verse-ref="${esc(v.ref)}" data-canonical="${esc(v.canonical)}">${esc(v.ref)}</a>`;
              }).join('')}
            </div>
            <div class="pg-witness-cite">${esc(w.mla || '')}</div>
          </li>`).join('')}</ul>`
      : '<div class="pg-empty">No corpus witnesses matched this passage.</div>';

    // ---- Compose ----
    host.innerHTML = `
      <div class="pg-card">
        <header class="pg-card-head">
          <div class="pg-card-title-wrap">
            <div class="pg-card-eyebrow">Passage Guide</div>
            <h2 class="pg-card-title">${title}</h2>
          </div>
          <div class="pg-card-actions">
            <a class="pg-open-reader" href="/read/#b=${esc(data.book_code)}&c=${esc(String(data.chapter))}&v=${esc(String(data.verse_start || 1))}" title="Open in Reader">Open in Reader →</a>
          </div>
        </header>

        ${sectionHtml('verses',    'Verses (' + verses.length + ')',      versesHtml, { open: true })}
        ${sectionHtml('context',   'Context',                              contextHtml)}
        ${sectionHtml('structure', 'Structure',                            structHtml)}
        ${sectionHtml('keywords',  'Keywords (' + (data.keywords || []).length + ')', kwHtml)}
        ${sectionHtml('xrefs',     'Cross-references',                     xrefsHtml)}
        ${sectionHtml('doctrine',  'Doctrine (Apostolic anchors)',         docHtml)}
        ${sectionHtml('application','Application',                         appHtml)}
        ${sectionHtml('questions', 'Study Questions',                      qHtml)}
        ${sectionHtml('sermon',    'Sermon Outline',                       sermonHtml)}
        ${sectionHtml('witnesses', 'Witnesses (' + (data.witnesses || []).length + ')', witHtml)}
      </div>
    `;
    // Delegate Tray buttons
    host.addEventListener('click', onHostClick);
  }

  function onHostClick(e) {
    const trayBtn = e.target && e.target.closest ? e.target.closest('.pg-tray-mini') : null;
    if (trayBtn) {
      if (trayBtn.getAttribute('data-push-text') === '1') {
        pushTextToTray(trayBtn.getAttribute('data-title') || 'Passage Guide item', trayBtn.getAttribute('data-text') || '');
      } else {
        const ref = trayBtn.getAttribute('data-verse-ref') || '';
        const canonical = trayBtn.getAttribute('data-canonical') || '';
        const source = trayBtn.getAttribute('data-source') || 'Passage Guide';
        if (ref) pushVerseToTray(ref, canonical, source);
      }
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // ----------------------- controller -----------------------
  async function runGuide(rawRef, opts) {
    const ref = String(rawRef || '').trim();
    if (!ref) return;
    setHashRef(ref);

    // Ensure panel is open and input is populated
    togglePanel(true);
    const input = $('#pg-ref');
    if (input) input.value = ref;

    // Loading state — use branded spinner
    const answerHost = $('#qanswer') || ensureAnswerHost();
    if (!answerHost) return;
    answerHost.innerHTML = '';
    const spinnerHtml = (window.BPSpinner && window.BPSpinner.html)
      ? window.BPSpinner.html({ size: 22, label: 'Assembling passage guide', inline: false, tone: 'accent' })
      : '<div class="pg-loading">Assembling passage guide…</div>';
    answerHost.innerHTML = `<div class="pg-loading-wrap">${spinnerHtml}</div>`;

    try {
      const data = await fetchGuide(ref);
      renderGuide(answerHost, data);
      // Persist to chat history (skip when recalling a saved session)
      if (!(opts && opts.recall)) {
        try {
          if (window.ChatHistory) {
            window.ChatHistory.startNew('passage');
            window.ChatHistory.saveTurn('passage', { q: ref });
          }
        } catch (_e) {}
      }
      // Log to Study Journey activity feed
      try {
        if (window.ActivityLog && window.ActivityLog.log) {
          window.ActivityLog.log('passage_guide', {
            ref: data && data.ref_canonical || ref,
            book_name: data && data.book_name,
            book_code: data && data.book_code,
            chapter: data && data.chapter
          });
        }
      } catch(_e){}
      // Scroll into view
      const card = answerHost.querySelector('.pg-card');
      if (card && card.scrollIntoView) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      answerHost.innerHTML = `<div class="pg-error">
        <div class="pg-error-title">Passage Guide failed</div>
        <div class="pg-error-msg">${esc(err && err.message ? err.message : String(err))}</div>
        <div class="pg-error-hint">Try a format like "Acts 2:38", "Acts 2:38-41", or "Acts 2".</div>
      </div>`;
    }
  }

  function ensureAnswerHost() {
    // Explorer already has #qanswer inside viewBrowse; return it or fall back
    // to a new container appended to .exp-content-inner.
    let h = $('#qanswer');
    if (h) return h;
    const inner = $('.exp-content-inner');
    if (!inner) return null;
    h = document.createElement('div');
    h.id = 'qanswer';
    inner.appendChild(h);
    return h;
  }

  function runGuideFromInput() {
    const el = $('#pg-ref');
    if (!el) return;
    runGuide(el.value);
  }

  // ----------------------- boot -----------------------
  function bootFromHash() {
    const ref = refFromHash();
    if (ref) {
      togglePanel(true);
      const el = $('#pg-ref');
      if (el) el.value = ref;
      runGuide(ref);
    } else {
      // Restore last-open state
      let last = null;
      try { last = localStorage.getItem(STATE_KEY); } catch (_e) {}
      if (last === '1') togglePanel(true);
    }
  }

  function boot() {
    mountPill();
    mountInputRow();
    bootFromHash();

    window.addEventListener('hashchange', () => {
      const ref = refFromHash();
      if (ref) runGuide(ref);
    });

    // Recall event — fired by chat-history-ui when the user clicks a saved
    // passage session. Re-fetches the guide for the stored ref but does NOT
    // create a new history entry.
    window.addEventListener('bp:passage-guide-recall', (e) => {
      const ref = e && e.detail && e.detail.ref;
      if (ref) runGuide(ref, { recall: true });
    });

    // Public API for other tools (Reader "Guide this passage" links etc.)
    window.PassageGuide = {
      open: (ref) => runGuide(ref),
      recall: (ref) => runGuide(ref, { recall: true }),
      toggle: (v) => togglePanel(v),
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
