/* explorer-qa.js v2 — Tool-driven, multi-turn Bible Q&A for the Explorer.

   Public API (backward compatible):
     BshQA.parse(question)                -> lightweight local parse (kept for topic pre-search)
     BshQA.ask(question, verses, opts)    -> Promise<{ text, model }>    (legacy one-shot)
     BshQA.chat(messages, opts)           -> Promise<{ text, model }>    (new — multi-turn, tool-use)
     BshQA.isAIReady()                    -> true
     BshQA.harvestVerses(...)             -> unchanged (used by explorer overlay for topic seed verses)
     BshQA.tools                          -> object of tool implementations (search_kjv, get_passage, get_xrefs, get_strongs)

   The AI backend (/api/ask) supports OpenAI-style tool calls. When the model
   requests a tool, this client executes it against the site's static KJV data
   (all 66 books), Treasury of Scripture Knowledge cross-references, and
   Strong's Concordance, then feeds the result back to the model in a new
   turn. The loop runs up to MAX_TOOL_TURNS iterations, then forces a final
   text-only answer.

   Everything is Apostolic Pentecostal / Oneness doctrinally framed in the
   server system prompt. Verse text is always fetched from real static data
   — the model never invents Scripture text.
*/
(function(){
  if (window.BshQA && window.BshQA._v === 2) return;

  var DATA_SRC = '/sermon/';           // same as explorer/reader for verse JSONs
  var STRONGS_SRC = '/strongs/';        // for lexicon + Strong's search idx
  var XREFS_SRC = '/sermon/xrefs.js';   // Treasury of Scripture Knowledge
  var MAX_TOOL_TURNS = 4;               // safety cap on tool-use rounds

  /* =====================================================================
     Section 1 — Static data loaders (all lazy, cached in memory)
     ===================================================================== */
  var _books = null;        // [{id, name, abbr, vfile}]
  var _bookByName = null;   // { "genesis": bookObj, "gen": bookObj, "1 cor": ... }
  var _bookVerses = {};     // { bookId: [[c, v, [tokens...], strongs?], ...] }
  var _xrefs = null;        // { "GEN|1:1": ["JHN|1:1-3", ...], ... }
  var _lexG = null;
  var _lexH = null;

  function loadBooks(){
    if (_books) return Promise.resolve(_books);
    return fetch(DATA_SRC + 'books.json').then(function(r){ return r.json(); }).then(function(arr){
      _books = arr;
      _bookByName = {};
      var aliases = {
        'psalm':'PSA','psalms':'PSA','song of songs':'SNG','canticles':'SNG','revelation':'REV','revelations':'REV',
        'gen':'GEN','ex':'EXO','exo':'EXO','lev':'LEV','num':'NUM','deu':'DEU','deut':'DEU','jos':'JOS','josh':'JOS',
        'jdg':'JDG','judg':'JDG','rut':'RUT','1sam':'1SA','1 sam':'1SA','1 samuel':'1SA','2sam':'2SA','2 sam':'2SA','2 samuel':'2SA',
        '1kings':'1KI','1 kings':'1KI','1ki':'1KI','2kings':'2KI','2 kings':'2KI','2ki':'2KI',
        '1chron':'1CH','1 chron':'1CH','1 chronicles':'1CH','1ch':'1CH','2chron':'2CH','2 chron':'2CH','2 chronicles':'2CH','2ch':'2CH',
        'ezra':'EZR','neh':'NEH','est':'EST','esth':'EST','ps':'PSA','pss':'PSA','pro':'PRO','prov':'PRO','ecc':'ECC','eccl':'ECC','qoh':'ECC',
        'sng':'SNG','song':'SNG','song of solomon':'SNG','isa':'ISA','isaiah':'ISA','jer':'JER','lam':'LAM','ezk':'EZK','ezek':'EZK','ezekiel':'EZK',
        'dan':'DAN','hos':'HOS','joe':'JOL','joel':'JOL','amo':'AMO','amos':'AMO','oba':'OBA','obad':'OBA','jon':'JON','jonah':'JON',
        'mic':'MIC','micah':'MIC','nah':'NAM','nahum':'NAM','hab':'HAB','habakkuk':'HAB','zep':'ZEP','zeph':'ZEP','zephaniah':'ZEP',
        'hag':'HAG','haggai':'HAG','zec':'ZEC','zech':'ZEC','zechariah':'ZEC','mal':'MAL','malachi':'MAL',
        'mat':'MAT','matt':'MAT','matthew':'MAT','mrk':'MRK','mar':'MRK','mark':'MRK','luk':'LUK','luke':'LUK','jhn':'JHN','joh':'JHN','john':'JHN',
        'act':'ACT','acts':'ACT','rom':'ROM','romans':'ROM',
        '1cor':'1CO','1 cor':'1CO','1 corinthians':'1CO','1co':'1CO','2cor':'2CO','2 cor':'2CO','2 corinthians':'2CO','2co':'2CO',
        'gal':'GAL','galatians':'GAL','eph':'EPH','ephesians':'EPH','phi':'PHP','php':'PHP','phil':'PHP','philippians':'PHP',
        'col':'COL','colossians':'COL',
        '1th':'1TH','1 thess':'1TH','1 thessalonians':'1TH','1ths':'1TH','2th':'2TH','2 thess':'2TH','2 thessalonians':'2TH','2ths':'2TH',
        '1tim':'1TI','1 tim':'1TI','1 timothy':'1TI','1ti':'1TI','2tim':'2TI','2 tim':'2TI','2 timothy':'2TI','2ti':'2TI',
        'tit':'TIT','titus':'TIT','phm':'PHM','phile':'PHM','philemon':'PHM','heb':'HEB','hebrews':'HEB','jam':'JAS','jas':'JAS','james':'JAS',
        '1pe':'1PE','1 pet':'1PE','1 peter':'1PE','1pet':'1PE','2pe':'2PE','2 pet':'2PE','2 peter':'2PE','2pet':'2PE',
        '1jn':'1JN','1 john':'1JN','1jo':'1JN','2jn':'2JN','2 john':'2JN','2jo':'2JN','3jn':'3JN','3 john':'3JN','3jo':'3JN',
        'jud':'JUD','jude':'JUD','rev':'REV','revelation':'REV','revelations':'REV','apoc':'REV'
      };
      arr.forEach(function(b){
        _bookByName[b.id.toLowerCase()] = b;
        _bookByName[b.name.toLowerCase()] = b;
        _bookByName[b.abbr.toLowerCase()] = b;
      });
      Object.keys(aliases).forEach(function(k){
        var id = aliases[k];
        var b = arr.find(function(x){ return x.id === id; });
        if (b) _bookByName[k] = b;
      });
      return arr;
    });
  }

  function loadBook(bookId){
    if (_bookVerses[bookId]) return Promise.resolve(_bookVerses[bookId]);
    return loadBooks().then(function(){
      var b = _books.find(function(x){ return x.id === bookId; });
      if (!b) return null;
      return fetch(DATA_SRC + b.vfile).then(function(r){ return r.json(); }).then(function(rows){
        _bookVerses[bookId] = rows;
        return rows;
      });
    });
  }

  function loadAllBooks(){
    return loadBooks().then(function(arr){
      return Promise.all(arr.map(function(b){ return loadBook(b.id); }));
    });
  }

  function loadXrefs(){
    if (_xrefs) return Promise.resolve(_xrefs);
    return fetch(XREFS_SRC).then(function(r){ return r.text(); }).then(function(txt){
      var s = txt.replace(/^\s*const\s+XREFS\s*=\s*/,'').replace(/;\s*$/,'');
      _xrefs = JSON.parse(s);
      return _xrefs;
    });
  }

  function loadLex(kind){  // 'G' or 'H'
    if (kind === 'G' && _lexG) return Promise.resolve(_lexG);
    if (kind === 'H' && _lexH) return Promise.resolve(_lexH);
    var file = STRONGS_SRC + 'lexicon_' + kind + '.js';
    return fetch(file).then(function(r){ return r.text(); }).then(function(txt){
      var s = txt.replace(new RegExp('^\\s*const\\s+LEX_'+kind+'\\s*=\\s*'),'').replace(/;\s*$/,'');
      var obj = JSON.parse(s);
      if (kind === 'G') _lexG = obj; else _lexH = obj;
      return obj;
    });
  }

  /* =====================================================================
     Section 2 — Verse helpers (tokens -> string, ref parsing)
     ===================================================================== */
  function tokensToText(toks){
    if (!toks || !toks.length) return '';
    var s = '';
    for (var k=0;k<toks.length;k++){
      var t = toks[k];
      if (k===0){ s = t; continue; }
      if (/^[\.,;:!\?\)\]]/.test(t)) s += t;
      else s += ' ' + t;
    }
    return s;
  }

  function parseRef(refStr){
    // Handles "Book Chapter:Verse", "Book Chapter:Verse-Verse", "Book Chapter", "Book Chapter:V1,V2,V3" (first only)
    if (!refStr) return null;
    refStr = String(refStr).trim();
    var m = /^\s*((?:\d\s?)?[A-Za-z][A-Za-z\.\s]*?)\s+(\d+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$/.exec(refStr);
    if (!m) return null;
    var bookQ = m[1].replace(/\./g,'').replace(/\s+/g,' ').trim().toLowerCase();
    if (!_bookByName) return null;
    var b = _bookByName[bookQ];
    if (!b){
      // Try last-space split (e.g. "1 Cor" → "1cor" alias)
      b = _bookByName[bookQ.replace(/\s+/g,'')];
    }
    if (!b) return null;
    return {
      id: b.id,
      book: b.name,
      chapter: parseInt(m[2],10),
      verse: m[3] ? parseInt(m[3],10) : null,
      verseEnd: m[4] ? parseInt(m[4],10) : null,
      wholeChapter: !m[3]
    };
  }

  function formatRef(pr){
    var b = _books && _books.find(function(x){ return x.id === pr.id; });
    var nm = b ? b.name : pr.id;
    if (pr.wholeChapter) return nm + ' ' + pr.chapter;
    if (pr.verseEnd && pr.verseEnd !== pr.verse) return nm + ' ' + pr.chapter + ':' + pr.verse + '-' + pr.verseEnd;
    return nm + ' ' + pr.chapter + ':' + pr.verse;
  }

  /* =====================================================================
     Section 3 — Tool implementations (client-side)
     ===================================================================== */

  // Tool: search_kjv(query, limit)  — full-text keyword search across ALL 66 books
  function tool_search_kjv(args){
    var query = String(args.query || '').trim().toLowerCase();
    var limit = Math.min(parseInt(args.limit || 20, 10) || 20, 40);
    if (!query) return Promise.resolve({ error: 'query required' });

    // Split into keywords, drop tiny stopwords
    var stops = { 'the':1,'and':1,'a':1,'an':1,'of':1,'in':1,'to':1,'for':1,'is':1,'are':1,'was':1,'were':1,'be':1,'or':1,'on':1,'that':1,'this':1,'it':1,'as':1,'by':1,'with':1,'at':1,'from':1 };
    var kws = query.split(/\s+/).filter(function(w){ return w.length >= 2 && !stops[w]; });
    if (!kws.length) kws = query.split(/\s+/).filter(function(w){ return w.length; });

    return loadAllBooks().then(function(){
      var results = [];
      var scoreCap = Infinity;
      // Score = number of keyword matches (all keywords required = AND semantics)
      for (var bi=0; bi<_books.length && results.length < limit * 3; bi++){
        var b = _books[bi];
        var rows = _bookVerses[b.id];
        if (!rows) continue;
        for (var i=0;i<rows.length;i++){
          var row = rows[i];
          var text = tokensToText(row[2]).toLowerCase();
          var allMatch = true;
          for (var k=0;k<kws.length;k++){
            if (text.indexOf(kws[k]) < 0){ allMatch = false; break; }
          }
          if (!allMatch) continue;
          // Score = sum of occurrences (encourages density)
          var score = 0;
          kws.forEach(function(kw){ var idx = -1; while ((idx = text.indexOf(kw, idx+1)) >= 0) score++; });
          results.push({
            book: b.id, chapter: row[0], verse: row[1], score: score,
            ref: b.name + ' ' + row[0] + ':' + row[1],
            text: tokensToText(row[2])
          });
        }
      }
      // Sort by score desc, then canonical book order (already in _books order)
      results.sort(function(a,b){ return b.score - a.score; });
      return { results: results.slice(0, limit), total_matches: results.length, query: query };
    });
  }

  // Tool: get_passage(reference) — fetch KJV text for a reference
  function tool_get_passage(args){
    var ref = String(args.reference || '').trim();
    if (!ref) return Promise.resolve({ error: 'reference required' });
    return loadBooks().then(function(){
      var pr = parseRef(ref);
      if (!pr) return { error: 'Could not parse reference: ' + ref };
      return loadBook(pr.id).then(function(rows){
        if (!rows) return { error: 'Book not found: ' + pr.id };
        var out = [];
        rows.forEach(function(row){
          if (row[0] !== pr.chapter) return;
          if (pr.wholeChapter){
            out.push({ ref: pr.book + ' ' + row[0] + ':' + row[1], verse: row[1], text: tokensToText(row[2]) });
          } else if (pr.verseEnd){
            if (row[1] >= pr.verse && row[1] <= pr.verseEnd){
              out.push({ ref: pr.book + ' ' + row[0] + ':' + row[1], verse: row[1], text: tokensToText(row[2]) });
            }
          } else if (row[1] === pr.verse){
            out.push({ ref: pr.book + ' ' + row[0] + ':' + row[1], verse: row[1], text: tokensToText(row[2]) });
          }
        });
        if (!out.length) return { error: 'No verses found for ' + ref };
        // Cap chapter fetches at 50 verses to keep tokens reasonable
        if (out.length > 50) out = out.slice(0, 50).concat([{ note: '(truncated at 50 verses)' }]);
        return { passage: out, reference: formatRef(pr) };
      });
    });
  }

  // Tool: get_xrefs(reference, limit) — cross-references for a verse
  function tool_get_xrefs(args){
    var ref = String(args.reference || '').trim();
    var limit = Math.min(parseInt(args.limit || 15, 10) || 15, 30);
    if (!ref) return Promise.resolve({ error: 'reference required' });
    return Promise.all([loadBooks(), loadXrefs()]).then(function(){
      var pr = parseRef(ref);
      if (!pr) return { error: 'Could not parse reference: ' + ref };
      var key = pr.id + '|' + pr.chapter + ':' + (pr.verse || 1);
      var refs = _xrefs[key];
      if (!refs || !refs.length) return { reference: formatRef(pr), xrefs: [], note: 'No cross-references indexed for this verse.' };
      // Each xref is like "JHN|1:1-3"; resolve to text (first verse of any range)
      var lim = Math.min(refs.length, limit);
      var toFetch = refs.slice(0, lim).map(function(x){
        var parts = x.split('|'); if (parts.length !== 2) return null;
        var id = parts[0]; if (id === 'PSM') id = 'PSA';
        var m = /^(\d+):(\d+)(?:-(\d+))?/.exec(parts[1]);
        if (!m) return null;
        return { id:id, chapter:parseInt(m[1],10), verse:parseInt(m[2],10), verseEnd:m[3]?parseInt(m[3],10):null };
      }).filter(Boolean);
      return Promise.all(toFetch.map(function(x){
        return loadBook(x.id).then(function(rows){
          if (!rows) return null;
          var row = rows.find(function(r){ return r[0] === x.chapter && r[1] === x.verse; });
          if (!row) return null;
          var b = _books.find(function(z){ return z.id === x.id; });
          var refStr = (b?b.name:x.id) + ' ' + x.chapter + ':' + x.verse + (x.verseEnd?'-'+x.verseEnd:'');
          return { ref: refStr, text: tokensToText(row[2]) };
        });
      })).then(function(results){
        return { reference: formatRef(pr), xrefs: results.filter(Boolean) };
      });
    });
  }

  // Tool: get_strongs(word) — Strong's Concordance lookup
  function tool_get_strongs(args){
    var q = String(args.word || '').trim();
    if (!q) return Promise.resolve({ error: 'word required' });

    // If it's a Strong's number like G4102 or H430
    var m = /^([GH])(\d{1,4})$/i.exec(q);
    if (m){
      var kind = m[1].toUpperCase();
      var num = String(parseInt(m[2],10));
      return loadLex(kind).then(function(lex){
        var e = lex[num];
        if (!e) return { error: 'No entry for ' + kind + num };
        return { number: kind+num, lemma: e.lemma, translit: e.translit, kjv: e.kjv, definition: e.def, derivation: e.derivation || '' };
      });
    }

    // Otherwise it's an English word or transliteration — search both lexicons
    var qLower = q.toLowerCase();
    return Promise.all([loadLex('G'), loadLex('H')]).then(function(both){
      var out = [];
      ['G','H'].forEach(function(kind){
        var lex = kind === 'G' ? both[0] : both[1];
        Object.keys(lex).forEach(function(num){
          if (out.length >= 8) return;
          var e = lex[num];
          var kjvLower = String(e.kjv||'').toLowerCase();
          var translit = String(e.translit||'').toLowerCase().replace(/[^a-z]/g,'');
          var qNormal = qLower.replace(/[^a-z]/g,'');
          if (kjvLower.indexOf(qLower) >= 0 || translit === qNormal || translit.indexOf(qNormal) === 0){
            out.push({ number: kind+num, lemma: e.lemma, translit: e.translit, kjv: e.kjv, definition: e.def });
          }
        });
      });
      if (!out.length) return { error: 'No Strong\'s entry matches "' + q + '"' };
      return { query: q, matches: out };
    });
  }

  var TOOLS = {
    search_kjv: tool_search_kjv,
    get_passage: tool_get_passage,
    get_xrefs: tool_get_xrefs,
    get_strongs: tool_get_strongs
  };

  /* =====================================================================
     Section 4 — Chat loop with tool-use
     ===================================================================== */

  function callBackend(messages, opts){
    opts = opts || {};
    var timeoutMs = opts.timeoutMs || 60000;
    return new Promise(function(resolve, reject){
      var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timedOut = false;
      var timer = setTimeout(function(){
        timedOut = true;
        if (ctrl) try { ctrl.abort(); } catch(_e){}
        reject(new Error('AI request timed out'));
      }, timeoutMs);

      fetch('/api/ask/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: messages }),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function(res){
        if (!res.ok){
          return res.text().then(function(t){
            var msg = 'AI error ' + res.status;
            try { var j = JSON.parse(t); if (j && j.error) msg = j.error; } catch(_e){}
            throw new Error(msg);
          });
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buf = '';
        var text = '';
        var toolCalls = [];
        function pump(){
          return reader.read().then(function(step){
            if (step.done){
              clearTimeout(timer);
              if (timedOut) return;
              resolve({ text: text, toolCalls: toolCalls });
              return;
            }
            buf += decoder.decode(step.value, { stream: true });
            var lines = buf.split('\n');
            buf = lines.pop() || '';
            for (var i=0;i<lines.length;i++){
              var line = lines[i].trim();
              if (!line || line.indexOf('data:') !== 0) continue;
              var raw = line.slice(5).trim();
              if (!raw || raw === '[DONE]') continue;
              try {
                var j = JSON.parse(raw);
                if (j.delta){
                  text += j.delta;
                  if (opts.onDelta) try { opts.onDelta(j.delta); } catch(_e){}
                } else if (j.tool_call){
                  toolCalls.push(j.tool_call);
                } else if (j.error){
                  throw new Error(j.error);
                }
              } catch(_e){ /* malformed chunk */ }
            }
            return pump();
          });
        }
        return pump();
      }).catch(function(err){
        if (timedOut) return;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  // Main entry — send a conversation and run the tool-use loop.
  // messages = [{role:'user'|'assistant'|'system'|'tool', content:'...', tool_call_id?, name?}]
  // opts.onDelta(fragment)         — streaming text callback (final answer only, not tool-turn text)
  // opts.onTool(name, args, res)   — called for each tool execution (for UI badges)
  function chat(initialMessages, opts){
    opts = opts || {};
    var messages = initialMessages.slice();
    var turn = 0;

    function step(){
      turn++;
      // Buffer text this turn. If the turn ends with tool_calls, discard the text
      // (it's usually a preamble like "Let me look that up…"). If no tool_calls, stream
      // it live to the UI as it arrives.
      var buffered = '';
      var passThrough = null;  // set once we're confident the turn is final (see below)
      function streamCb(frag){
        buffered += frag;
        if (passThrough) { try { opts.onDelta && opts.onDelta(frag); } catch(_e){} }
      }
      // We can't know in advance whether the turn will emit tool calls, but as a
      // pragmatic optimisation, after ~40 chars of streamed text with no tool_calls
      // detected yet, we flip into pass-through streaming so users see the answer live.
      // If a tool_call arrives later (unusual), the buffered text is discarded anyway.
      var passThroughTimer = setTimeout(function(){
        // If we've received any streamed text, start passing through subsequent deltas.
        // Also flush the buffered portion so far.
        if (buffered && !passThrough){
          passThrough = true;
          try { opts.onDelta && opts.onDelta(buffered); } catch(_e){}
        } else {
          passThrough = true;   // pass through as it arrives from here on
        }
      }, 600);
      return callBackend(messages, {
        timeoutMs: opts.timeoutMs || 60000,
        onDelta: streamCb
      }).then(function(res){
        clearTimeout(passThroughTimer);
        var hasCalls = res.toolCalls && res.toolCalls.length;

        if (!hasCalls){
          // Final answer. If we haven't started passing through, deliver buffered now.
          if (opts.onDelta && buffered && !passThrough){
            try { opts.onDelta(buffered); } catch(_e){}
          }
          return { text: buffered || res.text, model: 'gemini-2.5-flash' };
        }

        // Tool call turn — discard buffered preamble text (it was streamed to the user
        // if passThrough flipped on; that's ok, but we treat the answer as unfinished).
        // To keep the UX clean, if we already streamed preamble text and now realize this
        // was a tool-call turn, we tell the UI to reset by re-flushing an empty state:
        // simplest is to keep the streamed preamble visible — it reads as a natural
        // "thinking out loud" line before the tool badges appear. So do nothing here.


        // We have tool calls — execute them.
        // Hard cap: max 5 tool calls per turn to prevent payload overflow (Groq 413).
        var callsThisTurn = res.toolCalls.slice(0, 5);
        messages.push({
          role: 'assistant',
          content: res.text || null,
          tool_calls: callsThisTurn.map(function(tc){
            return { id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) } };
          })
        });

        // Run each tool
        return Promise.all(callsThisTurn.map(function(tc){
          var fn = TOOLS[tc.name];
          if (!fn){
            return Promise.resolve({ id: tc.id, name: tc.name, result: { error: 'Unknown tool: ' + tc.name } });
          }
          if (opts.onTool){ try { opts.onTool(tc.name, tc.args, null); } catch(_e){} }
          return Promise.resolve(fn(tc.args || {})).then(function(result){
            if (opts.onTool){ try { opts.onTool(tc.name, tc.args, result); } catch(_e){} }
            return { id: tc.id, name: tc.name, result: result };
          }).catch(function(err){
            var result = { error: String(err.message || err) };
            if (opts.onTool){ try { opts.onTool(tc.name, tc.args, result); } catch(_e){} }
            return { id: tc.id, name: tc.name, result: result };
          });
        })).then(function(toolResults){
          // Append tool result messages
          toolResults.forEach(function(tr){
            // Trim large results aggressively — with many tool calls in one turn, big
            // payloads add up and hit Groq's request-size limit (413).
            var content = JSON.stringify(tr.result);
            if (content.length > 1500) content = content.slice(0, 1500) + '...[truncated]';
            messages.push({
              role: 'tool',
              tool_call_id: tr.id,
              name: tr.name,
              content: content
            });
          });

          // If we've hit the tool-turn cap, ask for a final answer with a nudge
          if (turn >= MAX_TOOL_TURNS){
            messages.push({
              role: 'user',
              content: '(You have used enough tools. Now provide your final answer using the verses and lookups gathered above. Do not call any more tools.)'
            });
          }
          return step();
        });
      });
    }

    return step();
  }

  /* =====================================================================
     Section 5 — Legacy one-shot ask (backward compat)
     ===================================================================== */
  function ask(question, verses, opts){
    opts = opts || {};
    // Build a chat-style request with the provided verses as seed context.
    // The AI can still call tools if it wants more.
    var verseCtx = (verses||[]).slice(0,20).map(function(v){ return v.ref + ' — "' + v.text + '"'; }).join('\n');
    var userMsg = 'Question: ' + String(question||'').slice(0,500) +
      (verseCtx ? '\n\nSeed KJV verses (use these plus your tools to gather more if useful):\n' + verseCtx : '') +
      '\n\nAnswer using the doctrinal and style rules.';
    return chat([{ role: 'user', content: userMsg }], opts);
  }

  /* =====================================================================
     Section 6 — Local parse() kept for topic pre-selection
     ===================================================================== */
  var QUESTION_MARKERS = [
    /\b(where|what|who|why|how|when|which)\b/i,
    /\?$/,
    /\b(is|are|does|do|did|can|should|shall|will|would|could|may|might)\b\s+\w+/i,
    /^(tell|show|explain|describe|list|find)\b/i
  ];
  function detectIntent(q){
    var s = String(q||'').toLowerCase();
    var out = { where:false, what:false, how:false, who:false, why:false, when:false, list:false };
    if (/\bwhere\b/.test(s) || /find|located|passage|reference|references|verse|verses/.test(s)) out.where = true;
    if (/\bwhat\b|explain|meaning|means|definition|define|about/.test(s)) out.what = true;
    if (/\bhow\b|steps|process/.test(s)) out.how = true;
    if (/\bwho\b/.test(s)) out.who = true;
    if (/\bwhy\b|reason/.test(s)) out.why = true;
    if (/\bwhen\b/.test(s)) out.when = true;
    if (/\blist\b|all|every/.test(s)) out.list = true;
    if (!out.where && !out.what && !out.how && !out.who && !out.why && !out.when && !out.list) out.where = true;
    return out;
  }
  var STRIP_PREFIXES = [
    /^where (?:is|are|does|do|can (?:i|we|you) find)\b/i,
    /^(?:what|who|why|how|when|which)\s+(?:is|are|was|were|does|do|did|can|should|shall|will|would|could)?\s*/i,
    /^tell me (?:about|the)\s*/i,
    /^show me (?:the|some|all)?\s*/i,
    /^explain (?:the|to me|what)?\s*/i,
    /^find (?:me|the|some|all)?\s*/i,
    /^list (?:the|all|some)?\s*/i,
    /^give me (?:the|some|all)?\s*/i,
    /^describe (?:the)?\s*/i,
    /^i (?:want|need) to (?:know|find|understand)\s*(?:about|how|what|where|who)?\s*/i
  ];
  var STRIP_SUFFIXES = [
    /\?+$/,
    /\bin the (?:bible|scripture|scriptures|word|word of god|kjv)\b\.?$/i,
    /\bfrom the (?:bible|scripture|scriptures|kjv)\b\.?$/i,
    /\baccording to (?:the )?(?:bible|scripture|scriptures)\b\.?$/i,
    /\b(?:verse|verses|passage|passages|reference|references|scripture|scriptures)\b\.?$/i,
    /\babout (?:it|this|that)\b\.?$/i
  ];
  function normalize(q){
    var s = String(q||'').trim();
    var changed = true, safety = 0;
    while (changed && safety++ < 6){
      changed = false;
      STRIP_PREFIXES.forEach(function(re){ var s2 = s.replace(re, ''); if (s2 !== s){ s = s2.trim(); changed = true; } });
      STRIP_SUFFIXES.forEach(function(re){ var s2 = s.replace(re, ''); if (s2 !== s){ s = s2.trim(); changed = true; } });
    }
    return s;
  }
  // Concept map — kept for topic-search pre-selection. Not used to gate the AI (AI has full KJV now).
  var CONCEPT_MAP = [
    { patterns: [/speak(?:ing)?\s+in\s+tongues?/i, /unknown\s+tongues?/i, /other\s+tongues?/i, /gift\s+of\s+tongues?/i, /pray\s+in\s+the?\s*spirit/i], topic: 'SPEAKING IN TONGUES', keywords: ['tongues','speaking','spirit'] },
    { patterns: [/baptism\s+(?:of|in|with)\s+the?\s*holy\s*(?:ghost|spirit)/i, /holy\s*(?:ghost|spirit)\s+baptism/i, /filled\s+with\s+the?\s*holy\s*(?:ghost|spirit)/i, /receive\s+the?\s*holy\s*(?:ghost|spirit)/i], topic: 'BAPTISM OF THE HOLY GHOST', keywords: ['holy','ghost','baptism','spirit'] },
    { patterns: [/water\s+baptism/i, /baptized?\s+in\s+water/i, /baptized?\s+in\s+(?:the\s+)?name\s+of\s+jesus/i, /baptized?\s+in\s+jesus\s*(?:'|')?s?\s*name/i, /jesus\s*(?:'|')?s?\s*name\s+baptism/i], topic: 'WATER BAPTISM', keywords: ['water','baptism','jesus','name'] },
    { patterns: [/name\s+of\s+jesus/i, /in\s+jesus\s*name/i], topic: 'NAME OF JESUS', keywords: ['name','jesus'] },
    { patterns: [/born\s+again/i, /new\s+birth/i, /born\s+of\s+(?:the\s+)?spirit/i], topic: 'NEW BIRTH', keywords: ['born','new','birth'] },
    { patterns: [/plan\s+of\s+salvation/i, /how\s+(?:to|do\s+i|can\s+i)\s+(?:be\s+)?sav(?:ed?|ing)/i], topic: 'PLAN OF SALVATION', keywords: ['salvation','saved'] },
    { patterns: [/holy\s+ghost/i, /holy\s+spirit/i], topic: 'HOLY GHOST', keywords: ['holy','ghost','spirit'] },
    { patterns: [/repent(?:ance|ing)?/i], topic: 'REPENTANCE', keywords: ['repent','repentance'] },
    { patterns: [/lord'?s?\s+prayer/i], topic: "LORD'S PRAYER", keywords: ['prayer','lord'] },
    { patterns: [/how\s+(?:to|do\s+i|should\s+i)\s+pray/i, /prayer/i, /pray/i], topic: 'PRAYER', keywords: ['prayer','pray'] },
    { patterns: [/forgive(?:ness)?/i], topic: 'FORGIVENESS', keywords: ['forgive','forgiveness'] },
    { patterns: [/salvation/i, /saved/i], topic: 'SALVATION', keywords: ['salvation','saved'] },
    { patterns: [/faith/i, /believ/i], topic: 'FAITH', keywords: ['faith','belief'] },
    { patterns: [/tithe/i, /tithing/i], topic: 'TITHES', keywords: ['tithe','tithes'] },
    { patterns: [/hell/i, /lake\s+of\s+fire/i], topic: 'HELL', keywords: ['hell','damnation'] },
    { patterns: [/heaven/i, /eternal\s+life/i], topic: 'HEAVEN', keywords: ['heaven','eternal'] },
    { patterns: [/second\s+coming/i, /return\s+of\s+(?:the\s+)?(?:lord|christ|jesus)/i, /rapture/i], topic: 'SECOND COMING', keywords: ['coming','return'] },
    { patterns: [/worship/i, /praise/i], topic: 'WORSHIP', keywords: ['worship'] },
    { patterns: [/love/i], topic: 'LOVE', keywords: ['love'] },
    { patterns: [/mercy/i], topic: 'MERCY', keywords: ['mercy'] },
    { patterns: [/grace/i], topic: 'GRACE', keywords: ['grace'] },
    { patterns: [/trinity/i, /triune/i], topic: 'GOD', keywords: ['god'] },
    { patterns: [/fear/i, /anxiety/i, /worry/i], topic: 'FEAR', keywords: ['fear'] },
    { patterns: [/hope/i], topic: 'HOPE', keywords: ['hope'] },
    { patterns: [/peace/i], topic: 'PEACE', keywords: ['peace'] },
    { patterns: [/joy/i, /rejoic/i], topic: 'JOY', keywords: ['joy'] },
    { patterns: [/humility/i, /humble/i], topic: 'HUMILITY', keywords: ['humility'] },
    { patterns: [/pride/i], topic: 'PRIDE', keywords: ['pride'] },
    { patterns: [/marriage/i], topic: 'MARRIAGE', keywords: ['marriage'] },
    { patterns: [/divorce/i], topic: 'DIVORCE', keywords: ['divorce'] },
    { patterns: [/fasting/i], topic: 'FASTING', keywords: ['fasting'] },
    { patterns: [/sin/i], topic: 'SIN', keywords: ['sin'] },
    { patterns: [/wisdom/i], topic: 'WISDOM', keywords: ['wisdom'] },
    { patterns: [/commandments/i, /law\s+of\s+god/i], topic: 'COMMANDMENTS', keywords: ['commandments'] },
    { patterns: [/creation/i, /genesis\s+1/i], topic: 'CREATION', keywords: ['creation'] },
    { patterns: [/flood/i, /noah/i], topic: 'FLOOD', keywords: ['flood','noah'] },
    { patterns: [/passover/i], topic: 'PASSOVER', keywords: ['passover'] },
    { patterns: [/pentecost/i], topic: 'PENTECOST', keywords: ['pentecost'] },
    { patterns: [/crucifixion/i, /calvary/i, /the\s+cross/i], topic: 'CRUCIFIXION', keywords: ['crucifixion'] },
    { patterns: [/resurrection/i], topic: 'RESURRECTION', keywords: ['resurrection'] }
  ];
  function findConcept(normalized){
    if (!normalized) return null;
    for (var i=0;i<CONCEPT_MAP.length;i++){
      var m = CONCEPT_MAP[i];
      for (var j=0;j<m.patterns.length;j++){ if (m.patterns[j].test(normalized)) return m; }
    }
    return null;
  }
  function parse(question){
    var raw = String(question||'').trim();
    var isQuestion = QUESTION_MARKERS.some(function(re){ return re.test(raw); });
    var normalized = normalize(raw);
    var intent = detectIntent(raw);
    var concept = findConcept(normalized) || findConcept(raw);
    return {
      raw: raw,
      normalized: normalized,
      isQuestion: isQuestion,
      intent: intent,
      topic: concept ? concept.topic : null,
      keywords: concept ? concept.keywords.slice() : normalized.split(/\s+/).filter(function(t){ return t && t.length > 2; }),
      expandedQuery: concept ? concept.topic : normalized,
      confidence: concept ? 'high' : (isQuestion ? 'medium' : 'low')
    };
  }

  /* =====================================================================
     Section 7 — harvestVerses (kept unchanged for topic-explorer overlay)
     ===================================================================== */
  function harvestVerses(matches, TOPICS, resolveScripture, limit){
    limit = limit || 15;
    var out = []; var seen = {};
    if (!matches || !matches.length || !TOPICS) return out;
    for (var i=0;i<matches.length && out.length < limit;i++){
      var m = matches[i];
      var t = TOPICS.find(function(x){ return x.n === m.name; });
      if (!t || !t.e) continue;
      for (var j=0;j<t.e.length && out.length < limit;j++){
        var sub = t.e[j];
        if (!sub.r) continue;
        for (var k=0;k<sub.r.length && out.length < limit;k++){
          var refStr = sub.r[k];
          if (!refStr || seen[refStr]) continue;
          seen[refStr] = 1;
          var verseText = '';
          if (typeof resolveScripture === 'function'){
            try { verseText = resolveScripture(refStr) || ''; } catch(e){ verseText = ''; }
          }
          out.push({ ref: refStr, text: verseText });
        }
      }
    }
    return out;
  }

  /* =====================================================================
     Section 8 — First-use notice + legacy compat
     ===================================================================== */
  function isAIReady(){ return true; }
  function isSignedIn(){ return true; }
  function preloadPuter(){ return Promise.resolve(true); }
  function ensurePuterLoaded(){ return Promise.resolve(true); }
  function hasSeenFirstUseNotice(){
    try { return localStorage.getItem('bshqa_seen_first_use') === '1'; } catch(_e){ return false; }
  }
  function markFirstUseNoticeSeen(){
    try { localStorage.setItem('bshqa_seen_first_use', '1'); } catch(_e){}
  }

  window.BshQA = {
    _v: 2,
    _backend: 'groq-proxy-tooluse',
    parse: parse,
    ask: ask,
    chat: chat,
    tools: TOOLS,
    isAIReady: isAIReady,
    isSignedIn: isSignedIn,
    ensurePuterLoaded: ensurePuterLoaded,
    preloadPuter: preloadPuter,
    harvestVerses: harvestVerses,
    hasSeenFirstUseNotice: hasSeenFirstUseNotice,
    markFirstUseNoticeSeen: markFirstUseNoticeSeen,
    // Internal helpers exposed for debugging + explorer UI
    _tokensToText: tokensToText,
    _parseRef: parseRef,
    _formatRef: formatRef,
    _concepts: CONCEPT_MAP
  };
})();
