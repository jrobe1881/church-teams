/* split-bus.js — cross-frame verse linking for Bible Parlor split view.
 *
 * Loaded on every tool page. Does nothing unless the page is embedded inside
 * the /split/ shell.
 *
 * OUTBOUND (any tool):
 *   Any click on:
 *     • An element with [data-verse-ref] or [data-canonical]
 *     • An <a href="/read/#b=XXX&c=N&v=N"> or href="/read/#ref=..."
 *     • Elements matching common verse-anchor classes (.verse-ref, .bp-vref, .dr-verse-ref, .cite-verse)
 *   is broadcast as { type: 'bp:verse-open', ref, canonical } to the shell.
 *
 * INBOUND (only Reader currently handles it):
 *   { type: 'bp:navigate-verse', ref, canonical } — Reader loads the verse.
 */

(function () {
  'use strict';

  var inSplit = false;
  try {
    inSplit = (window.parent && window.parent !== window
               && /^\/split\/?/.test((new URL(document.referrer || '', location.origin)).pathname || ''));
  } catch (_e) { inSplit = false; }

  // If document.referrer is empty (deep-link), fall back to a hint: our
  // parent's origin equals ours and we can safely postMessage a handshake.
  // We attempt both entry points regardless — cost is one postMessage.
  if (!inSplit) {
    try {
      if (window.parent && window.parent !== window) {
        // Ask the shell for a signal; if it's the split shell it will reply.
        window.parent.postMessage({ type: 'bp:split-ping' }, location.origin);
      }
    } catch (_e) { /* noop */ }
  }

  function sendUp(msg) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(msg, location.origin);
      }
    } catch (_e) { /* noop */ }
  }

  // Parse a verse ref out of any node. Return { ref, canonical } or null.
  // Recognized inputs (in priority order):
  //   1. data-canonical="ACT.2.38"
  //   2. data-verse-ref="Acts 2:38"
  //   3. href="/read/#b=ACT&c=2&v=38"
  //   4. href="/read/#ref=Acts+2:38"
  function extractRef(el) {
    if (!el) return null;
    var canonical = el.getAttribute && el.getAttribute('data-canonical');
    var ref       = el.getAttribute && el.getAttribute('data-verse-ref');
    if (canonical || ref) return { ref: ref || canonical, canonical: canonical || '' };

    var href = el.getAttribute && el.getAttribute('href');
    if (href) {
      // /read/#b=ACT&c=2&v=38
      var m = href.match(/\/read\/#(?:.*&)?b=([A-Z0-9]+)&c=(\d+)&v=(\d+)/i);
      if (m) return { ref: '', canonical: m[1].toUpperCase() + '.' + m[2] + '.' + m[3] };
      // /read/#ref=Acts+2:38
      m = href.match(/\/read\/#(?:.*&)?ref=([^&]+)/i);
      if (m) {
        try { return { ref: decodeURIComponent(m[1].replace(/\+/g, ' ')), canonical: '' }; }
        catch (_e) { return { ref: m[1], canonical: '' }; }
      }
    }
    return null;
  }

  // Delegate click handler with a small anchor selector list.
  var SELECTOR = [
    '[data-verse-ref]',
    '[data-canonical]',
    '.verse-ref',
    '.bp-vref',
    '.dr-verse-ref',
    '.cite-verse',
    'a[href*="/read/#b="]',
    'a[href*="/read/#ref="]',
  ].join(',');

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest(SELECTOR) : null;
    if (!el) return;
    // If we're inside the split shell, hijack the click and broadcast.
    // Otherwise let the normal navigation happen.
    if (!inSplit) return;
    var info = extractRef(el);
    if (!info) return;
    // If this element is a normal link, prevent navigation of this pane and
    // send it to the sibling pane instead. Reader pane keeps its own click
    // behavior (it doesn't need to broadcast because it's already the target).
    if (el.tagName === 'A') e.preventDefault();
    sendUp({ type: 'bp:verse-open', ref: info.ref, canonical: info.canonical });
  }, true);

  // ---------- Inbound (Reader only actually navigates) ----------
  window.addEventListener('message', function (e) {
    if (!e || !e.data || typeof e.data !== 'object') return;

    // Handshake reply from shell confirms we're embedded.
    if (e.data.type === 'bp:split-hello') { inSplit = true; return; }

    if (e.data.type !== 'bp:navigate-verse') return;

    // Only the Reader has a meaningful "navigate to verse" implementation.
    var isReader = /^\/read\/?/.test(location.pathname);
    if (!isReader) return;

    var canonical = String(e.data.canonical || '');
    var ref       = String(e.data.ref || '');

    if (canonical) {
      var m = canonical.match(/^([A-Z0-9]+)\.(\d+)\.(\d+)/i);
      if (m) {
        location.hash = '#b=' + m[1].toUpperCase() + '&c=' + m[2] + '&v=' + m[3];
        if (typeof window.loadFromHash === 'function') {
          try { window.loadFromHash(); } catch (_e) {}
        }
        return;
      }
    }
    if (ref) {
      location.hash = '#ref=' + encodeURIComponent(ref);
      if (typeof window.loadFromHash === 'function') {
        try { window.loadFromHash(); } catch (_e) {}
      }
    }
  });
})();
