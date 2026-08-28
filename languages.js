/* /teams/languages.js — shared list of languages we support for student
   preferred_language and teacher.languages[]. Ordered by real-world coverage
   and Apostolic mission relevance. Add as needed; codes are ISO 639-1
   lowercase where they exist. */
(function(){
  var LANGUAGES = [
    { code: 'en',    label: 'English' },
    { code: 'es',    label: 'Spanish' },
    { code: 'zh',    label: 'Chinese (Mandarin)' },
    { code: 'yue',   label: 'Chinese (Cantonese)' },
    { code: 'ar',    label: 'Arabic' },
    { code: 'hi',    label: 'Hindi' },
    { code: 'pa',    label: 'Punjabi' },
    { code: 'ur',    label: 'Urdu' },
    { code: 'bn',    label: 'Bengali' },
    { code: 'tl',    label: 'Tagalog / Filipino' },
    { code: 'vi',    label: 'Vietnamese' },
    { code: 'ko',    label: 'Korean' },
    { code: 'ja',    label: 'Japanese' },
    { code: 'th',    label: 'Thai' },
    { code: 'km',    label: 'Khmer' },
    { code: 'my',    label: 'Burmese' },
    { code: 'id',    label: 'Indonesian / Malay' },
    { code: 'pt',    label: 'Portuguese' },
    { code: 'fr',    label: 'French' },
    { code: 'ht',    label: 'Haitian Creole' },
    { code: 'de',    label: 'German' },
    { code: 'it',    label: 'Italian' },
    { code: 'pl',    label: 'Polish' },
    { code: 'ro',    label: 'Romanian' },
    { code: 'ru',    label: 'Russian' },
    { code: 'uk',    label: 'Ukrainian' },
    { code: 'sr',    label: 'Serbian' },
    { code: 'hr',    label: 'Croatian' },
    { code: 'bs',    label: 'Bosnian' },
    { code: 'sq',    label: 'Albanian' },
    { code: 'el',    label: 'Greek' },
    { code: 'tr',    label: 'Turkish' },
    { code: 'fa',    label: 'Persian / Farsi' },
    { code: 'ps',    label: 'Pashto' },
    { code: 'so',    label: 'Somali' },
    { code: 'sw',    label: 'Swahili' },
    { code: 'am',    label: 'Amharic' },
    { code: 'ti',    label: 'Tigrinya' },
    { code: 'ha',    label: 'Hausa' },
    { code: 'ig',    label: 'Igbo' },
    { code: 'yo',    label: 'Yoruba' },
    { code: 'zu',    label: 'Zulu' },
    { code: 'xh',    label: 'Xhosa' },
    { code: 'af',    label: 'Afrikaans' },
    { code: 'ta',    label: 'Tamil' },
    { code: 'te',    label: 'Telugu' },
    { code: 'ml',    label: 'Malayalam' },
    { code: 'mr',    label: 'Marathi' },
    { code: 'gu',    label: 'Gujarati' },
    { code: 'ne',    label: 'Nepali' },
    { code: 'si',    label: 'Sinhala' },
    { code: 'he',    label: 'Hebrew' },
    { code: 'nl',    label: 'Dutch' },
    { code: 'sv',    label: 'Swedish' },
    { code: 'no',    label: 'Norwegian' },
    { code: 'fi',    label: 'Finnish' },
    { code: 'da',    label: 'Danish' },
    { code: 'hu',    label: 'Hungarian' },
    { code: 'cs',    label: 'Czech' },
    { code: 'sk',    label: 'Slovak' },
    { code: 'bg',    label: 'Bulgarian' },
    { code: 'asl',   label: 'American Sign Language' },
    { code: 'other', label: 'Other' }
  ];

  var byCode = Object.create(null);
  LANGUAGES.forEach(function(l){ byCode[l.code] = l.label; });

  function labelOf(code){
    if (!code) return '';
    return byCode[String(code).toLowerCase()] || code;
  }

  function optionsHtml(selectedCode){
    var esc = function(s){ return String(s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); };
    var sel = String(selectedCode || '').toLowerCase();
    return '<option value="">Select a language</option>' +
      LANGUAGES.map(function(l){
        return '<option value="' + esc(l.code) + '"' + (l.code === sel ? ' selected' : '') + '>' + esc(l.label) + '</option>';
      }).join('');
  }

  function checkboxesHtml(idPrefix, selectedCodes){
    var esc = function(s){ return String(s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); };
    var set = {};
    (selectedCodes || []).forEach(function(c){ set[String(c).toLowerCase()] = true; });
    var html = '<div class="teams-lang-grid" role="group" aria-label="Languages spoken">';
    LANGUAGES.forEach(function(l){
      var id = idPrefix + '_' + l.code;
      html += '<label class="teams-lang-item" for="' + esc(id) + '">' +
        '<input type="checkbox" id="' + esc(id) + '" data-lang-code="' + esc(l.code) + '"' + (set[l.code] ? ' checked' : '') + ' />' +
        '<span>' + esc(l.label) + '</span></label>';
    });
    html += '</div>';
    return html;
  }

  function readCheckboxes(root){
    var out = [];
    Array.prototype.forEach.call(root.querySelectorAll('input[data-lang-code]:checked'), function(cb){
      out.push(cb.getAttribute('data-lang-code'));
    });
    return out;
  }

  window.TeamsLanguages = {
    LIST: LANGUAGES,
    labelOf: labelOf,
    optionsHtml: optionsHtml,
    checkboxesHtml: checkboxesHtml,
    readCheckboxes: readCheckboxes
  };
})();
