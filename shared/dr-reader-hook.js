/*
  dr-reader-hook.js — Adds Deep Research features to /read/ study panel.

  When DR mode is ON and a verse is selected, we augment #studyPane with:
    - Lemma / Strong's for the verse (Greek NT, Hebrew OT)
    - TSK cross-references (top 10)
    - Corpus excerpts referencing the verse
    - Mini "Ask Deep Research" input scoped to the verse

  Depends on: /shared/dr-mode.js (loaded before this file).
*/
(function () {
  const $ = (s) => document.querySelector(s);

  // Book id (1..66) → canonical OSIS abbrev used by DR APIs.
  const BOOK_ABBR = [
    null, 'Gen','Exod','Lev','Num','Deut','Josh','Judg','Ruth','1Sam','2Sam','1Kgs','2Kgs','1Chr','2Chr',
    'Ezra','Neh','Esth','Job','Ps','Prov','Eccl','Song','Isa','Jer','Lam','Ezek','Dan','Hos','Joel',
    'Amos','Obad','Jonah','Mic','Nah','Hab','Zeph','Hag','Zech','Mal','Matt','Mark','Luke','John',
    'Acts','Rom','1Cor','2Cor','Gal','Eph','Phil','Col','1Thess','2Thess','1Tim','2Tim','Titus','Phlm',
    'Heb','Jas','1Pet','2Pet','1John','2John','3John','Jude','Rev',
  ];

  function currentRef() {
    // Reader stores its selection in window.state (from the inline reader script).
    const s = window.state;
    if (!s || s.v == null || !s.bid || !s.c) return null;
    const bk = BOOK_ABBR[s.bid];
    if (!bk) return null;
    return `${bk}.${s.c}.${s.v}`;
  }

  function mountPill() {
    const host = $('#dr-toggle-host');
    if (!host || host.dataset.drMounted) return;
    host.dataset.drMounted = '1';
    if (window.DR && DR.pill) DR.pill(host);
    else setTimeout(mountPill, 50);
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  async function renderDRPanel(ref, pane) {
    const box = document.createElement('div');
    box.className = 'dr-panel';
    box.style.cssText = 'margin-top:18px;padding:12px;border:1px solid var(--border);border-radius:var(--r-lg);background:var(--surface)';
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <strong style="font-family:var(--font-serif);font-size:14px">Deep Research · ${esc(ref)}</strong>
        <a href="/library/" style="font-size:11px;color:var(--accent);text-decoration:none">Library →</a>
      </div>
      <div class="dr-section" id="dr-lemma-sec"><div style="font:600 11px var(--font-sans);color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Original Language</div><div style="color:var(--ink-3);font-size:12px">Loading…</div></div>
      <div class="dr-section" id="dr-tsk-sec" style="margin-top:14px"><div style="font:600 11px var(--font-sans);color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Cross-References (TSK)</div><div style="color:var(--ink-3);font-size:12px">Loading…</div></div>
      <div class="dr-section" id="dr-excerpts-sec" style="margin-top:14px"><div style="font:600 11px var(--font-sans);color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Corpus Excerpts</div><div style="color:var(--ink-3);font-size:12px">Loading…</div></div>
      <div class="dr-section" style="margin-top:14px">
        <div style="font:600 11px var(--font-sans);color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Ask Deep Research</div>
        <div style="display:flex;gap:6px">
          <input type="text" class="dr-ask-input" placeholder="Ask about this verse (Apostolic corpus)"
            style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--bg);color:var(--ink);font:14px var(--font-sans)">
          <button class="dr-ask-btn" style="padding:8px 12px;background:var(--accent);color:#fff;border:none;border-radius:var(--r-md);font:600 12px var(--font-sans);cursor:pointer">Ask</button>
        </div>
        <div class="dr-ask-out" style="margin-top:10px"></div>
      </div>
    `;
    pane.appendChild(box);

    // Kick off parallel loads
    fillLemma(ref, box);
    fillTsk(ref, box);
    fillExcerpts(ref, box);
    bindAsk(ref, box);
  }

  async function fillLemma(ref, box) {
    const el = box.querySelector('#dr-lemma-sec');
    try {
      const r = await DR.fetchLemma(ref, true);
      if (!r.words || !r.words.length) {
        el.innerHTML += `<div style="color:var(--ink-3);font-size:12px;font-style:italic">No lemma data (may be OT poetry section without STEP data).</div>`;
        el.querySelector('div:nth-child(2)')?.remove();
        return;
      }
      const rows = r.words.slice(0, 30).map(w => `
        <div style="padding:4px 0;border-bottom:1px dotted var(--border);font-size:13px">
          <span style="font-family:var(--font-serif);font-size:15px;color:var(--ink)">${esc(w.original || '')}</span>
          <span style="color:var(--ink-3);font-size:11px;margin-left:6px">${esc(w.transliteration || w.def?.transliteration || '')}</span>
          <span style="color:var(--accent);font:600 11px var(--font-sans);margin-left:6px">${esc(w.strongs || '')}</span>
          <span style="color:var(--ink-3);font-size:11px;margin-left:6px">${esc(w.morph || '')}</span>
          <div style="color:var(--ink-2);font-size:12px;margin-top:2px">${esc(w.english_gloss || '')} — ${esc(w.def?.short_def || '')}</div>
        </div>
      `).join('');
      el.querySelector('div:nth-child(2)').outerHTML = `<div style="max-height:280px;overflow-y:auto">${rows}</div>`;
    } catch (e) {
      el.querySelector('div:nth-child(2)').textContent = 'Lemma data unavailable.';
    }
  }

  async function fillTsk(ref, box) {
    const el = box.querySelector('#dr-tsk-sec');
    try {
      const r = await DR.fetchTsk(ref, 12);
      if (!r.xrefs.length) {
        el.querySelector('div:nth-child(2)').textContent = 'No cross-references.';
        return;
      }
      const rows = r.xrefs.map(x => {
        const hum = drToHuman(x.ref);
        return `<button class="dr-xref" data-ref="${esc(x.ref)}" data-hum="${esc(hum)}" style="background:var(--bg);border:1px solid var(--border);color:var(--ink-2);padding:3px 8px;border-radius:var(--r-pill);font:500 12px var(--font-sans);cursor:pointer;margin:2px">${esc(hum)}</button>`;
      }).join('');
      el.querySelector('div:nth-child(2)').outerHTML = `<div>${rows}</div>`;
      // Wire the xref buttons: navigate reader to that ref
      el.querySelectorAll('.dr-xref').forEach(b => {
        b.addEventListener('click', () => jumpTo(b.dataset.ref));
      });
    } catch (e) {
      el.querySelector('div:nth-child(2)').textContent = 'Cross-references unavailable.';
    }
  }

  async function fillExcerpts(ref, box) {
    const el = box.querySelector('#dr-excerpts-sec');
    try {
      const r = await DR.fetchByVerse(ref, 6);
      if (!r.results.length) {
        el.querySelector('div:nth-child(2)').textContent = 'No excerpts mention this verse in the Apostolic corpus.';
        return;
      }
      const rows = r.results.map(x => `
        <article class="dr-source" style="padding:8px 10px">
          <div class="dr-source-head">
            <a href="/library/#/${encodeURIComponent(x.doc_slug)}/${x.ordinal}" target="_blank" rel="noopener">${esc(x.doc_title)}</a>
            <span class="dr-source-meta">§${x.ordinal}</span>
          </div>
          <div class="dr-source-snippet">${(window.BPTextCleanup ? window.BPTextCleanup.clean(esc((x.content || '').substring(0, 260))) : esc((x.content || '').substring(0, 260)))}${x.content && x.content.length > 260 ? '…' : ''}</div>
        </article>
      `).join('');
      el.querySelector('div:nth-child(2)').outerHTML = `<div>${rows}</div>`;
    } catch (e) {
      el.querySelector('div:nth-child(2)').textContent = 'Corpus excerpts unavailable.';
    }
  }

  function bindAsk(ref, box) {
    const btn = box.querySelector('.dr-ask-btn');
    const inp = box.querySelector('.dr-ask-input');
    const out = box.querySelector('.dr-ask-out');
    if (!btn || !inp || !out) return;
    async function go() {
      const q = inp.value.trim();
      if (!q) return;
      btn.disabled = true;
      btn.textContent = '…';
      out.innerHTML = `<div style="color:var(--ink-3);font-size:12px">Retrieving Apostolic corpus…</div>`;
      try {
        const data = await DR.fetchAsk({ question: q, verseRef: ref, k: 6 });
        renderAnswer(data, out);
      } catch (e) {
        out.innerHTML = `<div style="color:#c1444d;font-size:12px">Failed: ${esc(e.message)}</div>`;
      } finally {
        btn.disabled = false; btn.textContent = 'Ask';
      }
    }
    btn.addEventListener('click', go);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  function safeSnippet(s) {
    if (!s) return '';
    let html = esc(s).replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
    if (window.BPTextCleanup && window.BPTextCleanup.cleanHtml) {
      html = window.BPTextCleanup.cleanHtml(html);
    }
    return html;
  }

  function renderAnswer(data, out) {
    let html = esc(data.answer || '');
    // Citations first
    html = html.replace(/\[(\d+(?:,\s*\d+)*)\]/g, (_, group) =>
      group.split(/,\s*/).map(n => `<a class="dr-cite" href="#dr-src-${n}">[${n}]</a>`).join(' '));
    // Section headings
    html = html.replace(/^\*\*(.+?)\*\*\s*$/gm, '<h4 class="dr-h">$1</h4>');
    // Inline bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.split(/\n{2,}/).map(p => /^<h4 /.test(p.trim()) ? p : `<p class="dr-p" style="margin:0 0 8px;line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`).join('');
    const sources = (data.sources || []).map((s, i) => `
      <article class="dr-source" id="dr-src-${i + 1}" style="padding:8px 10px">
        <div class="dr-source-head">
          <a href="/library/#/${encodeURIComponent(s.doc_slug)}/${s.ordinal}" target="_blank" rel="noopener">${esc(s.doc_title)}</a>
          <span class="dr-source-meta">§${s.ordinal}</span>
        </div>
        <div class="dr-source-snippet">${safeSnippet(s.snippet)}</div>
      </article>
    `).join('');
    out.innerHTML = `
      <div style="border:1px solid var(--border);border-radius:var(--r-md);padding:10px 12px;background:var(--bg)">
        <div style="font:14px/1.6 var(--font-sans);color:var(--ink)">${html}</div>
        <hr style="margin:10px 0;border:none;border-top:1px solid var(--border)">
        <div style="font:600 11px var(--font-sans);color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Sources</div>
        ${sources}
      </div>
    `;
  }

  function drToHuman(ref) {
    // Bk.C.V → "Book C:V"
    const m = ref.match(/^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/);
    if (!m) return ref;
    const nameMap = { 'Gen':'Genesis','Exod':'Exodus','Lev':'Leviticus','Num':'Numbers','Deut':'Deuteronomy','Josh':'Joshua','Judg':'Judges','Ruth':'Ruth','1Sam':'1 Samuel','2Sam':'2 Samuel','1Kgs':'1 Kings','2Kgs':'2 Kings','1Chr':'1 Chronicles','2Chr':'2 Chronicles','Ezra':'Ezra','Neh':'Nehemiah','Esth':'Esther','Job':'Job','Ps':'Psalms','Prov':'Proverbs','Eccl':'Ecclesiastes','Song':'Song of Solomon','Isa':'Isaiah','Jer':'Jeremiah','Lam':'Lamentations','Ezek':'Ezekiel','Dan':'Daniel','Hos':'Hosea','Joel':'Joel','Amos':'Amos','Obad':'Obadiah','Jonah':'Jonah','Mic':'Micah','Nah':'Nahum','Hab':'Habakkuk','Zeph':'Zephaniah','Hag':'Haggai','Zech':'Zechariah','Mal':'Malachi','Matt':'Matthew','Mark':'Mark','Luke':'Luke','John':'John','Acts':'Acts','Rom':'Romans','1Cor':'1 Corinthians','2Cor':'2 Corinthians','Gal':'Galatians','Eph':'Ephesians','Phil':'Philippians','Col':'Colossians','1Thess':'1 Thessalonians','2Thess':'2 Thessalonians','1Tim':'1 Timothy','2Tim':'2 Timothy','Titus':'Titus','Phlm':'Philemon','Heb':'Hebrews','Jas':'James','1Pet':'1 Peter','2Pet':'2 Peter','1John':'1 John','2John':'2 John','3John':'3 John','Jude':'Jude','Rev':'Revelation' };
    return `${nameMap[m[1]] || m[1]} ${m[2]}:${m[3]}`;
  }

  function jumpTo(ref) {
    // Reader accepts hash /?bid=..&c=..&v=.. or ?ref=. Best effort: rely on
    // top-level BshReader.jump if present, else fall back to /read/?ref= query.
    if (window.BshReader && window.BshReader.jumpToRef) {
      window.BshReader.jumpToRef(ref);
    } else {
      // Fall back to /read/ query
      const hum = drToHuman(ref);
      location.hash = `#${encodeURIComponent(hum)}`;
    }
  }

  // Re-render DR panel any time renderStudy runs. We watch #studyPane for changes.
  let debounceT;
  function watchAndInject() {
    const target = $('#studyPane');
    if (!target) return;
    const mo = new MutationObserver(() => {
      clearTimeout(debounceT);
      debounceT = setTimeout(injectIfEligible, 60);
    });
    mo.observe(target, { childList: true, subtree: false });
    injectIfEligible();
  }

  function injectIfEligible() {
    const pane = $('#studyPane');
    if (!pane) return;
    // Only if DR is on and a verse is selected
    if (!DR.isOn()) return;
    const ref = currentRef();
    if (!ref) return;
    // Avoid double-injection during rapid re-renders
    if (pane.querySelector('.dr-panel')) return;
    renderDRPanel(ref, pane);
  }

  function init() {
    mountPill();
    watchAndInject();
    window.addEventListener('bp:dr-changed', () => {
      // Force a re-render of study pane if the reader's renderStudy exists.
      if (typeof window.renderStudy === 'function') { try { window.renderStudy(); } catch {} }
      // Re-inject regardless (renderStudy may not have fired)
      setTimeout(injectIfEligible, 50);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
