/*
  chat-history.js — Bible Parlor Explorer chat history
  --------------------------------------------------------------
  Persists BOTH modes of chat (regular Explorer AI and Deep Research)
  as discrete sessions the user can browse.

  Storage:
    localStorage['bp_chat_sessions_v1'] = {
      sessions: [{
        id: string,
        mode: 'ai' | 'dr',
        title: string,        // first user question, truncated
        turns: [{ q, a?, answer?, sources?, ts }],
        // Regular AI mode also stores backend messages for follow-ups:
        messages?: [{ role, content }],
        created: number,
        updated: number,
      }],
      currentId: string | null,
    }

  Public API on window.ChatHistory:
    load()                          -> read storage
    getCurrent(mode)                -> ensures & returns current session for mode
    getById(id)                     -> lookup
    listAll()                       -> all sessions, newest-first
    saveTurn(mode, turn, backendMsgs?) -> append turn to current session of mode
    startNew(mode)                  -> archive current, begin fresh session
    switchTo(id)                    -> mark session as current
    remove(id)
    clearAll()
    onChange(fn)                    -> subscribe
*/
(function () {
  const KEY = 'bp_chat_sessions_v1';
  const MAX_SESSIONS = 50;
  const TITLE_MAX = 80;
  const listeners = [];

  // Per-mode current session id: { ai, dr, trace }. Kept per-mode so that
  // clearing/starting a chat in one mode never clobbers the pointer for the
  // other mode.
  const MODES = ['ai', 'dr', 'trace', 'passage'];
  function emptyByMode() { return { ai: null, dr: null, trace: null, passage: null }; }

  function readState() {
    try {
      const s = localStorage.getItem(KEY);
      if (!s) return { sessions: [], currentByMode: emptyByMode(), currentId: null };
      const j = JSON.parse(s);
      if (!j || !Array.isArray(j.sessions)) return { sessions: [], currentByMode: emptyByMode(), currentId: null };
      const sessions = j.sessions.slice(-MAX_SESSIONS);
      // Migrate legacy currentId (single pointer) into per-mode currentByMode.
      let cbm = j.currentByMode;
      if (!cbm || typeof cbm !== 'object') cbm = emptyByMode();
      cbm = { ai: cbm.ai || null, dr: cbm.dr || null, trace: cbm.trace || null, passage: cbm.passage || null };
      if (j.currentId) {
        const legacy = sessions.find(x => x && x.id === j.currentId);
        if (legacy && MODES.indexOf(legacy.mode) >= 0) {
          if (!cbm[legacy.mode]) cbm[legacy.mode] = legacy.id;
        }
      }
      return { sessions: sessions, currentByMode: cbm, currentId: j.currentId || null };
    } catch (_e) {
      return { sessions: [], currentByMode: emptyByMode(), currentId: null };
    }
  }

  let state = readState();

  function writeState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_e) {}
    listeners.forEach(fn => { try { fn(); } catch (_e) {} });
    // Debounced cloud push when signed in
    if (cloudBinding && cloudBinding.notifyLocalChange) {
      try { cloudBinding.notifyLocalChange(); } catch (_e) {}
    }
  }

  // Bound by CloudAccount.bindSync once account.js is ready
  let cloudBinding = null;

  function genId() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function truncateTitle(s) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length <= TITLE_MAX) return t;
    return t.slice(0, TITLE_MAX - 1).trimEnd() + '…';
  }

  // Migrate legacy single-conversation keys into sessions if the sessions
  // store is empty. This preserves the user's existing chat on upgrade.
  function migrateLegacyIfNeeded() {
    if (state.sessions.length) return;
    // Regular AI mode legacy: bshai_convo_v1 = { convo:[{q,a}], messages:[...] }
    let migrated = false;
    try {
      const raw = localStorage.getItem('bshai_convo_v1');
      if (raw) {
        const j = JSON.parse(raw);
        if (j && Array.isArray(j.convo) && j.convo.length) {
          const first = j.convo[0] || {};
          const now = Date.now();
          state.sessions.push({
            id: genId(),
            mode: 'ai',
            title: truncateTitle(first.q || 'Untitled chat'),
            turns: j.convo.map(t => ({ q: t.q || '', a: t.a || '', ts: now })),
            messages: Array.isArray(j.messages) ? j.messages.slice() : [],
            created: now,
            updated: now,
          });
          migrated = true;
        }
      }
    } catch (_e) {}
    // Deep Research mode legacy: bp_dr_convo_v1 = { turns:[{q,answer,sources,ts}] }
    try {
      const raw = localStorage.getItem('bp_dr_convo_v1');
      if (raw) {
        const j = JSON.parse(raw);
        if (j && Array.isArray(j.turns) && j.turns.length) {
          const first = j.turns[0] || {};
          const now = Date.now();
          state.sessions.push({
            id: genId(),
            mode: 'dr',
            title: truncateTitle(first.q || 'Deep Research chat'),
            turns: j.turns.map(t => ({
              q: t.q || '',
              answer: t.answer || '',
              sources: t.sources || [],
              ts: t.ts || now,
            })),
            created: now,
            updated: now,
          });
          migrated = true;
        }
      }
    } catch (_e) {}
    if (migrated) writeState();
  }
  migrateLegacyIfNeeded();

  function currentIdFor(mode) {
    return (state.currentByMode && state.currentByMode[mode]) || null;
  }

  function setCurrentFor(mode, id) {
    if (!state.currentByMode) state.currentByMode = emptyByMode();
    state.currentByMode[mode] = id || null;
    // Keep legacy currentId in sync with whichever mode was most recently set,
    // so any older code path that still reads state.currentId keeps working.
    if (id) state.currentId = id;
  }

  function findCurrent(mode) {
    const cid = currentIdFor(mode);
    if (!cid) return null;
    const s = state.sessions.find(x => x.id === cid);
    if (!s) return null;
    if (mode && s.mode !== mode) return null;
    return s;
  }

  function getCurrent(mode) {
    let s = findCurrent(mode);
    if (s) return s;
    // No current in this mode; find most recent session of same mode.
    const recent = state.sessions
      .filter(x => x.mode === mode)
      .sort((a, b) => b.updated - a.updated)[0];
    if (recent) {
      setCurrentFor(mode, recent.id);
      writeState();
      return recent;
    }
    // Otherwise create a fresh empty session lazily on first save.
    return null;
  }

  function ensureCurrent(mode) {
    let s = findCurrent(mode);
    if (s) return s;
    const now = Date.now();
    s = {
      id: genId(),
      mode: mode,
      title: '',
      turns: [],
      messages: mode === 'ai' ? [] : undefined,
      created: now,
      updated: now,
    };
    state.sessions.push(s);
    if (state.sessions.length > MAX_SESSIONS) {
      state.sessions = state.sessions.slice(-MAX_SESSIONS);
    }
    setCurrentFor(mode, s.id);
    writeState();
    return s;
  }

  function saveTurn(mode, turn, backendMsgs) {
    const s = ensureCurrent(mode);
    s.turns.push(Object.assign({ ts: Date.now() }, turn));
    if (!s.title && turn.q) s.title = truncateTitle(turn.q);
    if (mode === 'ai' && Array.isArray(backendMsgs)) s.messages = backendMsgs.slice(-24);
    s.updated = Date.now();
    writeState();
    return s;
  }

  function startNew(mode) {
    // Archive current (for THIS mode only) by clearing its per-mode pointer;
    // if there's already an empty session in this mode, keep it as the new one
    // instead of piling up empties.
    const cur = findCurrent(mode);
    if (cur && cur.turns.length === 0) {
      setCurrentFor(mode, cur.id);
      writeState();
      return cur;
    }
    setCurrentFor(mode, null);
    // Note: do NOT writeState() here — ensureCurrent() will write once the new
    // session is created, avoiding an intermediate state that could confuse
    // any listener re-entering getCurrent().
    return ensureCurrent(mode);
  }

  function switchTo(id) {
    const s = state.sessions.find(x => x.id === id);
    if (!s) return null;
    if (MODES.indexOf(s.mode) >= 0) setCurrentFor(s.mode, id);
    writeState();
    return s;
  }

  function getById(id) {
    return state.sessions.find(x => x.id === id) || null;
  }

  function listAll() {
    return state.sessions.slice().sort((a, b) => b.updated - a.updated);
  }

  function remove(id) {
    state.sessions = state.sessions.filter(x => x.id !== id);
    if (state.currentId === id) state.currentId = null;
    if (state.currentByMode) {
      if (state.currentByMode.ai === id) state.currentByMode.ai = null;
      if (state.currentByMode.dr === id) state.currentByMode.dr = null;
      if (state.currentByMode.trace === id) state.currentByMode.trace = null;
      if (state.currentByMode.passage === id) state.currentByMode.passage = null;
    }
    writeState();
  }

  function clearAll() {
    state.sessions = [];
    state.currentId = null;
    state.currentByMode = emptyByMode();
    writeState();
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  // Cross-tab sync.
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      state = readState();
      listeners.forEach(fn => { try { fn(); } catch (_x) {} });
    }
  });

  window.ChatHistory = {
    load: () => { state = readState(); return state; },
    getCurrent: getCurrent,
    ensureCurrent: ensureCurrent,
    getById: getById,
    listAll: listAll,
    saveTurn: saveTurn,
    startNew: startNew,
    switchTo: switchTo,
    remove: remove,
    clearAll: clearAll,
    onChange: onChange,
  };

  // ---- Cloud sync (per-user, across devices) ----
  // Wires to the shared user_saves table via CloudAccount.bindSync so that
  // chat sessions follow the user across devices instead of being device-local.
  // Merges local + remote (union by session id, prefer newest 'updated').
  function mergeSessions(a, b) {
    const byId = Object.create(null);
    (a && a.sessions || []).forEach(s => { if (s && s.id) byId[s.id] = s; });
    (b && b.sessions || []).forEach(s => {
      if (!s || !s.id) return;
      const prev = byId[s.id];
      if (!prev || (s.updated || 0) > (prev.updated || 0)) byId[s.id] = s;
    });
    const list = Object.values(byId).sort((x, y) => (y.updated || 0) - (x.updated || 0));
    // Pick per-mode current pointers: prefer LOCAL so the user's most recent
    // action (e.g. clicking "New chat") is never overwritten by a stale remote
    // pull. Fall back to remote if local has none.
    const aCbm = (a && a.currentByMode) || {};
    const bCbm = (b && b.currentByMode) || {};
    const cbm = {
      ai: aCbm.ai || bCbm.ai || null,
      dr: aCbm.dr || bCbm.dr || null,
      trace: aCbm.trace || bCbm.trace || null,
      passage: aCbm.passage || bCbm.passage || null,
    };
    // Also honor a legacy top-level currentId from either side if per-mode is empty.
    const legacyCur = (a && a.currentId) || (b && b.currentId) || null;
    if (legacyCur && byId[legacyCur]) {
      const m = byId[legacyCur].mode;
      if (MODES.indexOf(m) >= 0 && !cbm[m]) cbm[m] = legacyCur;
    }
    // Drop pointers that no longer resolve to a real session.
    if (cbm.ai && !byId[cbm.ai]) cbm.ai = null;
    if (cbm.dr && !byId[cbm.dr]) cbm.dr = null;
    if (cbm.trace && !byId[cbm.trace]) cbm.trace = null;
    if (cbm.passage && !byId[cbm.passage]) cbm.passage = null;
    // Legacy currentId: keep the most recently-set per-mode pointer for
    // back-compat with any code path still reading state.currentId.
    const cur = cbm.ai || cbm.dr || cbm.trace || cbm.passage || null;
    return { sessions: list.slice(0, MAX_SESSIONS), currentByMode: cbm, currentId: cur };
  }

  function bindCloud() {
    if (cloudBinding || !window.CloudAccount || !window.CloudAccount.bindSync) return;
    cloudBinding = window.CloudAccount.bindSync('bp_chat_sessions_v1', {
      getLocal: () => state,
      setLocal: (remote) => {
        if (!remote || typeof remote !== 'object') return;
        // Merge remote with in-memory local (avoid clobbering unsaved edits)
        state = mergeSessions(state, remote);
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_e) {}
      },
      emptyValue: { sessions: [], currentId: null },
      onRemoteUpdate: () => {
        listeners.forEach(fn => { try { fn(); } catch (_e) {} });
      },
    });
  }

  if (window.CloudAccount && window.CloudAccount.bindSync) {
    bindCloud();
  } else {
    // Wait for account.js to load
    let tries = 0;
    const tick = setInterval(() => {
      if (window.CloudAccount && window.CloudAccount.bindSync) {
        clearInterval(tick);
        bindCloud();
      } else if (++tries > 40) {
        clearInterval(tick);
      }
    }, 250);
  }
})();
