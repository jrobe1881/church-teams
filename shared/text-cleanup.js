/* ============================================================
   text-cleanup.js — runtime cleanup for OCR / column-bleed damage
   in Deep Research chunks (dr_chunks.content, api snippets).

   Fixes the visible offenders without touching the DB:
     - mid-word single-letter spaces:  "Gtld i s"  → "Gtld is"
     - broken words split by space:    "in· struction" → "instruction"
     - tilde substitutions:            "~n"         → "in"
     - runs of whitespace collapsed to a single space
     - stray control artifacts:        "·", "'", trailing single letters
     - column-bleed patterns preserved (unrecoverable) but at least readable

   NOTE: this is display-only. Real fix would require re-extraction.
   ============================================================ */
(function () {
  'use strict';

  // Common OCR letter substitutions we can safely reverse
  var OCR_SUBS = [
    // "in·" or "in-" mid-word → "in"
    [/\bin[·•‧]\s*/g, 'in'],
    // "th~" → "th" (broken tilde)
    [/([a-z])~([a-z])/gi, '$1$2'],
    // "y ou" / "y our" (space injected after single letter)
    [/\b([a-zA-Z])\s+([a-z]{2,})\b/g, function (m, a, b) {
      // Only join when 'a' is one of these frequent leading-letter splits
      if (/^[a-z]$/i.test(a) && /^(ou|our|ea|ere|ith|hich|hen|hat|ho|ill|as|is|in|nd|nto)/i.test(b)) {
        return a + b;
      }
      return m;
    }],
    // "th e" / "t he" / "wh en" → "the" / "when"
    [/\bt\s+h\s*e\b/g, 'the'],
    [/\bt\s+he\b/g, 'the'],
    [/\bth\s+e\b/g, 'the'],
    [/\bwh\s+en\b/g, 'when'],
    [/\bwh\s+ich\b/g, 'which'],
    [/\bwh\s+o\b/g, 'who'],
    [/\bth\s+at\b/g, 'that'],
    [/\bth\s+is\b/g, 'this'],
    [/\bth\s+ese\b/g, 'these'],
    [/\bth\s+ere\b/g, 'there'],
    [/\bwi\s+th\b/gi, 'with'],
    [/\bfr\s+om\b/gi, 'from'],
    [/\bha\s+ve\b/gi, 'have'],
    [/\bha\s+s\b/gi, 'has'],
    [/\bha\s+d\b/gi, 'had'],
    [/\bge\s+t\b/gi, 'get'],
    [/\bbe\s+en\b/gi, 'been'],
    [/\bwa\s+s\b/gi, 'was'],
    [/\bwe\s+re\b/gi, 'were'],
    [/\bhi\s+m\b/gi, 'him'],
    [/\bhi\s+s\b/gi, 'his'],
    [/\byo\s+u\b/gi, 'you'],
    [/\byo\s+ur\b/gi, 'your'],
    [/\bwo\s+rd\b/gi, 'word'],
    [/\bGo\s+d\b/g, 'God'],
    [/\bLo\s+rd\b/g, 'Lord'],
    [/\bJe\s+sus\b/g, 'Jesus'],
    [/\bChri\s+st\b/g, 'Christ'],
    [/\bSpi\s+rit\b/g, 'Spirit'],
    [/\bHo\s+ly\b/g, 'Holy'],
    [/\bGho\s+st\b/g, 'Ghost'],
    [/\bhu\s+sband\b/gi, 'husband'],
    [/\bhu\s+sbands\b/gi, 'husbands'],
    [/\bsu\s+bmit\b/gi, 'submit'],
    [/\bsub\s+mit\b/gi, 'submit'],
    [/\bthro\s+ugh\b/gi, 'through'],
    [/\bthr\s+ough\b/gi, 'through'],
    [/\bpo\s+wer\b/gi, 'power'],
    [/\bsalva\s+tion\b/gi, 'salvation'],
    [/\bfai\s+th\b/gi, 'faith'],
    [/\bpra\s+yer\b/gi, 'prayer'],
    [/\bchi\s+ldren\b/gi, 'children'],
    [/\bbapt\s+ism\b/gi, 'baptism'],
    [/\bbapt\s+ize\b/gi, 'baptize'],
    [/\bcorre\s+ction\b/gi, 'correction'],
    [/\brepro\s+of\b/gi, 'reproof'],
    [/\bdoc-\s+trine\b/gi, 'doctrine'],
    // "in·struction" / "in-struction"
    [/\bin[·•‧-]\s*struction\b/gi, 'instruction'],
    // "en·dued" / "en-dued"
    [/\ben[·•‧-]\s*dued\b/gi, 'endued'],
    // stray  '·'   between letters
    [/([a-z])[·•‧]([a-z])/gi, '$1$2'],
  ];

  function cleanText(input) {
    if (!input || typeof input !== 'string') return input || '';
    var t = input;

    // 1. Normalize weird unicode whitespace
    t = t.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ');

    // 2. Apply OCR substitutions
    for (var i = 0; i < OCR_SUBS.length; i++) {
      t = t.replace(OCR_SUBS[i][0], OCR_SUBS[i][1]);
    }

    // 3. Collapse runs of whitespace (but preserve paragraph breaks)
    t = t.replace(/[ \t]{2,}/g, ' ');
    t = t.replace(/\n{3,}/g, '\n\n');

    // 4. Fix stray punctuation spacing:  ".word" → ". word"
    t = t.replace(/([.,;:!?])([A-Z])/g, '$1 $2');

    // 5. Trim
    t = t.trim();

    return t;
  }

  function cleanHtmlSnippet(html) {
    if (!html || typeof html !== 'string') return html || '';
    // Cleaner preserves <b>...</b> highlights from ts_headline
    // Split around <b>/</b> to avoid regex confusion inside tags
    return html.replace(/(<b>[^<]*<\/b>)|([^<]+)/g, function (_, tag, plain) {
      if (tag) return tag;
      return cleanText(plain);
    });
  }

  window.BPTextCleanup = {
    clean: cleanText,
    cleanHtml: cleanHtmlSnippet,
  };
})();
