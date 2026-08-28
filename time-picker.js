/* /teams/time-picker.js — 12-hour AM/PM time & datetime pickers.

   Replaces every <input type="time"> and <input type="datetime-local">
   inside a Teams page (or subtree) with three (or five) selects:
     hour  : 1..12
     minute: 00 / 05 / 10 / ... / 55  (5-minute steps)
     ampm  : AM / PM
   Datetime pickers add:
     date  : a native <input type="date"> (already localized well)

   The original hidden input keeps a canonical HH:MM (time) or
   YYYY-MM-DDTHH:MM (datetime-local) value, so every place that reads
   `.value` sees exactly what a native picker would produce.

   Usage: after inserting HTML that contains time / datetime-local inputs,
   call window.TeamsTimePicker.hydrate(root). Idempotent. It's also
   auto-wired to run on DOMContentLoaded and on every teams sheet open. */

(function(){
  function pad2(n){ n = String(n); return n.length === 1 ? '0' + n : n; }
  function esc(s){ return (window.TeamsCtx && window.TeamsCtx.esc) ? window.TeamsCtx.esc(s) : String(s == null ? '' : s); }
  var MIN_STEP = 5; // 5-minute increments

  function parseTime(hhmm){
    if (!hhmm) return null;
    var m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    var h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
    if (isNaN(h) || isNaN(mi)) return null;
    return { h: h, m: mi };
  }
  function to12(h){
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return { h12: h12, ampm: ampm };
  }
  function to24(h12, ampm){
    h12 = parseInt(h12, 10);
    if (ampm === 'AM') return h12 === 12 ? 0 : h12;
    return h12 === 12 ? 12 : h12 + 12;
  }
  function roundToStep(m){
    var r = Math.round(m / MIN_STEP) * MIN_STEP;
    if (r >= 60) r = 55;
    return r;
  }

  function hourOptions(sel){
    var out = '';
    for (var i=1;i<=12;i++) out += '<option value=\"' + i + '\"' + (i===sel?' selected':'') + '>' + i + '</option>';
    return out;
  }
  function minuteOptions(sel){
    var out = '';
    for (var i=0;i<60;i+=MIN_STEP) out += '<option value=\"' + pad2(i) + '\"' + (i===sel?' selected':'') + '>' + pad2(i) + '</option>';
    return out;
  }
  function ampmOptions(sel){
    return '<option value=\"AM\"' + (sel==='AM'?' selected':'') + '>AM</option>' +
           '<option value=\"PM\"' + (sel==='PM'?' selected':'') + '>PM</option>';
  }

  // ---------- <input type=\"time\"> replacement ----------
  function replaceTimeInput(input){
    if (input.dataset.tp12) return;
    input.dataset.tp12 = '1';

    var initial = parseTime(input.value) || { h: 19, m: 0 };
    var t = to12(initial.h);
    var mm = roundToStep(initial.m);

    // Keep the input in the DOM (hidden) so form.value reads still work.
    input.type = 'hidden';
    input.value = pad2(initial.h) + ':' + pad2(mm);

    var wrap = document.createElement('span');
    wrap.className = 'teams-time-picker';
    wrap.setAttribute('data-for', input.id || '');
    wrap.innerHTML =
      '<select class=\"teams-tp-hr\" aria-label=\"Hour\">' + hourOptions(t.h12) + '</select>' +
      '<span class=\"teams-tp-sep\">:</span>' +
      '<select class=\"teams-tp-min\" aria-label=\"Minute\">' + minuteOptions(mm) + '</select>' +
      '<select class=\"teams-tp-ampm\" aria-label=\"AM/PM\">' + ampmOptions(t.ampm) + '</select>';
    input.parentNode.insertBefore(wrap, input.nextSibling);

    var hr = wrap.querySelector('.teams-tp-hr');
    var mn = wrap.querySelector('.teams-tp-min');
    var ap = wrap.querySelector('.teams-tp-ampm');

    function sync(){
      var h24 = to24(hr.value, ap.value);
      input.value = pad2(h24) + ':' + mn.value;
      // Fire change so listeners bound to the original input still hear it.
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    hr.addEventListener('change', sync);
    mn.addEventListener('change', sync);
    ap.addEventListener('change', sync);
    // Set once on mount so downstream logic sees a canonical value even
    // when the user hasn't touched the control yet.
    sync();
  }

  // ---------- <input type=\"datetime-local\"> replacement ----------
  function parseDatetimeLocal(v){
    if (!v) return null;
    var m = String(v).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/);
    if (!m) return null;
    return { date: m[1], h: parseInt(m[2],10), m: parseInt(m[3],10) };
  }

  function replaceDatetimeInput(input){
    if (input.dataset.tp12) return;
    input.dataset.tp12 = '1';

    var now = new Date();
    var initial = parseDatetimeLocal(input.value) || {
      date: now.getFullYear() + '-' + pad2(now.getMonth()+1) + '-' + pad2(now.getDate()),
      h: 19, m: 0
    };
    var t = to12(initial.h);
    var mm = roundToStep(initial.m);

    // Canonicalize hidden input's value.
    input.type = 'hidden';
    input.value = initial.date + 'T' + pad2(initial.h) + ':' + pad2(mm);

    var wrap = document.createElement('span');
    wrap.className = 'teams-datetime-picker';
    wrap.setAttribute('data-for', input.id || '');
    wrap.innerHTML =
      '<input class=\"teams-tp-date\" type=\"date\" value=\"' + esc(initial.date) + '\" />' +
      '<span class=\"teams-tp-time-group\">' +
        '<select class=\"teams-tp-hr\" aria-label=\"Hour\">' + hourOptions(t.h12) + '</select>' +
        '<span class=\"teams-tp-sep\">:</span>' +
        '<select class=\"teams-tp-min\" aria-label=\"Minute\">' + minuteOptions(mm) + '</select>' +
        '<select class=\"teams-tp-ampm\" aria-label=\"AM/PM\">' + ampmOptions(t.ampm) + '</select>' +
      '</span>';\n    input.parentNode.insertBefore(wrap, input.nextSibling);

    var dt = wrap.querySelector('.teams-tp-date');
    var hr = wrap.querySelector('.teams-tp-hr');
    var mn = wrap.querySelector('.teams-tp-min');
    var ap = wrap.querySelector('.teams-tp-ampm');

    function sync(){
      var h24 = to24(hr.value, ap.value);
      var d = dt.value || initial.date;
      input.value = d + 'T' + pad2(h24) + ':' + mn.value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    dt.addEventListener('change', sync);
    hr.addEventListener('change', sync);
    mn.addEventListener('change', sync);
    ap.addEventListener('change', sync);
    sync();
  }

  function hydrate(root){
    root = root || document.body;
    Array.prototype.forEach.call(root.querySelectorAll('input[type=\"time\"]'), replaceTimeInput);
    Array.prototype.forEach.call(root.querySelectorAll('input[type=\"datetime-local\"]'), replaceDatetimeInput);
  }

  // Watch for dynamically inserted sheets (modals) and hydrate them.
  var mo = new MutationObserver(function(muts){
    for (var i=0;i<muts.length;i++){
      var m = muts[i];
      for (var j=0;j<m.addedNodes.length;j++){
        var n = m.addedNodes[j];
        if (n && n.nodeType === 1) {
          hydrate(n);
        }
      }
    }
  });
  document.addEventListener('DOMContentLoaded', function(){
    hydrate(document.body);
    mo.observe(document.body, { childList: true, subtree: true });
  });

  // Handle the case where this script loads after DOMContentLoaded.
  if (document.readyState !== 'loading') {
    hydrate(document.body);
    mo.observe(document.body, { childList: true, subtree: true });
  }

  window.TeamsTimePicker = { hydrate: hydrate };
})();
