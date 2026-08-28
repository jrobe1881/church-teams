/* theme.js — light/dark/auto theme switcher for Bible Parlor.
   Adds a `theme-light` or `theme-dark` class to <body>, persists choice in
   safeLS, respects system preference on "auto", and injects a small toggle
   button into header.app (next to the account button).
*/
(function(){
  if (window.BshTheme) return;
  var KEY = 'bsh_theme_v1'; // 'light' | 'dark' | 'auto'
  var listeners = [];

  function readStored(){
    try { return (window.safeLS || localStorage).getItem(KEY) || 'auto'; } catch(e){ return 'auto'; }
  }
  function writeStored(v){
    try { (window.safeLS || localStorage).setItem(KEY, v); } catch(e){}
  }
  function systemPrefersDark(){
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function resolve(pref){ return pref === 'auto' ? (systemPrefersDark()?'dark':'light') : pref; }

  function apply(pref){
    var resolved = resolve(pref);
    document.body.classList.toggle('theme-dark', resolved === 'dark');
    document.body.classList.toggle('theme-light', resolved === 'light');
    document.body.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
    // Keep the anti-FOUC hint on <html> in sync with the live theme.
    // Without this, the initial data-theme-early="dark" (or "light") set by the
    // head boot script becomes stale after a toggle, and its baked-in
    // background:#050505 / #fafafa rule fights with body.theme-* on the
    // surrounding chrome. This caused Genesis 1:1 to render as a white bar
    // when switching dark→light and left the outer chrome painted dark.
    var h = document.documentElement;
    h.setAttribute('data-theme-early', resolved);
    h.classList.remove('theme-light-early','theme-dark-early');
    h.classList.add('theme-' + resolved + '-early');
    // Also update the inline <html> background written by the head boot script,
    // otherwise it stays stuck on the initial-load color and shows through as
    // the outer chrome after a live toggle.
    h.style.background = resolved === 'dark' ? '#050505' : '#fafafa';
    listeners.forEach(function(fn){ try { fn(resolved, pref); } catch(e){} });
  }

  var current = readStored();
  function ensureBody(cb){
    if (document.body) cb();
    else document.addEventListener('DOMContentLoaded', cb);
  }
  ensureBody(function(){ apply(current); mountToggle(); });

  if (typeof matchMedia === 'function') {
    try {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(){
        if (current === 'auto') apply('auto');
      });
    } catch(e){}
  }

  function set(pref){
    if (['light','dark','auto'].indexOf(pref) < 0) return;
    current = pref;
    writeStored(pref);
    apply(pref);
    updateToggleLabel();
  }
  // Simple binary toggle: light ⇄ dark. Never lands on 'auto' — that's an explicit choice via BshTheme.set('auto').
  // Debounced against double-wiring: if two click handlers on the same button both call toggle()
  // in the same tick (theme.js mountToggle + legacy inline page scripts), the second call is
  // suppressed so we don't flip light→dark→light and appear broken.
  var _lastToggleAt = 0;
  function toggle(){
    var now = Date.now();
    if (now - _lastToggleAt < 50) return;
    _lastToggleAt = now;
    var resolved = resolve(current);
    set(resolved === 'dark' ? 'light' : 'dark');
  }
  // cycle() kept for back-compat but now behaves like toggle()
  function cycle(){ toggle(); }
  function get(){ return current; }
  function onChange(fn){ listeners.push(fn); return function(){ listeners = listeners.filter(function(f){return f!==fn;}); }; }

  /* ---- toggle button (matches .hub-icon-btn from hub-chrome.css) ---- */
  var css = ''
  + '.bsh-theme-btn{display:inline-flex;align-items:center;justify-content:center;background:var(--surface-2);color:var(--ink-2);border:none;'
  + 'width:36px;height:36px;border-radius:var(--r-md);padding:0;cursor:pointer;font-size:1rem;font-weight:600;letter-spacing:.3px;white-space:nowrap;font-family:var(--font-sans);'
  + 'transition:background var(--dur-1), color var(--dur-1);flex-shrink:0;gap:0;margin-right:6px}'
  + '.bsh-theme-btn:hover{background:var(--surface-3);color:var(--ink)}'
  + '.bsh-theme-btn.on{background:var(--accent-tint);color:var(--accent)}'
  + '.bsh-theme-btn:active{transform:scale(.96)}'
  + '.bsh-theme-btn .bsh-th-lbl{display:none}'
  + '@media (max-width:900px){.bsh-theme-btn{padding:0}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var btn = null;
  function iconFor(pref){
    if (pref==='dark') return '☾';
    if (pref==='light') return '☀';
    return '⚙';
  }
  function labelFor(pref){
    return pref === 'auto' ? 'Auto' : (pref==='dark'?'Dark':'Light');
  }
  function updateToggleLabel(){
    if (!btn) return;
    btn.innerHTML = '<span>' + iconFor(current) + '</span><span class="bsh-th-lbl">' + labelFor(current) + '</span>';
    btn.setAttribute('title','Theme: '+labelFor(current)+' (click to change)');
    btn.classList.toggle('on', resolve(current) === 'dark');
  }
  function mountToggle(){
    var isEmbedded = false;
    try { isEmbedded = new URLSearchParams(location.search).get('embed') === 'split'; } catch(e){}
    if (isEmbedded) return;
    // Every hub page ships a <button id="btnTheme"> in the top bar.
    // Wire every such button we find so pages don't need per-file glue code.
    var hubBtns = document.querySelectorAll('#btnTheme, [data-theme-toggle]');
    hubBtns.forEach(function(b){
      if (b.dataset.themeWired === '1') return;
      b.dataset.themeWired = '1';
      b.addEventListener('click', toggle);
    });
    // Legacy: pages that ship a <header class="app"> get an injected button.
    var header = document.querySelector('header.app');
    if (!header) return;
    if (document.querySelector('.bsh-theme-btn')) return;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bsh-theme-btn';
    btn.addEventListener('click', cycle);
    var acct = header.querySelector('.acct-fab');
    var menu = header.querySelector('.menu-btn');
    if (acct) header.insertBefore(btn, acct);
    else if (menu) header.insertBefore(btn, menu);
    else header.appendChild(btn);
    updateToggleLabel();
  }

  window.BshTheme = { get:get, set:set, cycle:cycle, toggle:toggle, onChange:onChange };

  /* Auto-load accent.js alongside theme.js so it's present on every page
     without editing each individual HTML file. */
  (function(){
    if (window.BshAccent) return;
    var s = document.createElement('script');
    // Apply the stored accent to <html> immediately (FOUC prevention) —
    // tokens.css data-accent selectors will fire before JS finishes loading.
    try {
      var ak = (window.safeLS || localStorage).getItem('bsh_accent_v1') || '';
      if (ak) document.documentElement.setAttribute('data-accent', ak);
    } catch(_e){}
    s.src = '/shared/accent.js?v=5';
    document.head.appendChild(s);
  })();

})();
