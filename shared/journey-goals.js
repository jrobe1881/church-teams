/* journey-goals.js
   Study goals with milestone tracking for My Study Journey.

   A Goal is a user-defined objective with an optional target date.
   Progress is measured automatically from JourneyData activity events
   since the goal was created — no manual check-ins needed.

   Goal shape:
     { id, title, targetDate?, linkedStudyId?, note?, doneAt?, createdAt, updatedAt }

   Milestone shape (sub-checkpoints inside a goal):
     { id, label, doneAt? }

   Public API on window.JourneyGoals:
     list()                                    -> Goal[] newest first
     get(id)                                   -> Goal | null
     create({title, targetDate?, linkedStudyId?, note?, milestones?}) -> Goal
     update(id, patch)                         -> Goal | null
     complete(id)                              -> Goal | null   (toggles doneAt)
     remove(id)
     addMilestone(goalId, label)               -> Milestone | null
     completeMilestone(goalId, milestoneId)    -> toggles doneAt
     removeMilestone(goalId, milestoneId)
     progress(id)                              -> { pct:0-100, activityCount, daysLeft, daysTotal, overdue }
     onChange(fn)                              -> unsubscribe
*/
(function () {
  'use strict';
  if (window.JourneyGoals) return;

  var KEY = 'bp_journey_goals_v1';
  var safeLS = window.safeLS || localStorage;
  var listeners = [];
  var cloudBinding = null;

  function ts() { return Date.now(); }
  function uid(pfx) { return (pfx || 'g') + '_' + Math.random().toString(36).slice(2, 9) + ts().toString(36); }

  /* ---- Storage ---- */
  function load() {
    try {
      var raw = safeLS.getItem(KEY);
      if (!raw) return { goals: [] };
      var v = JSON.parse(raw);
      return (v && Array.isArray(v.goals)) ? v : { goals: [] };
    } catch (_e) { return { goals: [] }; }
  }
  function save(db) {
    try { safeLS.setItem(KEY, JSON.stringify(db)); } catch (_e) {}
    if (cloudBinding && cloudBinding.notifyLocalChange) {
      try { cloudBinding.notifyLocalChange(); } catch (_e) {}
    }
    notify();
  }
  function notify() { listeners.forEach(function (fn) { try { fn(); } catch (_e) {} }); }

  /* ---- CRUD ---- */
  function list() {
    return load().goals.slice().sort(function (a, b) {
      // Active (undone) goals first, sorted by target date asc; done goals last by doneAt desc
      if (!a.doneAt && b.doneAt) return -1;
      if (a.doneAt && !b.doneAt) return 1;
      if (!a.doneAt && !b.doneAt) {
        // No target: push to end of active
        if (!a.targetDate && b.targetDate) return 1;
        if (a.targetDate && !b.targetDate) return -1;
        return (a.targetDate || '') < (b.targetDate || '') ? -1 : 1;
      }
      return (b.doneAt || 0) - (a.doneAt || 0);
    });
  }

  function get(id) {
    var all = load().goals;
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function create(opts) {
    opts = opts || {};
    var title = String(opts.title || '').trim();
    if (!title) return null;
    var db = load();
    var goal = {
      id: uid('goal'),
      title: title.slice(0, 200),
      targetDate: opts.targetDate || null,   // ISO date string "YYYY-MM-DD"
      linkedStudyId: opts.linkedStudyId || null,
      note: String(opts.note || '').slice(0, 1000),
      milestones: (Array.isArray(opts.milestones) ? opts.milestones : []).map(function (m) {
        return { id: uid('ms'), label: String(m.label || m).slice(0, 200), doneAt: null };
      }),
      doneAt: null,
      createdAt: ts(),
      updatedAt: ts()
    };
    db.goals.unshift(goal);
    save(db);
    return goal;
  }

  function update(id, patch) {
    var db = load();
    for (var i = 0; i < db.goals.length; i++) {
      if (db.goals[i].id !== id) continue;
      var g = db.goals[i];
      if (patch.title != null) g.title = String(patch.title).trim().slice(0, 200);
      if (patch.targetDate !== undefined) g.targetDate = patch.targetDate || null;
      if (patch.linkedStudyId !== undefined) g.linkedStudyId = patch.linkedStudyId || null;
      if (patch.note != null) g.note = String(patch.note).slice(0, 1000);
      g.updatedAt = ts();
      save(db);
      return g;
    }
    return null;
  }

  function complete(id) {
    var db = load();
    for (var i = 0; i < db.goals.length; i++) {
      if (db.goals[i].id !== id) continue;
      var g = db.goals[i];
      g.doneAt = g.doneAt ? null : ts();   // toggle
      g.updatedAt = ts();
      save(db);
      return g;
    }
    return null;
  }

  function remove(id) {
    var db = load();
    var before = db.goals.length;
    db.goals = db.goals.filter(function (g) { return g.id !== id; });
    if (db.goals.length === before) return false;
    save(db);
    return true;
  }

  /* ---- Milestones ---- */
  function _goalOp(goalId, fn) {
    var db = load();
    for (var i = 0; i < db.goals.length; i++) {
      if (db.goals[i].id === goalId) { fn(db.goals[i]); db.goals[i].updatedAt = ts(); save(db); return db.goals[i]; }
    }
    return null;
  }

  function addMilestone(goalId, label) {
    var ms = null;
    _goalOp(goalId, function (g) {
      g.milestones = g.milestones || [];
      ms = { id: uid('ms'), label: String(label || '').trim().slice(0, 200), doneAt: null };
      g.milestones.push(ms);
    });
    return ms;
  }

  function completeMilestone(goalId, milestoneId) {
    _goalOp(goalId, function (g) {
      var m = (g.milestones || []).find(function (x) { return x.id === milestoneId; });
      if (m) m.doneAt = m.doneAt ? null : ts();
    });
  }

  function removeMilestone(goalId, milestoneId) {
    _goalOp(goalId, function (g) {
      g.milestones = (g.milestones || []).filter(function (m) { return m.id !== milestoneId; });
    });
  }

  /* ---- Progress ---- */
  function progress(id) {
    var g = get(id);
    if (!g) return { pct: 0, activityCount: 0, daysLeft: null, daysTotal: null, overdue: false };

    // Milestone-based progress if goal has milestones
    var milestones = g.milestones || [];
    var pct = 0;
    if (milestones.length) {
      var done = milestones.filter(function (m) { return !!m.doneAt; }).length;
      pct = Math.round((done / milestones.length) * 100);
    } else if (g.doneAt) {
      pct = 100;
    }

    // Activity count since goal was created, for the linked study
    var activityCount = 0;
    if (window.JourneyData && window.JourneyData.timeline) {
      var events = window.JourneyData.timeline({ since: g.createdAt });
      if (g.linkedStudyId) {
        // Only count events whose meta.studyId matches, or that are study-level events
        // (Journey doesn't tag events with studyId yet — count all events as signal of progress)
        activityCount = events.length;
      } else {
        activityCount = events.length;
      }
    }

    // Days calculation
    var daysLeft = null;
    var daysTotal = null;
    var overdue = false;
    if (g.targetDate && !g.doneAt) {
      var now = new Date();
      var target = new Date(g.targetDate + 'T23:59:59');
      var created = new Date(g.createdAt);
      daysLeft = Math.ceil((target - now) / 86400000);
      daysTotal = Math.max(1, Math.ceil((target - created) / 86400000));
      overdue = daysLeft < 0;
      // Time-based fallback pct when no milestones
      if (!milestones.length && !g.doneAt) {
        var elapsed = daysTotal - Math.max(0, daysLeft);
        pct = Math.min(99, Math.round((elapsed / daysTotal) * 100));
      }
    }

    return { pct: pct, activityCount: activityCount, daysLeft: daysLeft, daysTotal: daysTotal, overdue: overdue };
  }

  /* ---- onChange ---- */
  function onChange(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  /* ---- Cloud sync ---- */
  function mergeGoals(a, b) {
    var byId = Object.create(null);
    ((a && a.goals) || []).forEach(function (g) { if (g && g.id) byId[g.id] = g; });
    ((b && b.goals) || []).forEach(function (g) {
      if (!g || !g.id) return;
      var prev = byId[g.id];
      if (!prev || (g.updatedAt || 0) > (prev.updatedAt || 0)) byId[g.id] = g;
    });
    var goals = Object.values(byId).sort(function (x, y) { return (y.updatedAt || 0) - (x.updatedAt || 0); });
    return { goals: goals };
  }

  function bindCloud() {
    if (cloudBinding || !window.CloudAccount || !window.CloudAccount.bindSync) return;
    cloudBinding = window.CloudAccount.bindSync('journey_goals', {
      getLocal: load,
      setLocal: function (remote) {
        if (!remote || typeof remote !== 'object') return;
        var merged = mergeGoals(load(), remote);
        try { safeLS.setItem(KEY, JSON.stringify(merged)); } catch (_e) {}
        notify();
      },
      emptyValue: { goals: [] },
      onRemoteUpdate: notify
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

  window.JourneyGoals = {
    list: list, get: get, create: create, update: update,
    complete: complete, remove: remove,
    addMilestone: addMilestone, completeMilestone: completeMilestone, removeMilestone: removeMilestone,
    progress: progress, onChange: onChange
  };
})();
