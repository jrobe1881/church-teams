/* bp-spinner.js — Bible Parlor branded loading spinner.
 *
 * Exposes:
 *   window.BPSpinner.html(opts)    -> HTML string, embed anywhere
 *   window.BPSpinner.el(opts)      -> HTMLElement, insert into DOM
 *   window.BPSpinner.markup(opts)  -> alias for html()
 *
 * opts:
 *   size   — pixel size of the star   (default 24)
 *   label  — optional trailing text   (default '')
 *   inline — true = inline-flex row (spinner + label side by side)
 *            false = center-stacked  (spinner above label)
 *   tone   — 'accent' | 'ink' | 'muted'  (default 'accent' — burgundy)
 *
 * The spinner is a rotating cardinal-star (the site brand mark) with a
 * gentle pulse. All motion respects prefers-reduced-motion.
 */
(function () {
  'use strict';

  function starSvg(size, tone) {
    var color =
      tone === 'ink'    ? 'var(--ink, #1a1a1a)' :
      tone === 'muted'  ? 'var(--ink-3, #8a8a8a)' :
                          'var(--accent, #7a1f2b)';
    // 4-point cardinal star matches /favicon.svg — the site mark.
    return (
      '<svg class="bp-spin__star" xmlns="http://www.w3.org/2000/svg" ' +
      'width="' + size + '" height="' + size + '" viewBox="0 0 32 32" ' +
      'aria-hidden="true" focusable="false">' +
        '<path d="M16 0 L19 13 L32 16 L19 19 L16 32 L13 19 L0 16 L13 13 Z" ' +
        'fill="' + color + '"/>' +
      '</svg>'
    );
  }

  function html(opts) {
    opts = opts || {};
    var size   = Math.max(12, parseInt(opts.size, 10) || 24);
    var label  = (opts.label != null) ? String(opts.label) : '';
    var inline = opts.inline !== false; // default inline row
    var tone   = opts.tone || 'accent';
    var cls    = 'bp-spin' + (inline ? ' bp-spin--inline' : ' bp-spin--stack');
    var star   = starSvg(size, tone);
    // Escape label
    var esc = label
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    var labelHtml = esc
      ? '<span class="bp-spin__label">' + esc + '</span>'
      : '';
    return (
      '<span class="' + cls + '" role="status" aria-live="polite">' +
        star +
        labelHtml +
      '</span>'
    );
  }

  function el(opts) {
    var wrap = document.createElement('span');
    wrap.innerHTML = html(opts);
    return wrap.firstChild;
  }

  window.BPSpinner = { html: html, el: el, markup: html };
})();
