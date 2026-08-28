/* /shared/i18n.js — Internationalisation engine for Bible Parlor.
 *
 *  Strategy:
 *   1. On page load: reads bsh_lang_v1 from localStorage (default: 'en').
 *   2. Fetches /shared/locales/<lang>.json, then applies translations:
 *        a. Elements with data-i18n="key"       → textContent
 *        b. Elements with data-i18n-html="key"  → innerHTML
 *        c. Elements with data-i18n-attr="a:k,b:k" → attributes
 *        d. Elements with data-i18n-ph="key"    → placeholder attribute
 *   3. On setLang(): saves new code, then reloads the page so that all
 *      JS-rendered content (which runs on load) picks up the new locale.
 *   4. Exposes window.BpI18n:
 *        .t(key, fallback?) — translate a key with optional English fallback
 *        .lang              — current locale code
 *        .setLang(code)     — switch + reload
 *        .onReady(fn)       — callback once locale loaded & applied
 *        .LOCALES           — [{code, name, nativeName}]
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'bsh_lang_v1';
  var DEFAULT_LANG = 'en';

  var LOCALES = [
    { code: 'en', name: 'English',  nativeName: 'English' },
    { code: 'es', name: 'Spanish',  nativeName: 'Español' }
  ];

  var currentLang = (function () {
    try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG; }
    catch (e) { return DEFAULT_LANG; }
  })();

  var cache = window.__i18nCache || (window.__i18nCache = {});
  var readyCallbacks = [];
  var loaded = false;

  var BpI18n = {};
  BpI18n.LOCALES = LOCALES;
  Object.defineProperty(BpI18n, 'lang', { get: function () { return currentLang; } });

  /* t(key, fallback?) — returns translation or fallback or key. */
  BpI18n.t = function (key, fallback) {
    var map = cache[currentLang] || cache[DEFAULT_LANG] || {};
    if (map[key] !== undefined) return map[key];
    if (typeof fallback === 'string') return fallback;
    return key;
  };

  BpI18n.onReady = function (fn) {
    if (loaded) { Promise.resolve().then(fn); return; }
    readyCallbacks.push(fn);
  };

  /* setLang — save preference and reload so all JS-rendered strings pick up the new locale. */
  BpI18n.setLang = function (code) {
    if (!LOCALES.some(function (l) { return l.code === code; })) return;
    if (code === currentLang) return;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) {}
    // Reload so every page's JS renders in the new language from scratch.
    location.reload();
  };

  /* ---- locale fetch ---- */
  function loadLocale(code, cb) {
    if (cache[code]) { cb(); return; }
    fetch('/shared/locales/' + code + '.json')
      .then(function (r) { return r.json(); })
      .then(function (data) { cache[code] = data; cb(); })
      .catch(function () {
        if (!cache[code]) cache[code] = cache[DEFAULT_LANG] || {};
        cb();
      });
  }

  /* ---- DOM application ---- */
  function applyToPage() {
    var t = BpI18n.t.bind(BpI18n);

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(',').forEach(function (pair) {
        var idx = pair.indexOf(':');
        if (idx < 0) return;
        el.setAttribute(pair.slice(0, idx).trim(), t(pair.slice(idx + 1).trim()));
      });
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });

    // <html lang>
    document.documentElement.lang = currentLang;

    // <title>
    var map = cache[currentLang] || {};
    if (map['site.title']) document.title = map['site.title'];

    // Language switcher active state
    document.querySelectorAll('.bp-lang-item').forEach(function (el) {
      var active = el.dataset.langCode === currentLang;
      el.setAttribute('aria-checked', active ? 'true' : 'false');
      el.classList.toggle('is-active', active);
      el.innerHTML = '<span class="hub-tools-item-lbl">' + (active ? '✓ ' : '') +
        (el.dataset.langName || el.dataset.langCode) + '</span>';
    });
  }

  function fireReady() {
    loaded = true;
    applyToPage();
    readyCallbacks.splice(0).forEach(function (fn) { fn(); });
    setTimeout(function () {
      document.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang: currentLang } }));
    }, 0);
  }

  /* ---- Bootstrap ---- */
  function bootstrap() {
    var needed = currentLang === DEFAULT_LANG
      ? [DEFAULT_LANG]
      : [DEFAULT_LANG, currentLang];
    var remaining = needed.length;
    needed.forEach(function (code) {
      loadLocale(code, function () {
        if (--remaining === 0) fireReady();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  window.BpI18n = BpI18n;
})();
