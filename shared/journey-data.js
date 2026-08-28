/* journey-data.js
   Aggregator layer for My Study Journey. Reads from every existing synced
   bucket (chat history, Builder Tray, Reader notes, reading plans, sermons,
   activity log, saved topics) and produces a unified timeline + rollups.

   No storage of its own — this is a view over the other buckets. It reruns
   whenever any bucket fires an update, so the dashboard/timeline stay live.

   Public API on window.JourneyData:
     ready                              -> Promise
     dashboard()                        -> { streakDays, lastPassage, activeStudyId, planStatus,
                                             counts: {verses,chats,notes,tray,studies,lookups},
                                             recentActivity: TimelineEvent[10] }
     timeline({kinds?, since?, limit?}) -> TimelineEvent[]
     onChange(fn)                       -> unsubscribe fn

   TimelineEvent shape (unified across sources):
     { id, kind, source, ts, title, subtitle?, ref?, canonical?, url?, meta? }
     kind: 'chat' | 'tray_add' | 'note' | 'reader_open' | 'wordstudy' | 'strongs'
           | 'reading_plan' | 'sermon_edit' | 'passage_guide' | 'saved_topic'
*/
(function () {
  'use strict';
  if (window.JourneyData) return;

  var safeLS = window.safeLS || localStorage;
  var listeners = [];
  var readyResolve; var readyPromise = new Promise(function (r) { readyResolve = r; });
  var didReady = false;

  function fireReady() { if (!didReady && readyResolve) { didReady = true; readyResolve(); } }
  function fire() { listeners.forEach(function (fn) { try { fn(); } catch (_x) {} }); }

  // ---- Safe readers for each bucket (localStorage first; cloud-sync writes to LS) ----
  function readJSON(key, fallback) {
    try {
      var raw = safeLS.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_e) { return fallback; }
  }

  function chatSessions() {
    var v = readJSON('bp_chat_sessions_v1', { sessions: [] });
    return (v && v.sessions) || [];
  }
  function notebookNotes() {
    // BibleNotebook (notebook-drawer.js) stores: { notes:[{id,title,body,refs,createdAt,updatedAt}] }
    if (window.BibleNotebook && window.BibleNotebook.list) return window.BibleNotebook.list();
    var v = readJSON('bible_study_notebook_v1', { notes: [] });
    return (v && Array.isArray(v.notes)) ? v.notes : [];
  }
  function bibleNotes() {
    // Reader writes plain strings to 'bible_user_notes_v1': { "GEN.1.1": "note text" }
    // Cloud-sync aliases: 'bp_bible_user_notes_v1', 'bible_notes_v1' (both stale names in account.js)
    // Try all three keys, merge so no notes are lost.
    var a = readJSON('bible_user_notes_v1', {}) || {};
    var b = readJSON('bp_bible_user_notes_v1', {}) || {};
    var c = readJSON('bible_notes_v1', {}) || {};
    // Merge: a is canonical; b and c fill in gaps
    var out = Object.assign({}, c, b, a);
    return out;
  }
  function trayItems() {
    // BuilderTray (notebook-drawer.js) writes to 'builder_tray'.
    // 'bp_builder_tray_v1' is a stale/wrong key — kept as fallback only.
    // Prefer live BuilderTray.items() when available (same-tab).
    if (window.BuilderTray && window.BuilderTray.items) return window.BuilderTray.items();
    var v = readJSON('builder_tray', null);
    if (Array.isArray(v)) return v;
    var v2 = readJSON('bp_builder_tray_v1', []);
    return Array.isArray(v2) ? v2 : [];
  }
  function readingPlans() {
    // BshPlans stores to 'bsh_reading_plans_v1'; prefer live data if BshPlans loaded
    if (window.BshPlans && window.BshPlans.getProgress) return window.BshPlans.getProgress();
    return readJSON('bsh_reading_plans_v1', {}) || {};
  }
  function sermons() {
    return readJSON('bp_builder_docs_v1', []) || [];
  }
  function savedTopics() {
    return readJSON('bp_topic_saved_searches_v1', []) || [];
  }
  function activityEvents() {
    var v = readJSON('bp_activity_log_v1', { events: [] });
    return (v && v.events) || [];
  }

  // ---- Normalizers: source-specific -> TimelineEvent ----
  function chatToEvent(session) {
    if (!session || !session.id) return null;
    // Skip sessions with no turns — they have no title and show as "Conversation"
    if (!session.turns || !session.turns.length) return null;
    var mode = session.mode || 'ai';
    var modeLabel = ({ ai: 'Explorer', dr: 'Deep Research', trace: 'Doctrine Trace' })[mode] || 'Chat';
    // Title: stored title (first question) → first turn's question → first turn's prompt.
    // Never fall back to "Conversation" — if there's no question text at all, skip the event.
    var firstQ = session.turns[0] && (session.turns[0].q || session.turns[0].prompt);
    var title = session.title || firstQ;
    if (!title) return null;
    var url;
    if (mode === 'trace') url = '/explorer/#trace=' + encodeURIComponent(session.id);
    else if (mode === 'dr') url = '/explorer/#dr=' + encodeURIComponent(session.id);
    else url = '/explorer/#chat=' + encodeURIComponent(session.id);
    return {
      id: 'chat:' + session.id,
      kind: 'chat',
      source: modeLabel,
      ts: session.updated || session.created || 0,
      title: String(title).slice(0, 160),
      subtitle: (session.turns ? session.turns.length : 0) + ' turn' + ((session.turns && session.turns.length === 1) ? '' : 's'),
      url: url,
      meta: { sessionId: session.id, mode: mode }
    };
  }

  function noteToEvent(key, entry) {
    if (!entry) return null;
    // Reader stores notes as plain strings: entry = "note text"
    // Older/object shape: { text, updated, highlight, bookmark }
    var text, ts, hasHighlight, hasBookmark;
    if (typeof entry === 'string') {
      if (!entry.trim()) return null;
      text = entry.trim();
      ts = 0; hasHighlight = false; hasBookmark = false;
    } else {
      if (!entry.text && !entry.highlight && !entry.bookmark) return null;
      text = entry.text ? String(entry.text).trim() : null;
      ts = entry.updated || entry.ts || 0;
      hasHighlight = !!entry.highlight;
      hasBookmark = !!entry.bookmark;
    }
    var ref = keyToRef(key);
    var parts = String(key).split('.');
    return {
      id: 'note:' + key,
      kind: 'note',
      source: 'Reader',
      ts: ts,
      title: ref,
      subtitle: text ? text.slice(0, 120) : (hasHighlight ? 'Highlighted' : 'Bookmarked'),
      ref: ref,
      canonical: key,
      url: '/read/#b=' + (parts[0] || '') + '&c=' + (parts[1] || '1') + '&v=' + (parts[2] || '1'),
      meta: { hasText: !!text, hasHighlight: hasHighlight, hasBookmark: hasBookmark }
    };
  }
  function keyToRef(key) {
    // "GEN.1.1" -> "Genesis 1:1" (best-effort; falls back to raw)
    var parts = String(key).split('.');
    if (parts.length !== 3) return key;
    var book = BOOK_NAMES[parts[0]] || parts[0];
    return book + ' ' + parts[1] + ':' + parts[2];
  }
  var BOOK_NAMES = {
    GEN:'Genesis',EXO:'Exodus',LEV:'Leviticus',NUM:'Numbers',DEU:'Deuteronomy',JOS:'Joshua',JDG:'Judges',RUT:'Ruth',
    '1SA':'1 Samuel','2SA':'2 Samuel','1KI':'1 Kings','2KI':'2 Kings','1CH':'1 Chronicles','2CH':'2 Chronicles',
    EZR:'Ezra',NEH:'Nehemiah',EST:'Esther',JOB:'Job',PSA:'Psalms',PRO:'Proverbs',ECC:'Ecclesiastes',SNG:'Song of Solomon',
    ISA:'Isaiah',JER:'Jeremiah',LAM:'Lamentations',EZK:'Ezekiel',DAN:'Daniel',HOS:'Hosea',JOL:'Joel',AMO:'Amos',
    OBA:'Obadiah',JON:'Jonah',MIC:'Micah',NAM:'Nahum',HAB:'Habakkuk',ZEP:'Zephaniah',HAG:'Haggai',ZEC:'Zechariah',MAL:'Malachi',
    MAT:'Matthew',MRK:'Mark',LUK:'Luke',JHN:'John',ACT:'Acts',ROM:'Romans','1CO':'1 Corinthians','2CO':'2 Corinthians',
    GAL:'Galatians',EPH:'Ephesians',PHP:'Philippians',COL:'Colossians','1TH':'1 Thessalonians','2TH':'2 Thessalonians',
    '1TI':'1 Timothy','2TI':'2 Timothy',TIT:'Titus',PHM:'Philemon',HEB:'Hebrews',JAS:'James','1PE':'1 Peter','2PE':'2 Peter',
    '1JN':'1 John','2JN':'2 John','3JN':'3 John',JUD:'Jude',REV:'Revelation'
  };
  try { window.__BOOK_NAMES__ = BOOK_NAMES; } catch(_e){}

  function trayToEvent(it, idx) {
    if (!it) return null;
    var kind = 'tray_add';
    var title, subtitle;
    if (it.kind === 'verse') {
      title = it.ref || 'Verse';
      var src = (typeof it.source === 'object' && it.source !== null)
        ? (it.source.source || it.source.tool || 'a tool')
        : (it.source || 'a tool');
      subtitle = 'Saved from ' + src;
    } else if (it.kind === 'word') {
      var p = it.payload || {};
      title = p.strong || p.lemma || 'Word entry';
      subtitle = p.gloss || (p.lang === 'G' ? 'Greek entry' : 'Hebrew entry');
    } else {
      title = it.label || it.title || 'Text snippet';
      subtitle = String(it.text || '').slice(0, 120);
    }
    return {
      id: 'tray:' + (it.id || idx),
      kind: kind,
      source: 'Builder Tray',
      // BuilderTray stores addedAt; older keys used ts or added
      ts: it.addedAt || it.ts || it.added || 0,
      title: String(title).slice(0, 160),
      subtitle: subtitle,
      ref: it.ref || null,
      canonical: it.canonical || null,
      url: it.ref ? '/read/?ref=' + encodeURIComponent(it.ref) : null,
      meta: { trayKind: it.kind, item: it }
    };
  }

  function notebookNoteToEvent(note) {
    // note shape: { id, title, body, refs:[{ref,text,sourceTool,addedAt}], createdAt, updatedAt }
    if (!note || !note.id) return null;
    var hasContent = (note.body && note.body.trim()) || (note.refs && note.refs.length);
    if (!hasContent && (!note.title || note.title === 'Untitled note')) return null;
    var subtitle = note.body ? String(note.body).trim().slice(0, 120) : '';
    if (!subtitle && note.refs && note.refs.length) {
      subtitle = note.refs.map(function (r) { return r.ref; }).join(', ');
    }
    return {
      id: 'notebook:' + note.id,
      kind: 'notebook_note',
      source: 'Notebook',
      ts: note.updatedAt || note.createdAt || 0,
      title: note.title || 'Untitled note',
      subtitle: subtitle,
      url: null,   // no standalone URL — notebook is a drawer
      meta: { noteId: note.id, refCount: (note.refs && note.refs.length) || 0 }
    };
  }

  function planToEvent(planId, plan) {
    // plan shape from BshPlans: { startedAt, done:{dayIdx:true} }
    // planId may be a built-in id ('biy', 'nt90', …) or a custom id ('custom_…')
    if (!plan || typeof plan !== 'object' || planId === 'custom_plans') return null;
    // Skip top-level non-plan keys stored in the same object
    if (!plan.startedAt) return null;
    var doneCount = plan.done ? Object.keys(plan.done).length : 0;
    var dayIdx = Math.floor((Date.now() - (plan.startedAt||0)) / 86400000);
    // Friendly name: look up in BshPlans if loaded
    var planDef = null;
    if (window.BshPlans && window.BshPlans.list) {
      planDef = window.BshPlans.list().find(function(p){ return p.id === planId; });
    }
    var planName = (planDef && planDef.name) || planId;
    var totalDays = (planDef && planDef.days) || 0;
    return {
      id: 'plan:' + planId,
      kind: 'reading_plan',
      source: 'Reading Plan',
      ts: plan.startedAt || 0,
      title: planName,
      subtitle: 'Day ' + (dayIdx + 1) + (totalDays ? ' of ' + totalDays : '') + ' · ' + doneCount + ' done',
      url: null,   // clicking opens BshPlans.openPicker() — handled by journey-page
      meta: { planId: planId, plan: plan, def: planDef }
    };
  }

  function sermonToEvent(doc) {
    if (!doc || !doc.id) return null;
    return {
      id: 'sermon:' + doc.id,
      kind: 'sermon_edit',
      source: 'Sermon Builder',
      ts: doc.updated || doc.created || 0,
      title: doc.title || 'Untitled sermon',
      subtitle: (doc.wordCount || (doc.body ? String(doc.body).split(/\s+/).length : 0)) + ' words',
      url: '/builder/#doc=' + encodeURIComponent(doc.id),
      meta: { docId: doc.id }
    };
  }

  function topicToEvent(t) {
    if (!t || !t.id) return null;
    return {
      id: 'topic:' + t.id,
      kind: 'saved_topic',
      source: 'Explorer',
      ts: t.updated || t.created || 0,
      title: t.query || t.title || 'Saved topic',
      subtitle: t.summary ? String(t.summary).slice(0, 120) : 'Saved search',
      url: '/explorer/#topic=' + encodeURIComponent(t.id),
      meta: { topicId: t.id }
    };
  }

  function activityToEvent(evt) {
    if (!evt || !evt.kind) return null;
    var p = evt.payload || {};
    var base = { id: 'act:' + evt.id, ts: evt.ts, meta: { activity: evt } };
    if (evt.kind === 'reader_open') {
      // Repair legacy payloads whose ref stored as "undefined 1" because of
      // an early bug where book.n was undefined.
      var readerRef = p.ref;
      if (!readerRef || /^undefined\b/i.test(readerRef)) {
        var bookLabel = p.book && !/^undefined$/i.test(p.book)
          ? p.book
          : (window.__BOOK_NAMES__ && p.book_code ? window.__BOOK_NAMES__[p.book_code] : null)
            || p.book_code || 'Passage';
        readerRef = bookLabel + ' ' + (p.chapter || 1) + (p.verse ? ':' + p.verse : '');
      }
      return Object.assign(base, {
        kind: 'reader_open', source: 'Reader', title: readerRef, subtitle: p.book && !/^undefined$/i.test(p.book) ? p.book : '',
        ref: readerRef, canonical: p.canonical || null, url: p.url || null
      });
    }
    if (evt.kind === 'wordstudy_lookup') return Object.assign(base, {
      kind: 'wordstudy', source: 'Word Study',
      title: p.lemma || p.strongs || 'Word study',
      subtitle: p.gloss || p.translit || '',
      url: p.strongs ? ('/wordstudy/#strongs=' + encodeURIComponent(p.strongs)) : (p.lemma ? ('/wordstudy/#lemma=' + encodeURIComponent(p.lemma)) : '/wordstudy/'),
      meta: { activity: evt, strongs: p.strongs, lemma: p.lemma }
    });
    if (evt.kind === 'strongs_lookup') return Object.assign(base, {
      kind: 'strongs', source: "Strong's",
      title: p.strongs || 'Strong\'s entry',
      subtitle: p.gloss || p.lemma || '',
      url: '/strongs/#s=' + encodeURIComponent(p.strongs || ''),
      meta: { activity: evt, strongs: p.strongs }
    });
    if (evt.kind === 'passage_guide') return Object.assign(base, {
      kind: 'passage_guide', source: 'Passage Guide',
      title: p.ref || 'Passage Guide',
      subtitle: p.book_name ? ('Book: ' + p.book_name) : '',
      ref: p.ref, url: '/explorer/#pg=' + encodeURIComponent(p.ref || '')
    });
    if (evt.kind === 'atlas_open') return Object.assign(base, {
      kind: 'atlas_open', source: 'Atlas',
      title: p.name || p.slug || 'Atlas place',
      subtitle: p.region || '',
      url: '/atlas/' + (p.slug ? '#place=' + encodeURIComponent(p.slug) : '')
    });
    return null;
  }

  // ---- Timeline (merged, sorted) ----
  function collect() {
    var out = [];
    chatSessions().forEach(function (s) { var e = chatToEvent(s); if (e) out.push(e); });
    notebookNotes().forEach(function (n) { var e = notebookNoteToEvent(n); if (e) out.push(e); });
    var notes = bibleNotes();
    Object.keys(notes).forEach(function (k) { var e = noteToEvent(k, notes[k]); if (e) out.push(e); });
    trayItems().forEach(function (it, i) { var e = trayToEvent(it, i); if (e) out.push(e); });
    var plans = readingPlans();
    Object.keys(plans).forEach(function (id) { var e = planToEvent(id, plans[id]); if (e) out.push(e); });
    sermons().forEach(function (d) { var e = sermonToEvent(d); if (e) out.push(e); });
    savedTopics().forEach(function (t) { var e = topicToEvent(t); if (e) out.push(e); });
    activityEvents().forEach(function (a) { var e = activityToEvent(a); if (e) out.push(e); });
    out.sort(function (x, y) { return (y.ts || 0) - (x.ts || 0); });
    return out;
  }

  function timeline(opts) {
    opts = opts || {};
    var all = collect();
    if (opts.kinds && opts.kinds.length) {
      var set = {}; opts.kinds.forEach(function (k) { set[k] = 1; });
      all = all.filter(function (e) { return set[e.kind]; });
    }
    if (opts.since) all = all.filter(function (e) { return (e.ts || 0) >= opts.since; });
    if (opts.limit) all = all.slice(0, opts.limit);
    return all;
  }

  // ---- Dashboard rollup ----
  function streakDays(events) {
    // Count consecutive UTC days from today backward that have at least one event
    if (!events.length) return 0;
    var days = {};
    events.forEach(function (e) {
      if (!e.ts) return;
      var d = new Date(e.ts);
      var key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      days[key] = 1;
    });
    var streak = 0; var probe = new Date();
    for (var i = 0; i < 365; i++) {
      var k = probe.getFullYear() + '-' + (probe.getMonth() + 1) + '-' + probe.getDate();
      if (days[k]) { streak++; probe.setDate(probe.getDate() - 1); }
      else if (i === 0) { probe.setDate(probe.getDate() - 1); }   // grace for "today not started"
      else break;
    }
    return streak;
  }

  function dashboard() {
    var events = collect();
    var counts = {
      verses: trayItems().filter(function (t) { return t.kind === 'verse'; }).length +
              Object.values(bibleNotes()).filter(function (n) { return n && (n.highlight || n.bookmark || n.text); }).length,
      chats: chatSessions().length,
      notes: Object.values(bibleNotes()).filter(function (n) { return n && n.text; }).length,
      tray: trayItems().length,
      lookups: activityEvents().filter(function (e) { return e.kind === 'wordstudy_lookup' || e.kind === 'strongs_lookup'; }).length,
      studies: (window.JourneyStudies && window.JourneyStudies.list && window.JourneyStudies.list().length) || 0
    };
    var readerOpens = events.filter(function (e) { return e.kind === 'reader_open'; });
    var lastPassage = readerOpens[0] || events.filter(function (e) { return e.ref; })[0] || null;
    var plans = readingPlans();
    var planStatus = null;
    Object.keys(plans).forEach(function (id) {
      var p = plans[id];
      // Skip the custom_plans array and any non-plan key
      if (!p || typeof p !== 'object' || Array.isArray(p) || !p.startedAt || id === 'custom_plans') return;
      // Pick the most recently started plan
      if (!planStatus || (p.startedAt || 0) > (planStatus.startedAt || 0)) {
        var def = null;
        if (window.BshPlans && window.BshPlans.list) def = window.BshPlans.list().find(function(x){ return x.id === id; });
        planStatus = Object.assign({ id: id, _name: (def && def.name) || id, _days: (def && def.days) || 0 }, p);
      }
    });
    var studies = (window.JourneyStudies && window.JourneyStudies.list && window.JourneyStudies.list()) || [];
    var activeStudy = studies[0] || null;
    return {
      streakDays: streakDays(events),
      lastPassage: lastPassage,
      planStatus: planStatus,
      activeStudyId: activeStudy && activeStudy.id || null,
      activeStudy: activeStudy,
      counts: counts,
      recentActivity: events.slice(0, 10)
    };
  }

  function onChange(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  // ---- Wire re-renders to upstream buckets ----
  function wireUpstream() {
    if (window.ChatHistory && window.ChatHistory.onChange) window.ChatHistory.onChange(fire);
    if (window.ActivityLog && window.ActivityLog.onChange) window.ActivityLog.onChange(fire);
    if (window.JourneyStudies && window.JourneyStudies.onChange) window.JourneyStudies.onChange(fire);
    // BshPlans: wire immediately if loaded, else wait for it
    function wirePlans() {
      if (window.BshPlans && window.BshPlans.onChange) window.BshPlans.onChange(fire);
    }
    if (window.BshPlans) wirePlans();
    else { var pt = setInterval(function(){ if (window.BshPlans) { wirePlans(); clearInterval(pt); } }, 300); }
    // BuilderTray: listen for tray changes (same-tab custom event)
    window.addEventListener('buildertray:changed', fire);
    // Other buckets — cross-tab storage events:
    window.addEventListener('storage', function (e) {
      if (!e.key) return;
      if (e.key === 'builder_tray' || e.key === 'bx_tray_v1' ||
          e.key === 'bible_user_notes_v1' || e.key === 'bible_study_notebook_v1' ||
          e.key.indexOf('bp_') === 0 || e.key.indexOf('bsh_') === 0 || e.key.indexOf('bible_') === 0) fire();
    });
    fireReady();
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') wireUpstream();
  else document.addEventListener('DOMContentLoaded', wireUpstream);

  window.JourneyData = {
    ready: readyPromise,
    dashboard: dashboard,
    timeline: timeline,
    onChange: onChange
  };
})();
