/* activity-log.js
   Lightweight synced activity log for events that don't already produce
   persistent records (Reader passage opens, Word Study / Strong's lookups).
   Chat History, Builder Tray, Reader notes, and Reading Plans have their own
   cloud buckets — Study Journey reads from those directly. This log fills the
   gaps so the Journey timeline covers every tool.

   Public API:
     ActivityLog.log(kind, payload)       -> append event (rate-limited)
     ActivityLog.list(opts)               -> [{id, kind, payload, ts}], newest first
     ActivityLog.byKind(kind, limit?)     -> filtered
     ActivityLog.clear()                  -> wipe
     ActivityLog.onChange(fn)             -> subscribe

   Storage key: bp_activity_log_v1 (localStorage + cloud via CloudAccount.bindSync('activity_log'))
*/
(function () {
  'use strict';
  if (window.ActivityLog) return;

  var KEY = 'bp_activity_log_v1';
  var MAX = 500;                     // keep the log small; Journey shows recent
  var DEDUPE_MS = 60 * 1000;         // suppress identical events within 60s
  var safeLS = window.safeLS || localStorage;
  var listeners = [];
  var cloudBinding = null;

  function nowTs() { return Date.now(); }
  function newId() { return 'a_' + Math.random().toString(36).slice(2, 10) + nowTs().toString(36); }

  function load() {
    try {
      var raw = safeLS.getItem(KEY);
      if (!raw) return { events: [] };
      var v = JSON.parse(raw);
      if (!v || !Array.isArray(v.events)) return { events: [] };
      return v;
    } catch (_e) { return { events: [] }; }
  }

  function save(state) {
    try { safeLS.setItem(KEY, JSON.stringify(state)); } catch (_e) {}
    listeners.forEach(function (fn) { try { fn(); } catch (_x) {} });
  }

  function state() { return load(); }

  function isDupe(events, kind, payload) {
    if (!events || !events.length) return false;
    var recent = events[0];
    if (!recent || recent.kind !== kind) return false;
    if ((nowTs() - (recent.ts || 0)) > DEDUPE_MS) return false;
    // Compare stable identifiers per kind
    var a = payload || {}; var b = recent.payload || {};
    if (kind === 'reader_open') return a.ref === b.ref;
    if (kind === 'wordstudy_lookup') return (a.lemma || a.strongs) === (b.lemma || b.strongs);
    if (kind === 'strongs_lookup') return a.strongs === b.strongs;
    if (kind === 'atlas_open') return a.slug === b.slug;
    return false;
  }

  function log(kind, payload) {
    if (!kind) return null;
    var s = load();
    if (isDupe(s.events, kind, payload)) return null;
    var evt = { id: newId(), kind: String(kind), payload: payload || {}, ts: nowTs() };
    s.events.unshift(evt);
    if (s.events.length > MAX) s.events.length = MAX;
    save(s);
    return evt;
  }

  function list(opts) {
    var s = load();
    var out = s.events.slice();
    if (opts && opts.since) out = out.filter(function (e) { return (e.ts || 0) >= opts.since; });
    if (opts && opts.kinds && opts.kinds.length) {
      var set = {}; opts.kinds.forEach(function (k) { set[k] = 1; });
      out = out.filter(function (e) { return set[e.kind]; });
    }
    if (opts && opts.limit) out = out.slice(0, opts.limit);
    return out;
  }

  function byKind(kind, limit) { return list({ kinds: [kind], limit: limit || 50 }); }

  function clear() { save({ events: [] }); }

  function onChange(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  // ---- Merge helper for cloud sync ----
  function merge(a, b) {
    var byId = Object.create(null);
    ((a && a.events) || []).forEach(function (e) { if (e && e.id) byId[e.id] = e; });
    ((b && b.events) || []).forEach(function (e) {
      if (!e || !e.id) return;
      var prev = byId[e.id];
      if (!prev || (e.ts || 0) > (prev.ts || 0)) byId[e.id] = e;
    });
    var events = Object.values(byId).sort(function (x, y) { return (y.ts || 0) - (x.ts || 0); });
    return { events: events.slice(0, MAX) };
  }

  function bindCloud() {
    if (cloudBinding || !window.CloudAccount || !window.CloudAccount.bindSync) return;
    cloudBinding = window.CloudAccount.bindSync('activity_log', {
      getLocal: load,
      setLocal: function (remote) {
        if (!remote || typeof remote !== 'object') return;
        var merged = merge(load(), remote);
        try { safeLS.setItem(KEY, JSON.stringify(merged)); } catch (_e) {}
        // Notify listeners so Journey timeline re-renders after a cloud pull
        listeners.forEach(function (fn) { try { fn(); } catch (_x) {} });
      },
      emptyValue: { events: [] },
      onRemoteUpdate: function () { listeners.forEach(function (fn) { try { fn(); } catch (_x) {} }); }
    });
  }

  if (window.CloudAccount && window.CloudAccount.bindSync) bindCloud();
  else {
    var tries = 0;
    var tick = setInterval(function () {
      if (window.CloudAccount && window.CloudAccount.bindSync) { clearInterval(tick); bindCloud(); }
      else if (++tries > 40) clearInterval(tick);
    }, 250);
  }

  window.ActivityLog = { log: log, list: list, byKind: byKind, clear: clear, onChange: onChange, state: state };
})();
