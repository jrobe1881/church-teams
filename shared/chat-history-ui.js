/*
  chat-history-ui.js — Explorer History drawer
  --------------------------------------------------------------
  Adds a "History" button next to the Explorer input controls and
  opens a right-side drawer listing every past chat (both regular
  AI and Deep Research mode). Clicking a chat loads it into the
  matching view.

  Depends on:
    - /shared/chat-history.js (window.ChatHistory)
    - /shared/dr-mode.js       (window.DR — optional, used to switch mode)

  Public event dispatched on window when a session is opened:
    'bp:chat-history-open' with detail = { session }
*/
(function () {
  const $ = (s, r) => (r || document).querySelector(s);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function formatWhen(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const same = d.toDateString() === now.toDateString();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    const isYest = d.toDateString() === yest.toDateString();
    if (same) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    if (isYest) {
      return 'Yesterday ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function groupSessions(list) {
    const now = new Date();
    const today = [], yesterday = [], last7 = [], older = [];
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startYest = startToday - 86400000;
    const start7 = startToday - 7 * 86400000;
    list.forEach(s => {
      if (s.updated >= startToday) today.push(s);
      else if (s.updated >= startYest) yesterday.push(s);
      else if (s.updated >= start7) last7.push(s);
      else older.push(s);
    });
    return [
      { label: 'Today', items: today },
      { label: 'Yesterday', items: yesterday },
      { label: 'Previous 7 days', items: last7 },
      { label: 'Older', items: older },
    ].filter(g => g.items.length);
  }

  function injectCss() {
    if (document.getElementById('bp-hist-css')) return;
    const style = document.createElement('style');
    style.id = 'bp-hist-css';
    style.textContent = `
    .bp-hist-scrim{position:fixed;inset:0;background:rgba(20,17,15,.42);opacity:0;pointer-events:none;transition:opacity .18s ease;z-index:9998}
    .bp-hist-scrim.open{opacity:1;pointer-events:auto}
    .bp-hist-drawer{position:fixed;top:0;right:0;bottom:0;width:min(380px,92vw);background:var(--surface,#fff);border-left:1px solid var(--border,#e5e0d8);box-shadow:-8px 0 32px rgba(20,17,15,.14);transform:translateX(100%);transition:transform .22s cubic-bezier(.2,.7,.2,1);z-index:9999;display:flex;flex-direction:column;font-family:var(--font-sans,-apple-system,system-ui,sans-serif);padding-bottom:env(safe-area-inset-bottom,0)}
    .bp-hist-drawer.open{transform:translateX(0)}
    .bp-hist-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border,#e5e0d8);padding-top:max(14px,env(safe-area-inset-top,14px))}
    .bp-hist-title{font:600 15px var(--font-serif,Georgia,serif);color:var(--ink,#221c17)}
    .bp-hist-close{border:none;background:transparent;font-size:22px;line-height:1;color:var(--ink-2,#5c534b);cursor:pointer;padding:4px 8px;border-radius:6px;min-width:40px;min-height:40px;display:inline-flex;align-items:center;justify-content:center}
    .bp-hist-close:hover{background:var(--surface-2,#f7f3ec)}
    .bp-hist-body{flex:1;overflow-y:auto;padding:8px 0;-webkit-overflow-scrolling:touch}
    .bp-hist-empty{padding:32px 20px;text-align:center;color:var(--ink-3,#8a7f75);font-size:14px;line-height:1.5}
    .bp-hist-group{padding:6px 0}
    .bp-hist-group-label{padding:8px 16px 4px;font:600 11px var(--font-sans);color:var(--ink-3,#8a7f75);text-transform:uppercase;letter-spacing:.06em}
    .bp-hist-item{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:12px 16px;cursor:pointer;border-left:3px solid transparent;transition:background .12s ease,border-color .12s ease;min-height:48px}
    .bp-hist-item:hover{background:var(--surface-2,#f7f3ec);border-left-color:var(--accent,#7a1f2b)}
    .bp-hist-item.current{background:var(--accent-tint,rgba(122,31,43,.08));border-left-color:var(--accent,#7a1f2b)}
    .bp-hist-item-main{flex:1;min-width:0}
    .bp-hist-item-title{font:500 14px var(--font-sans);color:var(--ink,#221c17);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}
    .bp-hist-item-meta{font:400 12px var(--font-sans);color:var(--ink-3,#8a7f75);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .bp-hist-mode-pill{display:inline-flex;align-items:center;padding:1px 7px;border-radius:99px;font:600 10px var(--font-sans);text-transform:uppercase;letter-spacing:.04em;border:1px solid var(--border,#e5e0d8);color:var(--ink-2,#5c534b);background:var(--surface-2,#f7f3ec)}
    .bp-hist-mode-pill.is-dr{color:var(--accent,#7a1f2b);border-color:var(--accent,#7a1f2b);background:var(--accent-tint,rgba(122,31,43,.08))}
    .bp-hist-mode-pill.is-trace{color:#6b4a1f;border-color:#c9a45a;background:rgba(201,164,90,.12)}
    .bp-hist-mode-pill.is-passage{color:#1a5e38;border-color:#3a9e6b;background:rgba(58,158,107,.10)}
    .bp-hist-del{border:none;background:transparent;color:var(--ink-3,#8a7f75);cursor:pointer;padding:6px 8px;border-radius:6px;font-size:16px;line-height:1;opacity:0;transition:opacity .12s ease,background .12s ease;min-width:36px;min-height:36px;display:inline-flex;align-items:center;justify-content:center}
    .bp-hist-item:hover .bp-hist-del,.bp-hist-item:focus-within .bp-hist-del{opacity:1}
    @media(pointer:coarse){.bp-hist-del{opacity:.7}}
    .bp-hist-del:hover{background:var(--surface-2,#f7f3ec);color:var(--accent,#7a1f2b)}
    .bp-hist-foot{border-top:1px solid var(--border,#e5e0d8);padding:10px 16px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-shrink:0}
    .bp-hist-foot-btn{border:1px solid var(--border,#e5e0d8);background:transparent;color:var(--ink-2,#5c534b);padding:8px 12px;border-radius:6px;font:500 12px var(--font-sans);cursor:pointer;min-height:36px}
    .bp-hist-foot-btn:hover{border-color:var(--accent,#7a1f2b);color:var(--accent,#7a1f2b)}
    .bp-hist-btn{border:1px solid var(--border,#e5e0d8);background:transparent;color:var(--ink-2,#5c534b);padding:6px 10px;border-radius:6px;font:500 12px var(--font-sans);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
    .bp-hist-btn:hover{border-color:var(--accent,#7a1f2b);color:var(--accent,#7a1f2b)}
    .bp-hist-btn .ic{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8}
    @media(max-width:480px){.bp-hist-drawer{width:100vw;max-width:100vw;border-left:none;border-top:1px solid var(--border,#e5e0d8);top:auto;height:85dvh;border-radius:16px 16px 0 0;transform:translateY(100%)}.bp-hist-drawer.open{transform:translateY(0)}}
    `;
    document.head.appendChild(style);
  }

  function ensureShell() {
    let scrim = document.getElementById('bp-hist-scrim');
    let drawer = document.getElementById('bp-hist-drawer');
    if (scrim && drawer) return { scrim, drawer };
    injectCss();
    scrim = document.createElement('div');
    scrim.id = 'bp-hist-scrim';
    scrim.className = 'bp-hist-scrim';
    scrim.addEventListener('click', close);
    drawer = document.createElement('aside');
    drawer.id = 'bp-hist-drawer';
    drawer.className = 'bp-hist-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', 'Chat history');
    drawer.innerHTML = `
      <div class="bp-hist-head">
        <div class="bp-hist-title">Chat history</div>
        <button type="button" class="bp-hist-close" aria-label="Close history">×</button>
      </div>
      <div class="bp-hist-body" id="bp-hist-body"></div>
      <div class="bp-hist-foot">
        <span class="bp-hist-item-meta" id="bp-hist-count"></span>
        <button type="button" class="bp-hist-foot-btn" id="bp-hist-clear">Clear all</button>
      </div>`;
    document.body.appendChild(scrim);
    document.body.appendChild(drawer);
    drawer.querySelector('.bp-hist-close').addEventListener('click', close);
    drawer.querySelector('#bp-hist-clear').addEventListener('click', () => {
      if (!confirm('Delete every saved chat? This cannot be undone.')) return;
      window.ChatHistory.clearAll();
      renderList();
    });
    return { scrim, drawer };
  }

  function renderList() {
    const body = document.getElementById('bp-hist-body');
    if (!body) return;
    const all = window.ChatHistory ? window.ChatHistory.listAll() : [];
    // Ignore empty sessions (no turns).
    const list = all.filter(s => s.turns && s.turns.length);
    const count = document.getElementById('bp-hist-count');
    if (count) count.textContent = list.length + ' chat' + (list.length === 1 ? '' : 's');
    if (!list.length) {
      body.innerHTML = '<div class="bp-hist-empty">No saved chats yet.<br>Your conversations will appear here.</div>';
      return;
    }
    const state = window.ChatHistory.load();
    // Determine which session is currently active per-mode so all three mode
    // pointers light up correctly, not just the legacy single currentId.
    const activePtrs = (state.currentByMode) || {};
    const activeIds = new Set([
      activePtrs.ai, activePtrs.dr, activePtrs.trace, activePtrs.passage,
      state.currentId   // legacy fallback
    ].filter(Boolean));
    const groups = groupSessions(list);
    body.innerHTML = groups.map(g => `
      <div class="bp-hist-group">
        <div class="bp-hist-group-label">${esc(g.label)}</div>
        ${g.items.map(s => `
          <div class="bp-hist-item ${activeIds.has(s.id) ? 'current' : ''}" data-id="${esc(s.id)}" role="button" tabindex="0">
            <div class="bp-hist-item-main">
              <div class="bp-hist-item-title">${esc(s.title || 'Untitled chat')}</div>
              <div class="bp-hist-item-meta">
                <span class="bp-hist-mode-pill ${s.mode === 'dr' ? 'is-dr' : (s.mode === 'trace' ? 'is-trace' : (s.mode === 'passage' ? 'is-passage' : ''))}">${s.mode === 'dr' ? 'Deep Research' : (s.mode === 'trace' ? 'Doctrine Trace' : (s.mode === 'passage' ? 'Passage Guide' : 'AI'))}</span>
                <span>${s.turns.length} turn${s.turns.length === 1 ? '' : 's'}</span>
                <span>· ${esc(formatWhen(s.updated))}</span>
              </div>
            </div>
            <button type="button" class="bp-hist-del" data-del="${esc(s.id)}" aria-label="Delete chat">×</button>
          </div>
        `).join('')}
      </div>
    `).join('');

    body.querySelectorAll('.bp-hist-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target && e.target.dataset && e.target.dataset.del) return;
        const id = el.dataset.id;
        const session = window.ChatHistory && window.ChatHistory.getById(id);
        // Passage guide sessions are one-shot (not conversational), so clicking
        // a current one should re-open it, not deactivate it.
        if (el.classList.contains('current') && session && session.mode !== 'passage') {
          deactivateSession(id);
        } else {
          openSession(id);
        }
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const id = el.dataset.id;
          const session = window.ChatHistory && window.ChatHistory.getById(id);
          if (el.classList.contains('current') && session && session.mode !== 'passage') {
            deactivateSession(id);
          } else {
            openSession(id);
          }
        }
      });
    });
    body.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-del');
        window.ChatHistory.remove(id);
        renderList();
      });
    });
  }

  function open() {
    const { scrim, drawer } = ensureShell();
    renderList();
    scrim.classList.add('open');
    drawer.classList.add('open');
    document.addEventListener('keydown', onEsc);
  }
  function close() {
    const scrim = document.getElementById('bp-hist-scrim');
    const drawer = document.getElementById('bp-hist-drawer');
    if (scrim) scrim.classList.remove('open');
    if (drawer) drawer.classList.remove('open');
    document.removeEventListener('keydown', onEsc);
  }
  function onEsc(e) { if (e.key === 'Escape') close(); }

  function deactivateSession(id) {
    if (!window.ChatHistory) return;
    const s = window.ChatHistory.getById(id);
    if (!s) return;
    // Start a new empty session for this mode, clearing the active pointer.
    const empty = window.ChatHistory.startNew(s.mode);
    // Dispatch with the fresh empty session so existing handlers clear the view.
    if (s.mode === 'trace') {
      window.dispatchEvent(new CustomEvent('bp:doctrine-trace-open', { detail: { doctrine: '', trace: null } }));
    } else if (s.mode === 'dr') {
      // Turn DR off so the standard view is shown after deactivation.
      if (window.DR && typeof DR.isOn === 'function' && typeof DR.toggle === 'function') {
        if (DR.isOn()) DR.toggle(false);
      }
      // Clear DR convo by sending a non-DR session to bp:chat-history-open.
      window.dispatchEvent(new CustomEvent('bp:chat-history-open', { detail: { session: empty } }));
    } else {
      // For AI mode: send the empty session so renderHistoryOnly() clears #qanswer.
      window.dispatchEvent(new CustomEvent('bp:chat-history-open', { detail: { session: empty } }));
    }
    renderList();
    close();
  }

  function openSession(id) {
    if (!window.ChatHistory) return;
    const s = window.ChatHistory.switchTo(id);
    if (!s) return;
    // Dispatch first so listeners (explorer AI + dr-hook + doctrine-trace)
    // load the session's turns into their local state BEFORE the DR toggle
    // event fires and triggers a repaint.
    window.dispatchEvent(new CustomEvent('bp:chat-history-open', { detail: { session: s } }));

    if (s.mode === 'passage') {
      // Passage Guide sessions: re-display the passage without creating a new
      // history entry. Fire the dedicated recall event so passage-guide.js can
      // suppress its history-save path.
      const last = s.turns[s.turns.length - 1] || {};
      const ref = last.q || '';
      window.dispatchEvent(new CustomEvent('bp:passage-guide-recall', { detail: { ref } }));
      setTimeout(() => {
        const ans = document.getElementById('qanswer');
        if (ans && ans.scrollIntoView) ans.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
      close();
      return;
    }

    if (s.mode === 'trace') {
      // Doctrine Trace sessions: re-open the panel and re-render the last
      // trace from the stored turn.
      const last = s.turns[s.turns.length - 1] || {};
      window.dispatchEvent(new CustomEvent('bp:doctrine-trace-open', {
        detail: { doctrine: last.q || '', trace: last.trace || null }
      }));
      // Scroll the trace mount into view.
      setTimeout(() => {
        const host = document.getElementById('bpdt-mount');
        if (host && host.scrollIntoView) host.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
      close();
      return;
    }

    if (s.mode === 'dr') {
      // For DR sessions: ensure the toggle is ON, then fire a dedicated recall
      // event that dr-explorer-hook handles unconditionally regardless of prior
      // toggle state. This sidesteps the race between bp:dr-changed and
      // bp:chat-history-open where _drConvo may not be set in time.
      if (window.DR && typeof DR.isOn === 'function' && typeof DR.toggle === 'function') {
        if (!DR.isOn()) DR.toggle(true);
      }
      window.dispatchEvent(new CustomEvent('bp:dr-recall', { detail: { session: s } }));
    } else {
      // AI mode: ensure DR toggle is OFF so the AI view is shown.
      // DO NOT toggle when already off — toggling DR fires bp:dr-changed which
      // wipes #qanswer and would destroy the AI conversation just rendered.
      if (window.DR && typeof DR.isOn === 'function' && typeof DR.toggle === 'function') {
        if (DR.isOn()) DR.toggle(false);
      }
    }
    // Scroll the answer area into view so the loaded chat is visible.
    setTimeout(() => {
      const ans = document.getElementById('qanswer');
      if (ans && ans.scrollIntoView) ans.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    close();
  }

  // Public API.
  window.ChatHistoryUI = {
    open: open,
    close: close,
    render: renderList,
  };

  // Live-refresh the drawer whenever the underlying chat sessions change.
  // Without this, clicking "New chat" or asking a follow-up while the drawer
  // is open would leave the list stale until the drawer is closed and reopened.
  if (window.ChatHistory && typeof window.ChatHistory.onChange === 'function') {
    window.ChatHistory.onChange(function () {
      const drawer = document.getElementById('bp-hist-drawer');
      if (drawer && drawer.classList.contains('open')) {
        try { renderList(); } catch (_e) {}
      }
    });
  }

  // Auto-mount a "History" button next to the New chat / Ask AI cluster.
  // The Explorer top bar (#qqatop) is re-rendered by renderQaTop, so we
  // observe and re-inject as needed.
  function clearPage() {
    if (!window.ChatHistory) return;
    // Start fresh sessions for all three modes.
    const emptyAi = window.ChatHistory.startNew('ai');
    window.ChatHistory.startNew('dr');
    window.ChatHistory.startNew('trace');
    window.ChatHistory.startNew('passage');
    // Reset AI view (empty session → renderHistoryOnly clears #qanswer).
    window.dispatchEvent(new CustomEvent('bp:chat-history-open', { detail: { session: emptyAi } }));
    // Reset DR view by turning DR off if it's on.
    if (window.DR && typeof DR.isOn === 'function' && typeof DR.toggle === 'function') {
      if (DR.isOn()) DR.toggle(false);
    }
    // Reset Doctrine Trace panel.
    window.dispatchEvent(new CustomEvent('bp:doctrine-trace-open', { detail: { doctrine: '', trace: null } }));
    // Refresh the drawer list if it's open.
    const drawer = document.getElementById('bp-hist-drawer');
    if (drawer && drawer.classList.contains('open')) renderList();
  }

  function mountButton() {
    // Prefer the DR toggle host — it lives directly under the search input
    // and is always visible. Fallback to a fixed floating button.
    let btn = document.getElementById('bp-hist-btn');
    let clearBtn = document.getElementById('bp-hist-clear-btn');
    if (btn && btn.isConnected && clearBtn && clearBtn.isConnected) return;
    const drHost = document.getElementById('dr-toggle-host');
    const readerRail = document.getElementById('dr-reader-host'); // reader mount
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'bp-hist-btn';
      btn.type = 'button';
      btn.className = 'bp-hist-btn';
      btn.setAttribute('aria-label', 'Open chat history');
      btn.innerHTML = `
        <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        History`;
      btn.addEventListener('click', open);
    }
    if (!clearBtn) {
      clearBtn = document.createElement('button');
      clearBtn.id = 'bp-hist-clear-btn';
      clearBtn.type = 'button';
      clearBtn.className = 'bp-hist-btn';
      clearBtn.setAttribute('aria-label', 'Clear current chat');
      clearBtn.innerHTML = `
        <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        Clear`;
      clearBtn.addEventListener('click', clearPage);
    }
    const target = drHost || readerRail || null;
    if (target) {
      target.appendChild(btn);
      target.appendChild(clearBtn);
    } else {
      // Floating fallback — place near bottom-right, above any mobile nav.
      btn.style.cssText += ';position:fixed;right:14px;bottom:80px;z-index:400;background:var(--surface,#fff);box-shadow:0 4px 12px rgba(20,17,15,.12)';
      clearBtn.style.cssText += ';position:fixed;right:110px;bottom:80px;z-index:400;background:var(--surface,#fff);box-shadow:0 4px 12px rgba(20,17,15,.12)';
      document.body.appendChild(btn);
      document.body.appendChild(clearBtn);
    }
  }

  function init() {
    injectCss();
    mountButton();
    // Re-mount when Explorer re-renders its top bar (renderQaTop wipes it).
    const mo = new MutationObserver(() => mountButton());
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
