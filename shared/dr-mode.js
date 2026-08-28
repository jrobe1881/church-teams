/*
  shared/dr-mode.js — Deep Research mode helpers, shared across
    /explorer/ (Explorer AI) and /read/ (Reader side-panel).

  Provides:
    DR.isOn()               — bool, from localStorage
    DR.toggle(on)           — set state, dispatch event
    DR.onChange(fn)         — subscribe
    DR.pill(host)           — mount a burgundy pill toggle inside host
    DR.fetchAsk({question, topic, verseRef, k})
    DR.fetchSearch(q, limit)
    DR.fetchByVerse(ref)
    DR.fetchByTopic()
    DR.fetchDoc(slug)
    DR.fetchLemma(ref, defs=true)
    DR.fetchTsk(ref)

  All fetches respect same-origin /api/dr-* routes.
*/
(function () {
  const KEY = 'bp_dr_mode_v1';
  const ANSWER_MODE_KEY = 'bp_dr_answer_mode_v1'; // 'narrative' | 'evidence'
  const listeners = new Set();
  const answerModeListeners = new Set();
  function isOn() {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  }
  function toggle(on) {
    const v = on === undefined ? !isOn() : !!on;
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch {}
    document.documentElement.classList.toggle('dr-on', v);
    listeners.forEach(fn => { try { fn(v); } catch {} });
    window.dispatchEvent(new CustomEvent('bp:dr-changed', { detail: { on: v } }));
  }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function getAnswerMode() {
    try {
      const v = localStorage.getItem(ANSWER_MODE_KEY);
      return v === 'evidence' ? 'evidence' : 'narrative';
    } catch { return 'narrative'; }
  }
  function setAnswerMode(mode) {
    const v = mode === 'evidence' ? 'evidence' : 'narrative';
    try { localStorage.setItem(ANSWER_MODE_KEY, v); } catch {}
    answerModeListeners.forEach(fn => { try { fn(v); } catch {} });
    window.dispatchEvent(new CustomEvent('bp:dr-answer-mode-changed', { detail: { mode: v } }));
  }
  function onAnswerModeChange(fn) {
    answerModeListeners.add(fn); return () => answerModeListeners.delete(fn);
  }

  // Mount a two-option segmented control: Narrative | Evidence.
  // Only visible when DR is on (the parent hook can hide/show the host).
  function answerModeControl(host) {
    if (!host) return null;
    const wrap = document.createElement('div');
    wrap.className = 'dr-answer-mode';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Answer style');
    wrap.style.cssText = 'display:inline-flex;gap:0;border:1px solid var(--border);border-radius:99px;overflow:hidden;font:600 11px var(--font-sans);background:var(--bg)';

    function makeBtn(mode, label, title) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.mode = mode;
      b.textContent = label;
      b.title = title;
      b.style.cssText = 'padding:5px 10px;border:0;background:transparent;color:var(--ink-2);cursor:pointer;text-transform:uppercase;letter-spacing:.04em';
      b.addEventListener('click', () => { setAnswerMode(mode); render(); });
      return b;
    }
    const narrBtn = makeBtn('narrative', 'Narrative', 'Traditional prose answer with inline citations');
    const evidBtn = makeBtn('evidence',  'Evidence',  'Evidence-first: claims with verses and corpus witnesses');

    function render() {
      const m = getAnswerMode();
      [narrBtn, evidBtn].forEach(b => {
        const active = b.dataset.mode === m;
        b.style.background = active ? 'var(--accent, #7a1f2b)' : 'transparent';
        b.style.color      = active ? '#fff' : 'var(--ink-2)';
        b.setAttribute('aria-pressed', String(active));
      });
    }
    wrap.append(narrBtn, evidBtn);
    onAnswerModeChange(render);
    render();
    host.appendChild(wrap);
    return wrap;
  }

  function pill(host) {
    if (!host) return null;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dr-pill';
    btn.setAttribute('aria-pressed', String(isOn()));
    function render() {
      const on = isOn();
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? 'Deep Research: On' : 'Deep Research';
      btn.classList.toggle('is-on', on);
    }
    btn.addEventListener('click', () => { toggle(); render(); });
    onChange(render);
    render();
    host.appendChild(btn);
    return btn;
  }

  async function j(url, opts) {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(`${url} → ${r.status}`);
    return r.json();
  }

  const api = {
    isOn, toggle, onChange, pill,
    fetchSearch(q, limit = 20) {
      return j(`/api/dr-search?q=${encodeURIComponent(q)}&limit=${limit}`);
    },
    fetchByVerse(ref, limit = 30) {
      return j(`/api/dr-verse?ref=${encodeURIComponent(ref)}&limit=${limit}`);
    },
    fetchTopics() {
      return j('/api/dr-topics');
    },
    fetchDoc(slug) {
      return j(slug ? `/api/dr-doc?slug=${encodeURIComponent(slug)}` : '/api/dr-doc');
    },
    fetchLemma(ref, defs = true) {
      return j(`/api/dr-lemma?ref=${encodeURIComponent(ref)}${defs ? '&defs=1' : ''}`);
    },
    fetchLemmaByStrongs(code) {
      return j(`/api/dr-lemma?strongs=${encodeURIComponent(code)}`);
    },
    fetchTsk(ref, limit = 40) {
      return j(`/api/dr-tsk?ref=${encodeURIComponent(ref)}&limit=${limit}`);
    },
    fetchAsk({ question, topic, verseRef, k = 8 }) {
      return j('/api/dr-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, topic, verse_ref: verseRef, k }),
      });
    },
    fetchAskEvidence({ question, k = 12 }) {
      return j('/api/dr-ask-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, k }),
      });
    },
    getAnswerMode, setAnswerMode, onAnswerModeChange, answerModeControl,
  };

  // Init on load — set html.dr-on for CSS hooks
  try {
    document.documentElement.classList.toggle('dr-on', isOn());
  } catch {}

  window.DR = api;
})();
