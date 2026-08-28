/* message-bank.js
   Personal Message Bank for My Study Journey.

   A "message" is a rich, scripture-anchored personal note — the intersection
   of a journal entry, a verse scrapbook, and a sermon-seed vault. Every message
   can be anchored to one or more verses, tied to a Study, starred, pinned,
   archived, and categorised. Full-text search, stats, and cloud sync are built in.

   Message shape:
     {
       id, title, body,            // core content
       category,                   // 'reflection' | 'prayer' | 'revelation' | 'sermon_seed' | 'encouragement' | 'note'
       verseRefs: [{ ref, text? }],// verse anchors (ref = "Romans 8:28")
       tags: string[],             // user-defined tags
       linkedStudyId: string|null, // optional Study folder link
       pinned: boolean,
       starred: boolean,
       archived: boolean,
       createdAt: number,
       updatedAt: number
     }

   Public API on window.MessageBank:
     ready                              -> Promise
     list(opts?)                        -> Message[]   (opts: { category?, tag?, archived?, starred?, pinned? })
     get(id)                            -> Message | null
     compose(opts)                      -> Message      (create)
     update(id, patch)                  -> Message | null
     remove(id)                         -> boolean      (permanent delete)
     archive(id)                        -> Message | null  (toggles archived)
     star(id)                           -> Message | null  (toggles starred)
     pin(id)                            -> Message | null  (toggles pinned)
     search(query, opts?)               -> Message[]    (full-text across title+body+tags+refs)
     stats()                            -> { total, byCategory:{}, topTags:[], streakDays, starredCount, pinnedCount }
     export(ids?)                       -> string       (plain-text export)
     onChange(fn)                       -> unsubscribe fn
*/
(function () {
  'use strict';
  if (window.MessageBank) return;

  var KEY = 'bp_message_bank_v1';
  var MAX_MESSAGES = 2000;
  var MAX_VERSE_REFS = 30;
  var MAX_TAGS = 20;
  var CATEGORIES = ['reflection', 'prayer', 'revelation', 'sermon_seed', 'encouragement', 'note'];

  var safeLS = window.safeLS || localStorage;
  var listeners = [];
  var cloudBinding = null;
  var readyResolve;
  var readyPromise = new Promise(function (r) { readyResolve = r; });

  /* ---- Utilities ---- */
  function ts() { return Date.now(); }
  function uid(pfx) {
    return (pfx || 'mb') + '_' + Math.random().toString(36).slice(2, 10) + ts().toString(36);
  }
  function norm(s) { return String(s || '').toLowerCase().trim(); }
  function clampStr(s, max) { return String(s || '').slice(0, max); }

  /* ---- Storage ---- */
  function load() {
    try {
      var raw = safeLS.getItem(KEY);
      if (!raw) return { messages: [] };
      var v = JSON.parse(raw);
      return (v && Array.isArray(v.messages)) ? v : { messages: [] };
    } catch (_e) { return { messages: [] }; }
  }

  function save(db) {
    try { safeLS.setItem(KEY, JSON.stringify(db)); } catch (_e) {}
    if (cloudBinding && cloudBinding.notifyLocalChange) {
      try { cloudBinding.notifyLocalChange(); } catch (_e) {}
    }
    notify();
  }

  function notify() {
    listeners.forEach(function (fn) { try { fn(); } catch (_e) {} });
  }

  /* ---- Normalise a raw message into a guaranteed-safe shape ---- */
  function normalise(m) {
    return {
      id: m.id,
      title: clampStr(m.title, 300),
      body: clampStr(m.body, 20000),
      category: CATEGORIES.indexOf(m.category) !== -1 ? m.category : 'note',
      verseRefs: Array.isArray(m.verseRefs)
        ? m.verseRefs.slice(0, MAX_VERSE_REFS).map(function (r) {
            return { ref: clampStr(r.ref || r, 120), text: clampStr(r.text, 500) };
          })
        : [],
      tags: Array.isArray(m.tags)
        ? m.tags.slice(0, MAX_TAGS).map(function (t) { return norm(t).slice(0, 60); }).filter(Boolean)
        : [],
      linkedStudyId: m.linkedStudyId || null,
      pinned: !!m.pinned,
      starred: !!m.starred,
      archived: !!m.archived,
      createdAt: m.createdAt || ts(),
      updatedAt: m.updatedAt || ts()
    };
  }

  /* ---- Sort: pinned first, then starred, then newest ---- */
  function sortMessages(arr) {
    return arr.slice().sort(function (a, b) {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (a.starred && !b.starred) return -1;
      if (!a.starred && b.starred) return 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }

  /* ---- Public: list ---- */
  function list(opts) {
    opts = opts || {};
    var all = load().messages;
    // Archived are hidden by default
    if (!opts.archived) all = all.filter(function (m) { return !m.archived; });
    else if (opts.archived === 'only') all = all.filter(function (m) { return !!m.archived; });
    if (opts.category) all = all.filter(function (m) { return m.category === opts.category; });
    if (opts.tag) {
      var t = norm(opts.tag);
      all = all.filter(function (m) { return m.tags.indexOf(t) !== -1; });
    }
    if (opts.starred) all = all.filter(function (m) { return !!m.starred; });
    if (opts.pinned)  all = all.filter(function (m) { return !!m.pinned; });
    if (opts.linkedStudyId) all = all.filter(function (m) { return m.linkedStudyId === opts.linkedStudyId; });
    return sortMessages(all);
  }

  /* ---- Public: get ---- */
  function get(id) {
    var all = load().messages;
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /* ---- Public: compose (create) ---- */
  function compose(opts) {
    opts = opts || {};
    var db = load();
    if (db.messages.length >= MAX_MESSAGES) return null;
    var title = String(opts.title || '').trim();
    var body  = String(opts.body || '').trim();
    if (!title && !body) return null;   // at minimum one of these must be present

    var msg = normalise({
      id: uid('msg'),
      title: title || body.slice(0, 80),
      body: body,
      category: opts.category || 'note',
      verseRefs: opts.verseRefs || [],
      tags: opts.tags || [],
      linkedStudyId: opts.linkedStudyId || null,
      pinned: false,
      starred: !!opts.starred,
      archived: false,
      createdAt: ts(),
      updatedAt: ts()
    });

    db.messages.unshift(msg);
    save(db);
    return msg;
  }

  /* ---- Public: update ---- */
  function update(id, patch) {
    var db = load();
    for (var i = 0; i < db.messages.length; i++) {
      if (db.messages[i].id !== id) continue;
      var m = db.messages[i];
      if (patch.title     != null) m.title     = clampStr(patch.title, 300);
      if (patch.body      != null) m.body      = clampStr(patch.body, 20000);
      if (patch.category  != null && CATEGORIES.indexOf(patch.category) !== -1) m.category = patch.category;
      if (Array.isArray(patch.verseRefs)) {
        m.verseRefs = patch.verseRefs.slice(0, MAX_VERSE_REFS).map(function (r) {
          return { ref: clampStr(r.ref || r, 120), text: clampStr(r.text, 500) };
        });
      }
      if (Array.isArray(patch.tags)) {
        m.tags = patch.tags.slice(0, MAX_TAGS).map(function (t) { return norm(t).slice(0, 60); }).filter(Boolean);
      }
      if (patch.linkedStudyId !== undefined) m.linkedStudyId = patch.linkedStudyId || null;
      m.updatedAt = ts();
      save(db);
      return m;
    }
    return null;
  }

  /* ---- Public: remove (permanent) ---- */
  function remove(id) {
    var db = load();
    var before = db.messages.length;
    db.messages = db.messages.filter(function (m) { return m.id !== id; });
    if (db.messages.length === before) return false;
    save(db);
    return true;
  }

  /* ---- Toggle helpers ---- */
  function _toggle(id, field) {
    var db = load();
    for (var i = 0; i < db.messages.length; i++) {
      if (db.messages[i].id !== id) continue;
      db.messages[i][field] = !db.messages[i][field];
      db.messages[i].updatedAt = ts();
      save(db);
      return db.messages[i];
    }
    return null;
  }

  function archive(id) { return _toggle(id, 'archived'); }
  function star(id)    { return _toggle(id, 'starred'); }
  function pin(id)     { return _toggle(id, 'pinned'); }

  /* ---- Public: search ---- */
  function search(query, opts) {
    if (!query || !query.trim()) return list(opts);
    var words = norm(query).split(/\s+/).filter(Boolean);
    var candidates = list(Object.assign({ archived: opts && opts.archived }, opts || {}));
    return candidates.filter(function (m) {
      var haystack = [
        norm(m.title),
        norm(m.body),
        m.tags.join(' '),
        m.verseRefs.map(function (r) { return norm(r.ref); }).join(' ')
      ].join(' ');
      return words.every(function (w) { return haystack.indexOf(w) !== -1; });
    });
  }

  /* ---- Public: stats ---- */
  function stats() {
    var all = load().messages.filter(function (m) { return !m.archived; });
    var byCategory = {};
    CATEGORIES.forEach(function (c) { byCategory[c] = 0; });
    var tagFreq = {};
    var starredCount = 0;
    var pinnedCount = 0;
    var days = {};

    all.forEach(function (m) {
      byCategory[m.category] = (byCategory[m.category] || 0) + 1;
      if (m.starred) starredCount++;
      if (m.pinned)  pinnedCount++;
      m.tags.forEach(function (t) { tagFreq[t] = (tagFreq[t] || 0) + 1; });
      if (m.createdAt) {
        var d = new Date(m.createdAt);
        var dk = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
        days[dk] = 1;
      }
    });

    // streak days written
    var streak = 0;
    var probe = new Date();
    for (var i = 0; i < 365; i++) {
      var k = probe.getFullYear() + '-' + (probe.getMonth() + 1) + '-' + probe.getDate();
      if (days[k]) { streak++; probe.setDate(probe.getDate() - 1); }
      else if (i === 0) { probe.setDate(probe.getDate() - 1); }
      else break;
    }

    var topTags = Object.keys(tagFreq)
      .sort(function (a, b) { return tagFreq[b] - tagFreq[a]; })
      .slice(0, 10);

    return { total: all.length, byCategory: byCategory, topTags: topTags, streakDays: streak, starredCount: starredCount, pinnedCount: pinnedCount };
  }

  /* ---- Public: export ---- */
  function exportMessages(ids) {
    var msgs = ids
      ? ids.map(get).filter(Boolean)
      : list();
    return msgs.map(function (m) {
      var lines = [];
      lines.push('# ' + (m.title || 'Untitled'));
      lines.push('Category: ' + m.category);
      if (m.verseRefs.length) {
        lines.push('Verses: ' + m.verseRefs.map(function (r) { return r.ref; }).join(', '));
      }
      if (m.tags.length) lines.push('Tags: ' + m.tags.join(', '));
      lines.push('');
      if (m.body) lines.push(m.body);
      lines.push('');
      lines.push('— ' + new Date(m.createdAt).toLocaleDateString());
      return lines.join('\n');
    }).join('\n\n---\n\n');
  }

  /* ---- onChange ---- */
  function onChange(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  /* ---- Cloud sync ---- */
  function mergeMessages(a, b) {
    var byId = Object.create(null);
    ((a && a.messages) || []).forEach(function (m) { if (m && m.id) byId[m.id] = m; });
    ((b && b.messages) || []).forEach(function (m) {
      if (!m || !m.id) return;
      var prev = byId[m.id];
      if (!prev || (m.updatedAt || 0) > (prev.updatedAt || 0)) {
        byId[m.id] = m;
      } else {
        // Merge boolean flags: OR them so a star/pin on either side is kept
        var w = byId[m.id];
        w.starred = w.starred || m.starred;
        w.pinned  = w.pinned  || m.pinned;
        byId[m.id] = w;
      }
    });
    var msgs = Object.values(byId).sort(function (x, y) { return (y.updatedAt || 0) - (x.updatedAt || 0); });
    return { messages: msgs.slice(0, MAX_MESSAGES) };
  }

  var didFirstPull = false;
  function safeReady() { if (readyResolve) { var r = readyResolve; readyResolve = null; r(); } }

  function bindCloud() {
    if (cloudBinding || !window.CloudAccount || !window.CloudAccount.bindSync) { safeReady(); return; }
    cloudBinding = window.CloudAccount.bindSync('message_bank', {
      getLocal: load,
      setLocal: function (remote) {
        if (!remote || typeof remote !== 'object') return;
        var merged = mergeMessages(load(), remote);
        try { safeLS.setItem(KEY, JSON.stringify(merged)); } catch (_e) {}
        if (!didFirstPull) { didFirstPull = true; safeReady(); }
        notify();
      },
      emptyValue: { messages: [] },
      onRemoteUpdate: notify
    });
    setTimeout(safeReady, 1500);
  }

  if (window.CloudAccount && window.CloudAccount.bindSync) bindCloud();
  else {
    var tries = 0;
    var tick = setInterval(function () {
      if (window.CloudAccount && window.CloudAccount.bindSync) { clearInterval(tick); bindCloud(); }
      else if (++tries > 40) { clearInterval(tick); safeReady(); }
    }, 250);
  }

  window.MessageBank = {
    ready: readyPromise,
    CATEGORIES: CATEGORIES,
    list: list,
    get: get,
    compose: compose,
    update: update,
    remove: remove,
    archive: archive,
    star: star,
    pin: pin,
    search: search,
    stats: stats,
    export: exportMessages,
    onChange: onChange
  };
})();
