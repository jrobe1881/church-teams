/* journey-studies.js
   User-created "Study" folders for My Study Journey.

   A Study is a personal folder the user creates from any tool, into which they
   can drop any of Bible Parlor's persistent items (verses, notes, chats,
   sermons, tray snippets, etc.) as *references* — items point back to their
   source bucket rather than duplicating the content. This keeps studies live:
   editing the source updates what the Study shows.

   Study shape:
     { id, title, description, color, tags[], items[], created, updated }

   Item shape (a reference):
     { id, kind, ref, canonical?, label?, source?, ts, note? }
     kinds: 'verse' | 'chat' | 'note' | 'tray' | 'sermon' | 'wordstudy' | 'strongs'
            | 'reading_plan' | 'passage_guide' | 'link'

   Public API on window.JourneyStudies:
     ready                             -> Promise (resolves once first pull done)
     list()                            -> Study[]
     get(id)                           -> Study | null
     create({title, description?, color?, tags?}) -> Study
     update(id, patch)                 -> Study | null
     remove(id)                        -> boolean
     addItem(studyId, item)            -> Item | null
     removeItem(studyId, itemId)       -> boolean
     onChange(fn)                      -> unsubscribe fn
*/
(function () {
  'use strict';
  if (window.JourneyStudies) return;

  var KEY = 'bp_journey_studies_v1';
  var ACTIVE_KEY = 'bp_active_study_id_v1';
  var MAX_STUDIES = 200;
  var MAX_ITEMS_PER_STUDY = 500;
  var safeLS = window.safeLS || localStorage;
  var listeners = [];
  var cloudBinding = null;
  var readyResolve;
  var readyPromise = new Promise(function (r) { readyResolve = r; });

  function ts() { return Date.now(); }
  function newId(prefix) { return (prefix || 'j') + '_' + Math.random().toString(36).slice(2, 10) + ts().toString(36); }

  function load() {
    try {
      var raw = safeLS.getItem(KEY);
      if (!raw) return { studies: [] };
      var v = JSON.parse(raw);
      if (!v || !Array.isArray(v.studies)) return { studies: [] };
      return v;
    } catch (_e) { return { studies: [] }; }
  }
  function save(s) {
    try { safeLS.setItem(KEY, JSON.stringify(s)); } catch (_e) {}
    fireChange();
    // Push to cloud on every mutation
    if (cloudBinding && cloudBinding.notifyLocalChange) {
      try { cloudBinding.notifyLocalChange(); } catch (_e) {}
    }
  }
  function fireChange() { listeners.forEach(function (fn) { try { fn(); } catch (_x) {} }); }

  function list() { return load().studies.slice().sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); }); }
  function get(id) {
    var s = load().studies;
    for (var i = 0; i < s.length; i++) if (s[i].id === id) return s[i];
    return null;
  }
  function create(input) {
    input = input || {};
    var st = load();
    if (st.studies.length >= MAX_STUDIES) return null;
    var study = {
      id: newId('sty'),
      title: String(input.title || 'Untitled study').trim().slice(0, 200),
      description: String(input.description || '').slice(0, 2000),
      color: input.color || 'burgundy',
      tags: Array.isArray(input.tags) ? input.tags.slice(0, 20).map(String) : [],
      items: [],
      created: ts(),
      updated: ts()
    };
    st.studies.unshift(study);
    save(st);
    return study;
  }
  function update(id, patch) {
    var st = load();
    for (var i = 0; i < st.studies.length; i++) {
      if (st.studies[i].id === id) {
        var cur = st.studies[i];
        if (patch.title != null) cur.title = String(patch.title).trim().slice(0, 200);
        if (patch.description != null) cur.description = String(patch.description).slice(0, 2000);
        if (patch.color != null) cur.color = String(patch.color);
        if (Array.isArray(patch.tags)) cur.tags = patch.tags.slice(0, 20).map(String);
        cur.updated = ts();
        save(st);
        return cur;
      }
    }
    return null;
  }
  function remove(id) {
    var st = load();
    var before = st.studies.length;
    st.studies = st.studies.filter(function (s) { return s.id !== id; });
    if (st.studies.length === before) return false;
    save(st);
    return true;
  }

  function addItem(studyId, item) {
    if (!studyId || !item || !item.kind) return null;
    var st = load();
    for (var i = 0; i < st.studies.length; i++) {
      if (st.studies[i].id === studyId) {
        var s = st.studies[i];
        // De-dupe: same kind + same ref/label within a study
        var key = itemKey(item);
        var already = s.items.find(function (it) { return itemKey(it) === key; });
        if (already) { already.ts = ts(); s.updated = ts(); save(st); return already; }
        var itm = {
          id: newId('itm'),
          kind: String(item.kind),
          ref: item.ref || null,
          canonical: item.canonical || null,
          label: item.label || null,
          source: item.source || null,
          note: item.note || '',
          extra: item.extra || null,
          ts: ts()
        };
        s.items.unshift(itm);
        if (s.items.length > MAX_ITEMS_PER_STUDY) s.items.length = MAX_ITEMS_PER_STUDY;
        s.updated = ts();
        save(st);
        return itm;
      }
    }
    return null;
  }
  function removeItem(studyId, itemId) {
    var st = load();
    for (var i = 0; i < st.studies.length; i++) {
      if (st.studies[i].id === studyId) {
        var s = st.studies[i];
        var before = s.items.length;
        s.items = s.items.filter(function (it) { return it.id !== itemId; });
        if (s.items.length === before) return false;
        s.updated = ts();
        save(st);
        return true;
      }
    }
    return false;
  }
  function itemKey(it) {
    return [it.kind, it.ref || '', it.canonical || '', it.label || ''].join('|');
  }

  // ---- Active Study (site-wide selection) ----
  function getActive() {
    try {
      var id = safeLS.getItem(ACTIVE_KEY);
      if (!id) return null;
      return get(id) || null;   // validate the study still exists
    } catch (_e) { return null; }
  }
  function setActive(id) {
    try {
      if (id) safeLS.setItem(ACTIVE_KEY, String(id));
      else safeLS.removeItem(ACTIVE_KEY);
    } catch (_e) {}
    fireChange();
  }

  function onChange(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  // ---- Cloud sync ----
  function mergeStudies(a, b) {
    var byId = Object.create(null);
    ((a && a.studies) || []).forEach(function (s) { if (s && s.id) byId[s.id] = s; });
    ((b && b.studies) || []).forEach(function (s) {
      if (!s || !s.id) return;
      var prev = byId[s.id];
      if (!prev) { byId[s.id] = s; return; }
      // Newest updated wins for metadata; merge items by id (newest ts wins)
      var winner = ((s.updated || 0) > (prev.updated || 0)) ? s : prev;
      var loser  = winner === s ? prev : s;
      var itemsById = Object.create(null);
      (loser.items || []).forEach(function (it) { if (it && it.id) itemsById[it.id] = it; });
      (winner.items || []).forEach(function (it) {
        if (!it || !it.id) return;
        var p = itemsById[it.id];
        if (!p || (it.ts || 0) > (p.ts || 0)) itemsById[it.id] = it;
      });
      winner.items = Object.values(itemsById).sort(function (x, y) { return (y.ts || 0) - (x.ts || 0); });
      byId[s.id] = winner;
    });
    var studies = Object.values(byId).sort(function (x, y) { return (y.updated || 0) - (x.updated || 0); });
    return { studies: studies.slice(0, MAX_STUDIES) };
  }

  var didFirstPull = false;
  function bindCloud() {
    if (cloudBinding || !window.CloudAccount || !window.CloudAccount.bindSync) { safeReady(); return; }
    cloudBinding = window.CloudAccount.bindSync('study_journeys', {
      getLocal: load,
      setLocal: function (remote) {
        if (!remote || typeof remote !== 'object') return;
        var merged = mergeStudies(load(), remote);
        try { safeLS.setItem(KEY, JSON.stringify(merged)); } catch (_e) {}
        if (!didFirstPull) { didFirstPull = true; safeReady(); }
        // Notify listeners so Journey page re-renders after a cloud pull
        fireChange();
      },
      emptyValue: { studies: [] },
      onRemoteUpdate: fireChange
    });
    // If already signed-in, first pull will fire; otherwise resolve after a beat
    setTimeout(safeReady, 1500);
  }
  function safeReady() { if (readyResolve) { var r = readyResolve; readyResolve = null; r(); } }

  if (window.CloudAccount && window.CloudAccount.bindSync) bindCloud();
  else {
    var tries = 0;
    var tick = setInterval(function () {
      if (window.CloudAccount && window.CloudAccount.bindSync) { clearInterval(tick); bindCloud(); }
      else if (++tries > 40) { clearInterval(tick); safeReady(); }
    }, 250);
  }

  window.JourneyStudies = {
    ready: readyPromise,
    list: list, get: get, create: create, update: update, remove: remove,
    addItem: addItem, removeItem: removeItem, onChange: onChange,
    getActive: getActive, setActive: setActive
  };
})();
