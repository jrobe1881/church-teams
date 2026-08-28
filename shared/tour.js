/* /shared/tour.js — Interactive product tour for Bible Parlor
   Teaches new users how to actually USE every tool, not just names them.

   Multi-page: each step declares its page. Advancing past a step on a
   different page saves progress and navigates; the tour resumes on load.
   Progress lives in localStorage.

   Mobile support: steps can declare a `mobileSelector`, `mobileBody`,
   `mobileTitle`, or `mobilePlacement` to override the desktop version
   when viewport width <= 640. On mobile, ring height is capped so tall
   elements don't wash out the spotlight.

   Public API:
     window.BSHTour.start()        — start from step 0
     window.BSHTour.resume()       — resume from stored progress
     window.BSHTour.stop()         — cancel and clear state
     window.BSHTour.isActive()     — boolean
     window.BSHTour.hasCompleted() — boolean
*/
(function(){
  if (window.BSHTour) return;

  var LS_KEY = 'bsh_tour_v2';
  var LS_DONE = 'bsh_tour_done_v2';
  try { localStorage.removeItem('bsh_tour_v1'); localStorage.removeItem('bsh_tour_done_v1'); } catch(e){}

  /* Return the true visual viewport width. Some pages have overlay/portal
     elements that briefly expand document.documentElement's scroll width
     and cause window.innerWidth to report a stale desktop value on mobile.
     Prefer visualViewport.width, then documentElement.clientWidth, then
     body.clientWidth, then fall back to innerWidth. Take the minimum so a
     stray wide overlay can never fool the check. */
  function vw(){
    var candidates = [];
    if (window.visualViewport && window.visualViewport.width > 0)
      candidates.push(window.visualViewport.width);
    if (document.documentElement && document.documentElement.clientWidth > 0)
      candidates.push(document.documentElement.clientWidth);
    if (document.body && document.body.clientWidth > 0)
      candidates.push(document.body.clientWidth);
    candidates.push(window.innerWidth || 0);
    return Math.min.apply(null, candidates.filter(function(x){ return x > 0; }));
  }
  function vh(){
    if (window.visualViewport && window.visualViewport.height > 0) return window.visualViewport.height;
    if (document.documentElement && document.documentElement.clientHeight > 0) return document.documentElement.clientHeight;
    return window.innerHeight || 0;
  }
  function isMobile(){ return vw() <= 640; }

  /* ---------- Steps ---------- */
  var CODE = 'background:var(--surface-2);padding:2px 6px;border-radius:4px';

  var STEPS = [
    /* ─────────── 1. WELCOME ─────────── */
    {
      page: 'home', url: '/',
      title: 'Welcome to Bible Parlor',
      body: 'A quick tour of the tools you may not discover on your own. Under two minutes. Skip anytime, or restart from the account menu.',
      placement: 'center', highlight: false
    },

    /* ─────────── 2. UNIFIED SEARCH ─────────── */
    {
      page: 'home', url: '/',
      selector: '[data-quickjump], #btnQuickJump',
      title: 'Search anything',
      body: 'The <b>\u2315</b> icon in the top bar opens one search palette. <b>Jump</b> finds a verse (<i>John 3:16</i>), a Strong\u2019s number (<i>G26</i>), or a tool. <b>Ask</b> lets you type a plain question, like <i>how do I get baptized in Jesus name</i>, and the Explorer answers from the KJV.<br><br>Keyboard shortcut: <code style="' + CODE + '">\u2318K</code> or <code style="' + CODE + '">Ctrl+K</code>.',
      placement: 'bottom',
      mobilePlacement: 'bottom'
    },

    /* ─────────── 3. READER — tap a verse ─────────── */
    {
      page: 'bible', url: '/read/',
      selector: '.verse',
      title: 'Tap any verse',
      body: 'Tap or long-press a verse to open the study card \u2014 highlight it, cross-reference, look up Strong\u2019s on each word, or send it to the Sermon Builder. Every word is a link.',
      placement: 'top'
    },

    /* ─────────── 4. TOOLS DROPDOWN ─────────── */
    {
      page: 'bible', url: '/read/',
      selector: '.hub-tools-btn',
      title: 'Every tool, one menu',
      body: 'The <b>Tools \u25be</b> menu in the top-right jumps between Reader, Explorer, Strong\u2019s, Lexicon, Atlas, Builder, and Connect \u2014 with the tool you\u2019re on marked <b>Current</b>.',
      placement: 'bottom'
    },

    /* ─────────── 5. STRONG'S CHASE ─────────── */
    {
      page: 'strongs', url: '/strongs/',
      selector: '#sInput',
      title: 'Strong\u2019s Concordance',
      body: 'Type an English word (<i>hope</i>), a Strong\u2019s number (<i>H430</i>, <i>G26</i>), or a Greek/Hebrew lemma. Every hit links to the KJV verses that use it \u2014 and back to the Lexicon for the full definition.',
      placement: 'right', mobilePlacement: 'bottom'
    },

    /* ─────────── 6. ATLAS ─────────── */
    {
      page: 'atlas', url: '/atlas/',
      selector: '#map',
      title: 'Biblical Atlas',
      body: 'Themed maps of the ancient world \u2014 the Exodus route, Paul\u2019s missionary journeys, the seven churches, and the tribal allotments. Tap any marker for the location\u2019s scripture references and history.',
      placement: 'center', highlight: false
    },

    /* ─────────── 7. BUILDER ─────────── */
    {
      page: 'builder', url: '/builder/',
      selector: '#editorInner, .bx-empty',
      title: 'Sermon & Study Builder',
      body: 'Start from a template or a blank document. Every tool on the site has a <b>+ Builder</b> button \u2014 tap it on a verse, a Strong\u2019s entry, or an Atlas marker and the content drops straight into your outline. Everything auto-saves.',
      placement: 'center', highlight: false
    },

    /* ─────────── 8. FINISH ─────────── */
    {
      page: 'connect', url: '/connect/',
      selector: null,
      title: 'You\u2019re ready',
      body: 'Sign in to sync sermons, notes, reading plans, and Bible Connect groups across devices. Restart this tour anytime from the account menu.<br><br>Grace and peace \u2014 go study.',
      placement: 'center', highlight: false
    }
  ];


  /* ---------- Read a step field with mobile overrides ---------- */
  function fieldFor(step, name){
    if (isMobile()){
      var mName = 'mobile' + name.charAt(0).toUpperCase() + name.slice(1);
      if (Object.prototype.hasOwnProperty.call(step, mName)) return step[mName];
    }
    return step[name];
  }

  /* ---------- State ---------- */
  function loadState(){
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch(e){ return null; }
  }
  function saveState(idx){
    try { localStorage.setItem(LS_KEY, JSON.stringify({ idx: idx, at: Date.now() })); } catch(e){}
  }
  function clearState(){
    try { localStorage.removeItem(LS_KEY); } catch(e){}
  }
  function markDone(){
    try { localStorage.setItem(LS_DONE, JSON.stringify({ at: Date.now() })); } catch(e){}
  }
  function hasCompleted(){
    try { return !!localStorage.getItem(LS_DONE); } catch(e){ return false; }
  }

  /* ---------- Which page are we on? ---------- */
  function currentPage(){
    var p = location.pathname;
    if (/\/strongs\//.test(p)) return 'strongs';
    if (/\/wordstudy\//.test(p)) return 'wordstudy';
    if (/\/atlas\//.test(p)) return 'atlas';
    if (/\/builder\//.test(p)) return 'builder';
    if (/\/read\//.test(p)) return 'bible';
    if (/\/explorer\//.test(p)) return 'explorer';
    if (/\/connect\//.test(p)) return 'connect';
    if (/\/about\//.test(p)) return 'about';
    if (/\/blog\//.test(p)) return 'blog';
    if (/\/how-to-use\//.test(p)) return 'how-to-use';
    return 'home';
  }

  /* ---------- DOM ---------- */
  var overlay = null, tooltip = null, ring = null;
  var activeIdx = -1;
  var onResize = null, onKey = null, onScroll = null;

  function buildDom(){
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'bsh-tour-overlay';
    overlay.innerHTML =
      '<div class="bsh-tour-ring" id="bshTourRing"></div>' +
      '<div class="bsh-tour-card" id="bshTourCard" role="dialog" aria-labelledby="bshTourTitle" aria-describedby="bshTourBody">' +
        '<div class="bsh-tour-progress" id="bshTourProgress"></div>' +
        '<h3 class="bsh-tour-title" id="bshTourTitle"></h3>' +
        '<div class="bsh-tour-body" id="bshTourBody"></div>' +
        '<div class="bsh-tour-actions">' +
          '<button type="button" class="bsh-tour-skip" id="bshTourSkip">Skip tour</button>' +
          '<div class="bsh-tour-nav">' +
            '<button type="button" class="bsh-tour-btn bsh-tour-back" id="bshTourBack">Back</button>' +
            '<button type="button" class="bsh-tour-btn bsh-tour-next" id="bshTourNext">Next</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    ring = overlay.querySelector('#bshTourRing');
    tooltip = overlay.querySelector('#bshTourCard');

    overlay.querySelector('#bshTourSkip').addEventListener('click', function(){ stop(true); });
    overlay.querySelector('#bshTourBack').addEventListener('click', function(){ goto(activeIdx - 1); });
    overlay.querySelector('#bshTourNext').addEventListener('click', function(){ goto(activeIdx + 1); });

    // Click-outside-to-dismiss: only fire when the click lands on the
    // backdrop itself (or the spotlight ring, which is pointer-events:none
    // and never the real target), never inside the tour card.
    overlay.addEventListener('mousedown', function(e){
      if (e.target === overlay || e.target === ring) stop(true);
    });

    onKey = function(e){
      if (!isActive()) return;
      if (e.key === 'Escape') { e.preventDefault(); stop(true); }
      else if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); goto(activeIdx + 1); }
      else if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); goto(activeIdx - 1); }
    };
    onResize = function(){ if (isActive()) render(activeIdx); };
    onScroll = function(){ if (isActive()) render(activeIdx); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);

    // Lock body scroll while the tour is open; restored in destroyDom().
    try {
      if (!document.body.hasAttribute('data-bsh-tour-prev-overflow')){
        document.body.setAttribute('data-bsh-tour-prev-overflow', document.body.style.overflow || '');
      }
      document.body.style.overflow = 'hidden';
    } catch(e){}
  }

  function destroyDom(){
    if (!overlay) return;
    if (activeIdx >= 0 && activeIdx < STEPS.length){
      var s = STEPS[activeIdx];
      if (s && typeof s.onLeave === 'function'){ try { s.onLeave(); } catch(e){} }
    }
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScroll, true);
    overlay.remove();
    overlay = null; tooltip = null; ring = null;
    activeIdx = -1;
    // Restore whatever body overflow was set before the tour locked it.
    try {
      if (document.body.hasAttribute('data-bsh-tour-prev-overflow')){
        document.body.style.overflow = document.body.getAttribute('data-bsh-tour-prev-overflow');
        document.body.removeAttribute('data-bsh-tour-prev-overflow');
      }
    } catch(e){}
  }

  /* ---------- Positioning ---------- */
  function findTarget(selector){
    if (!selector) return null;
    var sels = selector.split(',').map(function(s){ return s.trim(); });
    var rects = [];
    var mob = isMobile();
    var viewportW = vw();
    for (var i = 0; i < sels.length; i++){
      var el;
      try { el = document.querySelector(sels[i]); } catch(e){ el = null; }
      if (el) {
        var r = el.getBoundingClientRect();
        // On mobile, skip elements that are off-canvas (hidden rails).
        if (mob && (r.right <= 0 || r.left >= viewportW)) continue;
        if (r.width > 0 && r.height > 0) rects.push(r);
      }
    }
    if (!rects.length) return null;
    var x1 = Math.min.apply(null, rects.map(function(r){return r.left;}));
    var y1 = Math.min.apply(null, rects.map(function(r){return r.top;}));
    var x2 = Math.max.apply(null, rects.map(function(r){return r.right;}));
    var y2 = Math.max.apply(null, rects.map(function(r){return r.bottom;}));
    return { left: x1, top: y1, width: x2 - x1, height: y2 - y1, right: x2, bottom: y2 };
  }

  function positionRing(rect){
    if (!rect || !ring) { if (ring) ring.classList.remove('show'); return; }
    var pad = 8;
    var viewportH = vh();
    var viewportW = vw();
    // On mobile, cap ring height so a giant element (verse column, feature
    // grid) doesn't produce a washed-out spotlight bigger than the viewport.
    // The card is docked at the bottom (~50vh reserved on mobile), so keep
    // the ring in the top ~55% of the viewport.
    if (isMobile()){
      var maxRingBottom = Math.floor(viewportH * 0.55);
      if (rect.top + rect.height + pad > maxRingBottom){
        rect = {
          left: rect.left,
          top: Math.max(rect.top, 0),
          width: rect.width,
          height: Math.max(24, maxRingBottom - Math.max(rect.top, 0) - pad),
          right: rect.right,
          bottom: 0
        };
      }
    }
    /* Clamp the ring to the viewport so a full-width target (topbar, atlas
       map, connect hero) doesn't produce a spotlight that hangs 8px off
       both edges of a narrow phone screen. */
    var rL = rect.left - pad;
    var rT = rect.top - pad;
    var rW = rect.width + pad * 2;
    var rH = rect.height + pad * 2;
    if (isMobile()){
      if (rL < 0) { rW += rL; rL = 0; }
      if (rL + rW > viewportW) rW = viewportW - rL;
      if (rT < 0) { rH += rT; rT = 0; }
      if (rT + rH > viewportH) rH = viewportH - rT;
    }
    ring.style.left = rL + 'px';
    ring.style.top = rT + 'px';
    ring.style.width = rW + 'px';
    ring.style.height = rH + 'px';
    ring.classList.add('show');
  }

  function positionCard(rect, placement){
    if (!tooltip) return;
    tooltip.classList.remove('placement-top','placement-bottom','placement-left','placement-right','placement-center');
    var viewportW = vw(), viewportH = vh();

    // On mobile the CSS pins the card to the bottom regardless of placement.
    // Just apply a class hint and skip JS positioning.
    if (isMobile()){
      tooltip.style.left = '';
      tooltip.style.top = '';
      tooltip.classList.add('placement-' + (placement || 'bottom'));
      return;
    }

    var cw = tooltip.offsetWidth || 360, ch = tooltip.offsetHeight || 220;
    var gap = 16;
    var left, top;

    if (!rect || placement === 'center'){
      left = (viewportW - cw) / 2;
      top = (viewportH - ch) / 2;
      tooltip.classList.add('placement-center');
    } else {
      var order = [placement, 'bottom', 'top', 'right', 'left'].filter(function(p, i, a){ return a.indexOf(p) === i; });
      var chosen = null;
      for (var i = 0; i < order.length; i++){
        var p = order[i], L, T;
        if (p === 'bottom')      { L = rect.left + rect.width/2 - cw/2; T = rect.bottom + gap; }
        else if (p === 'top')    { L = rect.left + rect.width/2 - cw/2; T = rect.top - ch - gap; }
        else if (p === 'right')  { L = rect.right + gap; T = rect.top + rect.height/2 - ch/2; }
        else if (p === 'left')   { L = rect.left - cw - gap; T = rect.top + rect.height/2 - ch/2; }
        else continue;
        if (L >= 8 && L + cw <= viewportW - 8 && T >= 8 && T + ch <= viewportH - 8){
          chosen = { L: L, T: T, p: p }; break;
        }
      }
      if (!chosen){
        left = (viewportW - cw) / 2; top = (viewportH - ch) / 2;
        tooltip.classList.add('placement-center');
      } else {
        left = chosen.L; top = chosen.T;
        tooltip.classList.add('placement-' + chosen.p);
      }
    }
    left = Math.max(8, Math.min(left, viewportW - cw - 8));
    top  = Math.max(8, Math.min(top,  viewportH - ch - 8));
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  /* ---------- Step lifecycle ---------- */
  function render(idx){
    if (idx < 0 || idx >= STEPS.length) return;
    var step = STEPS[idx];
    var title = fieldFor(step, 'title');
    var body = fieldFor(step, 'body');
    var selector = fieldFor(step, 'selector');
    var placement = fieldFor(step, 'placement') || 'bottom';
    var highlight = fieldFor(step, 'highlight');
    if (highlight === undefined) highlight = true;

    overlay.querySelector('#bshTourTitle').textContent = title;
    overlay.querySelector('#bshTourBody').innerHTML = body;
    var prog = overlay.querySelector('#bshTourProgress');
    prog.textContent = 'Step ' + (idx + 1) + ' of ' + STEPS.length;
    var backBtn = overlay.querySelector('#bshTourBack');
    var nextBtn = overlay.querySelector('#bshTourNext');
    backBtn.style.visibility = idx === 0 ? 'hidden' : '';
    nextBtn.textContent = idx === STEPS.length - 1 ? 'Finish' : 'Next';

    var rect = (highlight === false) ? null : findTarget(selector);
    if (rect && highlight !== false) {
      positionRing(rect);
      try {
        var firstSel = (selector || '').split(',')[0].trim();
        var el = firstSel ? document.querySelector(firstSel) : null;
        // On mobile don't try to auto-scroll: card is bottom-docked and the
        // ring is height-capped, so the target is already in the top area.
        if (!isMobile() && el && (rect.top < 60 || rect.bottom > vh() - 60)){
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch(e){}
    } else {
      if (ring) ring.classList.remove('show');
    }
    positionCard(rect, placement);
  }

  function goto(idx){
    if (idx < 0) return;
    if (activeIdx >= 0 && activeIdx < STEPS.length){
      var prev = STEPS[activeIdx];
      if (prev && typeof prev.onLeave === 'function'){
        try { prev.onLeave(); } catch(e){}
      }
    }
    if (idx >= STEPS.length){
      markDone();
      clearState();
      destroyDom();
      return;
    }
    var step = STEPS[idx];
    if (step.page !== currentPage()){
      saveState(idx);
      location.href = step.url;
      return;
    }
    activeIdx = idx;
    saveState(idx);
    if (typeof step.onEnter === 'function'){
      try { step.onEnter(); } catch(e){}
    }
    setTimeout(function(){ render(idx); }, step.onEnter ? 120 : 0);
  }

  /* ---------- Public API ---------- */
  function start(){
    clearState();
    try { localStorage.removeItem(LS_DONE); } catch(e){}
    var firstStep = STEPS[0];
    if (firstStep.page !== currentPage()){
      saveState(0);
      location.href = firstStep.url;
      return;
    }
    buildDom();
    goto(0);
  }

  function resume(){
    var s = loadState();
    if (!s) return;
    if (typeof s.idx !== 'number' || s.idx < 0 || s.idx >= STEPS.length) { clearState(); return; }
    var step = STEPS[s.idx];
    if (step.page !== currentPage()) return;
    buildDom();
    goto(s.idx);
  }

  function stop(userSkipped){
    if (userSkipped) markDone();
    clearState();
    destroyDom();
  }

  function isActive(){ return !!overlay && activeIdx >= 0; }

  window.BSHTour = {
    start: start,
    resume: resume,
    stop: stop,
    isActive: isActive,
    hasCompleted: hasCompleted
  };

  /* ---------- Auto-wire ---------- */
  function autoResume(){
    var run = function(){ setTimeout(resume, 700); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  }
  autoResume();

  function wireFirstSignup(){
    if (!window.CloudAccount || !window.CloudAccount.onFirstSignup) return;
    window.CloudAccount.onFirstSignup(function(){
      setTimeout(start, 350);
    });
  }
  if (window.CloudAccount) wireFirstSignup();
  else {
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (window.CloudAccount) { wireFirstSignup(); clearInterval(iv); }
      else if (tries > 40) clearInterval(iv);
    }, 250);
  }
})();
