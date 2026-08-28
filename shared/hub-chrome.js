/* /shared/hub-chrome.js — Site-wide chrome helpers.
   Auto-wires: mobile rail toggle buttons, backdrop close, home + quick-jump buttons.
   Also provides Hub.toast(msg) and Hub.modal({title,body,foot}) helpers. */

(function(){
  'use strict';

  var Hub = window.Hub || {};

  /* Toast */
  var toastEl = null, toastTimer = null;
  Hub.toast = function(msg){
    if (!toastEl){
      toastEl = document.createElement('div');
      toastEl.className = 'hub-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove('show'); }, 2400);
  };

  /* Modal */
  Hub.modal = function(opts){
    var root = document.body;
    var back = document.createElement('div');
    back.className = 'hub-modal-backdrop';
    var m = document.createElement('div');
    m.className = 'hub-modal';
    var head = document.createElement('div');
    head.className = 'hub-modal-head';
    head.innerHTML = '<div class="hub-modal-title">' + esc(opts.title || '') + '</div>' +
                     '<button class="hub-icon-btn" data-close aria-label="Close">\u2715</button>';
    var body = document.createElement('div');
    body.className = 'hub-modal-body';
    if (opts.body instanceof HTMLElement) body.appendChild(opts.body);
    else body.innerHTML = opts.body || '';
    var foot = document.createElement('div');
    foot.className = 'hub-modal-foot';
    (opts.foot || []).forEach(function(b){
      var el = document.createElement('button');
      el.className = 'hub-btn-' + (b.primary ? 'primary' : b.danger ? 'danger' : 'secondary');
      el.textContent = b.label;
      el.addEventListener('click', function(){
        if (b.action) b.action(close);
        else close();
      });
      foot.appendChild(el);
    });
    m.appendChild(head);
    m.appendChild(body);
    if ((opts.foot || []).length) m.appendChild(foot);
    back.appendChild(m);
    root.appendChild(back);
    requestAnimationFrame(function(){
      back.classList.add('open');
      m.classList.add('open');
    });
    function close(){
      back.classList.remove('open');
      m.classList.remove('open');
      setTimeout(function(){ if (back.parentNode) back.parentNode.removeChild(back); }, 220);
      document.removeEventListener('keydown', onEsc);
    }
    function onEsc(e){ if (e.key === 'Escape') close(); }
    head.querySelector('[data-close]').addEventListener('click', close);
    back.addEventListener('click', function(e){ if (e.target === back) close(); });
    document.addEventListener('keydown', onEsc);
    return close;
  };

  /* Mobile rail toggle wiring — call after DOM ready to bind topbar buttons */
  Hub.wireRails = function(){
    var leftBtns = document.querySelectorAll('[data-rail-toggle="left"]');
    var rightBtns = document.querySelectorAll('[data-rail-toggle="right"]');
    var leftRail = document.querySelector('.hub-rail.left');
    var rightRail = document.querySelector('.hub-rail.right');

    // Ensure a shared backdrop exists
    var backdrop = document.querySelector('.hub-rail-backdrop');
    if (!backdrop){
      backdrop = document.createElement('div');
      backdrop.className = 'hub-rail-backdrop';
      document.body.appendChild(backdrop);
    }
    function closeAll(){
      if (leftRail) leftRail.classList.remove('open');
      if (rightRail) rightRail.classList.remove('open');
      backdrop.classList.remove('show');
    }
    backdrop.addEventListener('click', closeAll);

    if (leftRail){
      leftBtns.forEach(function(leftBtn){
        leftBtn.addEventListener('click', function(){
          var open = leftRail.classList.toggle('open');
          if (rightRail) rightRail.classList.remove('open');
          backdrop.classList.toggle('show', open);
          document.dispatchEvent(new CustomEvent('rail:toggled', {detail:{side:'left', open:open}}));
        });
      });
    }
    if (rightRail){
      rightBtns.forEach(function(rightBtn){
        rightBtn.addEventListener('click', function(){
          var open = rightRail.classList.toggle('open');
          if (leftRail) leftRail.classList.remove('open');
          backdrop.classList.toggle('show', open);
          document.dispatchEvent(new CustomEvent('rail:toggled', {detail:{side:'right', open:open}}));
        });
      });
    }

    // Home button (data-home)
    document.querySelectorAll('[data-home]').forEach(function(el){
      if (el.tagName === 'A' && !el.getAttribute('href')) el.setAttribute('href', pathTo('/'));
      else if (el.tagName === 'BUTTON') el.addEventListener('click', function(){ location.href = pathTo('/'); });
    });

    // Quick-jump button (data-quickjump)
    document.querySelectorAll('[data-quickjump]').forEach(function(el){
      el.addEventListener('click', function(){
        if (window.QuickJump && window.QuickJump.open) window.QuickJump.open();
        else Hub.toast('Quick Jump not available');
      });
    });

    // Explorer overlay trigger (data-explorer-open): open in-page overlay when available,
    // otherwise fall back to normal navigation for <a> or the standalone page for <button>.
    document.querySelectorAll('[data-explorer-open]').forEach(function(el){
      el.addEventListener('click', function(ev){
        if (window.BshExplorerOverlay && typeof window.BshExplorerOverlay.open === 'function') {
          ev.preventDefault();
          window.BshExplorerOverlay.open();
        } else if (el.tagName === 'BUTTON') {
          // Button has no href; navigate to the standalone Explorer page as a fallback
          var base = /\/(sermon|atlas|strongs|wordstudy|explorer|builder)\//.test(location.pathname) ? '../explorer/index.html' : 'explorer/index.html';
          location.href = base;
        }
        // else: <a> element — allow default navigation
      });
    });

    // Close rails when window is resized to desktop width
    window.addEventListener('resize', function(){
      if (window.innerWidth > 840) closeAll();
    });
  };

  /* Compute a path to a site-root URL, respecting whatever subpath the current page is at. */
  function pathTo(path){
    if (path.startsWith('/')) return path;
    return path;
  }
  Hub.pathTo = pathTo;

  function esc(s){ return String(s||'').replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]; }); }
  Hub.esc = esc;

  // Auto-wire when DOM ready
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Hub.wireRails);
  else Hub.wireRails();

  window.Hub = Hub;
})();
