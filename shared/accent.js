/* accent.js v4 — Site-wide accent color picker for Bible Parlor.
   Single color wheel (native <input type="color">), no presets.
   Cloud sync via CloudAccount.bindSync when signed in.
   Falls back to localStorage when signed out.
*/
(function(){
  if (window.BshAccent) return;

  var KEY       = 'bsh_accent_v1';
  var CLOUD_KEY = 'accent';
  var DEFAULT   = '#7a1f2b'; // burgundy

  /* ── Color derivation ───────────────────────────────────────────────────── */
  function hexToRgb(h){
    h = h.replace('#','');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h, 16);
    return {r:(n>>16)&255, g:(n>>8)&255, b:n&255};
  }
  function rgbStr(r,g,b){ return 'rgb('+r+','+g+','+b+')'; }
  function clamp(v){ return Math.max(0, Math.min(255, Math.round(v))); }
  function shiftHex(hex, amt){
    var c = hexToRgb(hex);
    return rgbStr(clamp(c.r+amt), clamp(c.g+amt), clamp(c.b+amt));
  }
  function deriveColors(hex, darkMode){
    var c = hexToRgb(hex), r=c.r, g=c.g, b=c.b;
    var accent = darkMode ? rgbStr(clamp(r+40),clamp(g+40),clamp(b+40)) : hex;
    var hover  = darkMode ? rgbStr(clamp(r+60),clamp(g+60),clamp(b+60)) : shiftHex(hex,-18);
    var tintA  = darkMode ? 0.12 : 0.08;
    var tint   = 'rgba('+r+','+g+','+b+','+tintA+')';
    var soft   = darkMode ? 'rgba('+r+','+g+','+b+',.15)' : rgbStr(clamp(r+110),clamp(g+110),clamp(b+110));
    var focusA = darkMode ? 0.30 : 0.15;
    var focus  = '0 0 0 3px rgba('+r+','+g+','+b+','+focusA+')';
    return {accent:accent, hover:hover, tint:tint, soft:soft, focus:focus};
  }

  /* ── CSS override ───────────────────────────────────────────────────────── */
  var _styleEl = null;
  function getStyleEl(){
    if (!_styleEl){
      _styleEl = document.getElementById('bsh-accent-override');
      if (!_styleEl){
        _styleEl = document.createElement('style');
        _styleEl.id = 'bsh-accent-override';
        document.head.appendChild(_styleEl);
      }
    }
    return _styleEl;
  }

  /* Specificity battle against tokens.css dark-mode rules:
     tokens.css uses `html[data-theme-early="dark"] body` (0,1,2) to set
     --accent on <body>, which beats a plain `body.theme-dark` (0,1,1) override.
     Fix: set light vars on `html[data-accent]` (0,1,1) and dark vars on BOTH
     `html[data-accent][data-theme-early="dark"]` (0,2,1, wins on <html>) AND
     `html[data-accent][data-theme-early="dark"] body` (0,2,2, beats tokens (0,1,2)
     on <body>). This ensures all descendants inherit the chosen accent in dark mode. */
  function buildCSS(lc, dc){
    var darkSel = 'html[data-accent][data-theme-early="dark"]';
    var darkVars = '--accent:'+dc.accent+';--accent-hover:'+dc.hover
                + ';--accent-tint:'+dc.tint+';--accent-soft:'+dc.soft+';--focus:'+dc.focus;
    return 'html[data-accent]{'
         + '--accent:'+lc.accent+';--accent-hover:'+lc.hover+';--accent-tint:'+lc.tint
         + ';--accent-soft:'+lc.soft+';--focus:'+lc.focus+'}'
         + darkSel+'{'+darkVars+'}'
         + darkSel+' body{'+darkVars+'}';
  }

  function isValidHex(v){ return /^#[0-9a-fA-F]{6}$/.test(v); }
  function normalise(v){ return isValidHex(v) ? v : DEFAULT; }

  function applyValue(val){
    val = normalise(val);
    document.documentElement.setAttribute('data-accent', val);
    var lc = deriveColors(val, false);
    var dc = deriveColors(val, true);
    getStyleEl().textContent = buildCSS(lc, dc);
    // Update trigger dot if picker already mounted
    var dot = document.querySelector('.bsh-accent-dot');
    if (dot) dot.style.background = val;
  }

  /* ── Storage ────────────────────────────────────────────────────────────── */
  var current = (function(){
    try { return normalise((window.safeLS||localStorage).getItem(KEY)||DEFAULT); }
    catch(e){ return DEFAULT; }
  })();

  function writeLocal(val){
    try { (window.safeLS||localStorage).setItem(KEY, val); } catch(e){}
  }

  /* ── Cloud sync ─────────────────────────────────────────────────────────── */
  var _cloudBinding = null;
  function bindCloud(){
    if (_cloudBinding || !window.CloudAccount || !window.CloudAccount.bindSync) return;
    _cloudBinding = window.CloudAccount.bindSync(CLOUD_KEY, {
      getLocal: function(){ return { accent: current }; },
      setLocal: function(remote){
        if (!remote || !remote.accent) return;
        var v = normalise(remote.accent);
        if (v === current) return;
        current = v;
        writeLocal(v);
        applyValue(v);
        if (_colorInput) _colorInput.value = v;
      },
      emptyValue: { accent: DEFAULT },
      onRemoteUpdate: function(){}
    });
  }

  function saveAndSync(val){
    val = normalise(val);
    current = val;
    writeLocal(val);
    applyValue(val);
    if (_cloudBinding && _cloudBinding.notifyLocalChange) _cloudBinding.notifyLocalChange();
  }

  function tryBindCloud(){
    if (_cloudBinding) return;
    bindCloud();
    if (!_cloudBinding){
      var tries = 0;
      var tick = setInterval(function(){
        bindCloud();
        if (_cloudBinding || ++tries > 40) clearInterval(tick);
      }, 300);
    }
  }

  /* ── Boot ───────────────────────────────────────────────────────────────── */
  applyValue(current);
  tryBindCloud();
  if (window.CloudAccount && window.CloudAccount.onAuthChange){
    window.CloudAccount.onAuthChange(function(user){ if (user) tryBindCloud(); });
  }

  /* ── Picker UI ──────────────────────────────────────────────────────────── */
  var _pickerOpen = false;
  var _wrap       = null;
  var _pickerEl   = null;
  var _colorInput = null;

  var CSS = [
    /* Trigger */
    '.bsh-accent-btn{display:inline-flex;align-items:center;justify-content:center;',
    'width:36px;height:36px;border-radius:var(--r-md,8px);background:var(--surface-2);',
    'border:none;cursor:pointer;padding:0;flex-shrink:0;margin-right:2px;',
    'transition:background 120ms;position:relative;}',
    '.bsh-accent-btn:hover{background:var(--surface-3);}',
    '.bsh-accent-dot{width:14px;height:14px;border-radius:50%;',
    'border:2px solid var(--border-strong,#ccc);transition:background .2s;}',

    /* Popover */
    '.bsh-accent-pop{position:fixed;z-index:9950;',
    'background:var(--surface,#fff);border:1px solid var(--border,#e4e4e7);',
    'border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.14),0 2px 6px rgba(0,0,0,.08);',
    'padding:12px 14px;width:180px;',
    'opacity:0;transform:translateY(-6px);pointer-events:none;',
    'transition:opacity .15s,transform .15s;}',
    '.bsh-accent-pop.open{opacity:1;transform:translateY(0);pointer-events:auto;}',

    /* Color wheel row */
    '.bsh-ap-row{display:flex;align-items:center;gap:10px;}',
    '.bsh-ap-wheel{position:relative;width:36px;height:36px;flex:0 0 36px;',
    'border-radius:50%;overflow:hidden;cursor:pointer;',
    'border:2px solid var(--border,#e4e4e7);',
    'background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);}',
    '.bsh-ap-wheel input[type=color]{position:absolute;inset:-4px;',
    'width:calc(100%+8px);height:calc(100%+8px);opacity:0;cursor:pointer;border:none;padding:0;}',
    '.bsh-ap-hex{font-size:11px;font-weight:600;color:var(--ink-2,#555);',
    'font-family:var(--font-mono,"SF Mono",monospace);letter-spacing:.04em;flex:1;line-height:1.3;}',
    '.bsh-ap-hex small{display:block;font-size:10px;font-weight:400;color:var(--ink-3);',
    'text-transform:uppercase;letter-spacing:.07em;margin-bottom:2px;}'
  ].join('');

  function positionPop(wrap, pop){
    var r  = wrap.getBoundingClientRect();
    var pw = 180, ph = 80;
    var left = r.right - pw;
    if (left < 8) left = 8;
    var top = r.bottom + 6;
    if (top + ph > window.innerHeight) top = r.top - ph - 6;
    pop.style.left = left + 'px';
    pop.style.top  = top  + 'px';
  }

  function openPop(){
    if (!_pickerEl || !_wrap) return;
    _pickerOpen = true;
    positionPop(_wrap, _pickerEl);
    _pickerEl.classList.add('open');
  }
  function closePop(){
    _pickerOpen = false;
    if (_pickerEl) _pickerEl.classList.remove('open');
  }

  function mountPicker(){
    var isEmbedded = false;
    try { isEmbedded = new URLSearchParams(location.search).get('embed')==='split'; } catch(e){}
    if (isEmbedded) return;
    if (document.querySelector('.bsh-accent-btn')) return;

    var themeBtn = document.getElementById('btnTheme');
    if (!themeBtn || !themeBtn.parentNode) return;

    if (!document.getElementById('bsh-accent-css')){
      var st = document.createElement('style');
      st.id = 'bsh-accent-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }

    // Trigger button
    _wrap = document.createElement('div');
    _wrap.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0;';
    var triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.className = 'bsh-accent-btn';
    triggerBtn.setAttribute('title', 'Accent color');
    triggerBtn.setAttribute('aria-label', 'Choose accent color');
    triggerBtn.innerHTML = '<span class="bsh-accent-dot" style="background:'+current+'"></span>';
    _wrap.appendChild(triggerBtn);

    // Popover
    _pickerEl = document.createElement('div');
    _pickerEl.className = 'bsh-accent-pop';
    _pickerEl.setAttribute('role', 'dialog');
    _pickerEl.setAttribute('aria-label', 'Choose accent color');

    var row = document.createElement('div');
    row.className = 'bsh-ap-row';

    var wheelWrap = document.createElement('div');
    wheelWrap.className = 'bsh-ap-wheel';
    wheelWrap.title = 'Pick a color';

    _colorInput = document.createElement('input');
    _colorInput.type = 'color';
    _colorInput.value = current;
    _colorInput.setAttribute('aria-label', 'Choose accent color');
    wheelWrap.appendChild(_colorInput);
    row.appendChild(wheelWrap);

    var hexDiv = document.createElement('div');
    hexDiv.className = 'bsh-ap-hex';
    hexDiv.innerHTML = '<small>Accent</small>' + current.toUpperCase();
    row.appendChild(hexDiv);

    _pickerEl.appendChild(row);
    document.body.appendChild(_pickerEl);
    themeBtn.parentNode.insertBefore(_wrap, themeBtn);

    // Live preview
    _colorInput.addEventListener('input', function(){
      var val = _colorInput.value;
      hexDiv.innerHTML = '<small>Accent</small>' + val.toUpperCase();
      applyValue(val);
      var dot = triggerBtn.querySelector('.bsh-accent-dot');
      if (dot) dot.style.background = val;
    });
    // Save on close
    _colorInput.addEventListener('change', function(){
      saveAndSync(_colorInput.value);
    });

    triggerBtn.addEventListener('click', function(e){
      e.stopPropagation();
      if (_pickerOpen) closePop(); else openPop();
    });
    document.addEventListener('click', function(e){
      if (_pickerOpen && !_pickerEl.contains(e.target) && !_wrap.contains(e.target)) closePop();
    });
    document.addEventListener('keydown', function(e){ if (e.key==='Escape') closePop(); });
    window.addEventListener('resize', function(){ if (_pickerOpen) positionPop(_wrap, _pickerEl); });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', mountPicker);
  } else {
    mountPicker();
  }

  window.BshAccent = {
    set: saveAndSync,
    get: function(){ return current; }
  };
})();
