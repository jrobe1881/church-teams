/* reading-plans.js — Bible reading plans with cloud-synced progress.

   Built-in plans:
     - Bible-in-a-Year (Genesis→Revelation, ~3 chapters/day, 366 days)
     - New Testament in 90 days (~3 ch/day)
     - Chronological 1-year highlights (52 weeks)
     - Gospels & Acts (30 days)
     - Psalms & Proverbs monthly (31 days)

   Custom plans: user-defined lists of daily readings (free-text or refs).
   Stored alongside built-in progress in the same KEY under 'custom_plans'.

   Public API:
     BshPlans.list()                       -> all plan defs (built-in + custom)
     BshPlans.getProgress()                -> {planId: {startedAt, done:{day:true}}}
     BshPlans.start(planId)
     BshPlans.markDay(planId, dayIdx, done)
     BshPlans.stop(planId)                 -> no confirm(); returns Promise (resolves true/false)
     BshPlans.openPicker()
     BshPlans.closePicker()
     BshPlans.onChange(fn)                 -> returns unsubscribe fn
     BshPlans.planDay(planId, dayIdx)      -> string[] of reading refs
     BshPlans.refsOf(chs)                  -> string[]

   Custom plans API:
     BshPlans.createCustom({name, desc, days:[{reading:string}]}) -> plan def
     BshPlans.updateCustom(planId, {name, desc, days})
     BshPlans.deleteCustom(planId)
     BshPlans.openCustomEditor(planId?)    -> open the custom plan editor modal
*/
(function(){
  if (window.BshPlans) return;
  var KEY = 'bsh_reading_plans_v1';
  var listeners = [];

  /* --------- Built-in plan definitions --------- */
  var BUILTIN_PLANS = [
    { id:'biy',       name:'Bible in a Year',                desc:'Genesis → Revelation, roughly 3 chapters a day for 366 days.',        days:366, kind:'seq_full'       },
    { id:'nt90',      name:'New Testament in 90 Days',       desc:'Matthew → Revelation at a brisk 3 chapters a day.',                   days:90,  kind:'seq_nt'          },
    { id:'gospels30', name:'Gospels & Acts in 30 Days',      desc:'The life of Christ + the birth of the Church in one month.',          days:30,  kind:'seq_gospels'     },
    { id:'psalms31',  name:'Psalms & Proverbs Monthly',      desc:'A Proverb a day + roughly 5 Psalms — resets every month.',            days:31,  kind:'psalms_proverbs' },
    { id:'chron52',   name:'Chronological Highlights (52 weeks)', desc:'A curated weekly walk through the whole redemption story.',      days:52,  kind:'chron_curated'   }
  ];

  /* --------- Storage --------- */
  function load(){
    try { var raw = (window.safeLS||localStorage).getItem(KEY); if (!raw) return {}; return JSON.parse(raw) || {}; } catch(e){ return {}; }
  }
  function save(d){
    try { (window.safeLS||localStorage).setItem(KEY, JSON.stringify(d)); } catch(e){}
    if (planSync) planSync.notifyLocalChange();
    notify();
  }
  var state = load();

  var planSync = null;
  function tryBind(){
    if (!window.CloudAccount || planSync) return;
    planSync = window.CloudAccount.bindSync('reading_plans', {
      getLocal: load,
      setLocal: function(d){ try { (window.safeLS||localStorage).setItem(KEY, JSON.stringify(d||{})); } catch(e){}  state = load(); notify(); },
      emptyValue: {},
      onRemoteUpdate: function(){ state = load(); notify(); if (pickerOpen) renderPicker(); }
    });
  }
  if (window.CloudAccount) tryBind(); else { var w = setInterval(function(){ if (window.CloudAccount) { tryBind(); clearInterval(w); } }, 300); }

  function notify(){ listeners.forEach(function(fn){ try { fn(state); } catch(e){} }); }
  function onChange(fn){ listeners.push(fn); try { fn(state); } catch(e){} return function(){ listeners = listeners.filter(function(f){return f!==fn;}); }; }

  /* --------- Custom plans --------- */
  function customPlans(){
    return (state.custom_plans && Array.isArray(state.custom_plans)) ? state.custom_plans : [];
  }
  function list(){
    return BUILTIN_PLANS.concat(customPlans().map(function(cp){
      return { id: cp.id, name: cp.name, desc: cp.desc || '', days: (cp.days||[]).length, kind: 'custom', custom: true };
    }));
  }
  function createCustom(opts){
    opts = opts || {};
    var name = String(opts.name || 'My Plan').trim();
    var days = Array.isArray(opts.days) ? opts.days : [];
    if (!days.length) days = [{ reading: '' }];
    var id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    var cp = { id: id, name: name, desc: opts.desc || '', days: days };
    var cps = customPlans().slice();
    cps.push(cp);
    state.custom_plans = cps;
    save(state);
    return { id: id, name: name, desc: cp.desc, days: days.length, kind: 'custom', custom: true };
  }
  function updateCustom(planId, opts){
    opts = opts || {};
    var cps = customPlans().map(function(cp){
      if (cp.id !== planId) return cp;
      return Object.assign({}, cp, {
        name: opts.name !== undefined ? String(opts.name).trim() : cp.name,
        desc: opts.desc !== undefined ? String(opts.desc) : cp.desc,
        days: opts.days !== undefined ? opts.days : cp.days
      });
    });
    state.custom_plans = cps;
    save(state);
  }
  function deleteCustom(planId){
    state.custom_plans = customPlans().filter(function(cp){ return cp.id !== planId; });
    delete state[planId];
    save(state);
  }
  function getCustomDef(planId){
    return customPlans().find(function(cp){ return cp.id === planId; }) || null;
  }

  /* --------- Plan day generators (built-in) --------- */
  var OT = ['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL'];
  var NT = ['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'];
  var GOSPELS = ['MAT','MRK','LUK','JHN','ACT'];
  var CHAPTERS = { GEN:50,EXO:40,LEV:27,NUM:36,DEU:34,JOS:24,JDG:21,RUT:4,'1SA':31,'2SA':24,'1KI':22,'2KI':25,'1CH':29,'2CH':36,EZR:10,NEH:13,EST:10,JOB:42,PSA:150,PRO:31,ECC:12,SNG:8,ISA:66,JER:52,LAM:5,EZK:48,DAN:12,HOS:14,JOL:3,AMO:9,OBA:1,JON:4,MIC:7,NAM:3,HAB:3,ZEP:3,HAG:2,ZEC:14,MAL:4,MAT:28,MRK:16,LUK:24,JHN:21,ACT:28,ROM:16,'1CO':16,'2CO':13,GAL:6,EPH:6,PHP:4,COL:4,'1TH':5,'2TH':3,'1TI':6,'2TI':4,TIT:3,PHM:1,HEB:13,JAS:5,'1PE':5,'2PE':3,'1JN':5,'2JN':1,'3JN':1,JUD:1,REV:22 };
  var NAMES = { GEN:'Genesis',EXO:'Exodus',LEV:'Leviticus',NUM:'Numbers',DEU:'Deuteronomy',JOS:'Joshua',JDG:'Judges',RUT:'Ruth','1SA':'1 Samuel','2SA':'2 Samuel','1KI':'1 Kings','2KI':'2 Kings','1CH':'1 Chronicles','2CH':'2 Chronicles',EZR:'Ezra',NEH:'Nehemiah',EST:'Esther',JOB:'Job',PSA:'Psalm',PRO:'Proverbs',ECC:'Ecclesiastes',SNG:'Song of Solomon',ISA:'Isaiah',JER:'Jeremiah',LAM:'Lamentations',EZK:'Ezekiel',DAN:'Daniel',HOS:'Hosea',JOL:'Joel',AMO:'Amos',OBA:'Obadiah',JON:'Jonah',MIC:'Micah',NAM:'Nahum',HAB:'Habakkuk',ZEP:'Zephaniah',HAG:'Haggai',ZEC:'Zechariah',MAL:'Malachi',MAT:'Matthew',MRK:'Mark',LUK:'Luke',JHN:'John',ACT:'Acts',ROM:'Romans','1CO':'1 Corinthians','2CO':'2 Corinthians',GAL:'Galatians',EPH:'Ephesians',PHP:'Philippians',COL:'Colossians','1TH':'1 Thessalonians','2TH':'2 Thessalonians','1TI':'1 Timothy','2TI':'2 Timothy',TIT:'Titus',PHM:'Philemon',HEB:'Hebrews',JAS:'James','1PE':'1 Peter','2PE':'2 Peter','1JN':'1 John','2JN':'2 John','3JN':'3 John',JUD:'Jude',REV:'Revelation' };

  function chapList(bookIds){
    var out = [];
    bookIds.forEach(function(b){ for (var i=1;i<=CHAPTERS[b];i++) out.push({b:b, c:i}); });
    return out;
  }
  function divideChapters(list, days){
    var per = list.length / days;
    var out = [];
    for (var d=0; d<days; d++){
      var start = Math.floor(d*per);
      var end = Math.floor((d+1)*per);
      out.push(list.slice(start, end));
    }
    return out;
  }
  function refsOf(chs){
    if (!chs || !chs.length) return [];
    var groups = []; var cur = [chs[0]];
    for (var i=1;i<chs.length;i++){
      if (chs[i].b === cur[cur.length-1].b && chs[i].c === cur[cur.length-1].c + 1) cur.push(chs[i]);
      else { groups.push(cur); cur = [chs[i]]; }
    }
    groups.push(cur);
    return groups.map(function(g){
      var b = NAMES[g[0].b];
      if (g.length === 1) return b + ' ' + g[0].c;
      return b + ' ' + g[0].c + '\u2013' + g[g.length-1].c;
    });
  }

  function planDay(planId, dayIdx){
    // Custom plans: return the reading text for that day
    var cp = getCustomDef(planId);
    if (cp) {
      var entry = cp.days && cp.days[dayIdx];
      if (!entry) return [];
      var text = (typeof entry === 'string') ? entry : (entry.reading || '');
      return text.trim() ? [text.trim()] : [];
    }
    var p = BUILTIN_PLANS.find(function(x){return x.id===planId;}); if (!p) return [];
    if (p.kind === 'seq_full') return refsOf(divideChapters(chapList(OT.concat(NT)), p.days)[dayIdx] || []);
    if (p.kind === 'seq_nt') return refsOf(divideChapters(chapList(NT), p.days)[dayIdx] || []);
    if (p.kind === 'seq_gospels') return refsOf(divideChapters(chapList(GOSPELS), p.days)[dayIdx] || []);
    if (p.kind === 'psalms_proverbs') {
      var d = dayIdx + 1;
      var psStart = ((dayIdx * 5) % 150) + 1;
      var psEnd = Math.min(150, psStart + 4);
      return [ 'Proverbs ' + Math.min(31, d), 'Psalm ' + psStart + '\u2013' + psEnd ];
    }
    if (p.kind === 'chron_curated') {
      var W = [
        ['Genesis 1\u20133','Job 1\u20132'],['Genesis 6\u20139'],['Genesis 12','Genesis 15','Genesis 22'],['Genesis 37','Genesis 41','Genesis 50'],
        ['Exodus 1\u20133','Exodus 12'],['Exodus 20','Deuteronomy 6'],['Joshua 1','Joshua 24'],['Judges 6\u20137'],
        ['Ruth 1\u20134'],['1 Samuel 3','1 Samuel 16\u201317'],['2 Samuel 7','Psalm 23','Psalm 51'],['1 Kings 3','1 Kings 8'],
        ['1 Kings 18\u201319'],['2 Kings 2','2 Kings 5'],['Isaiah 6','Isaiah 40','Isaiah 53'],['Jeremiah 29','Jeremiah 31'],
        ['Ezekiel 36\u201337'],['Daniel 3','Daniel 6'],['Jonah 1\u20134'],['Habakkuk 3','Malachi 3\u20134'],
        ['Matthew 1\u20132','Luke 1\u20132'],['Matthew 3\u20134','John 1'],['Matthew 5\u20137'],['Luke 15','Matthew 13'],
        ['John 3','John 4'],['Mark 4\u20135'],['Matthew 14','John 6'],['Matthew 16\u201317'],
        ['John 11'],['Matthew 21','John 12'],['John 13\u201314'],['John 15\u201317'],
        ['Matthew 26\u201327','John 18\u201319'],['Matthew 28','John 20\u201321'],['Luke 24','Acts 1'],['Acts 2','Acts 4'],
        ['Acts 9','Acts 10'],['Acts 15','Acts 17'],['Romans 3','Romans 5'],['Romans 8','Romans 12'],
        ['1 Corinthians 13','1 Corinthians 15'],['2 Corinthians 4\u20135'],['Galatians 5','Ephesians 2'],['Ephesians 6','Philippians 2'],
        ['Philippians 4','Colossians 3'],['1 Thessalonians 4\u20135'],['Hebrews 11\u201312'],['James 1','James 3'],
        ['1 Peter 1\u20132'],['1 John 1','1 John 4'],['Revelation 1','Revelation 5'],['Revelation 21\u201322']
      ];
      return W[dayIdx] || [];
    }
    return [];
  }

  function daysSince(ts){ if (!ts) return 0; return Math.floor((Date.now()-ts)/86400000); }
  function currentDay(planId){
    var ps = state[planId]; if (!ps || !ps.startedAt) return 0;
    return Math.max(0, daysSince(ps.startedAt));
  }
  function getProgress(){ return state; }

  function start(planId){
    var all = list(); if (!all.find(function(x){return x.id===planId;})) return;
    state[planId] = state[planId] || { startedAt: Date.now(), done:{} };
    state[planId].startedAt = state[planId].startedAt || Date.now();
    state[planId].done = state[planId].done || {};
    save(state);
  }
  function stop(planId){
    // No confirm() — caller is responsible for any confirmation UX
    delete state[planId];
    save(state);
  }
  function markDay(planId, dayIdx, done){
    state[planId] = state[planId] || { startedAt: Date.now(), done:{} };
    if (done) state[planId].done[dayIdx] = true;
    else delete state[planId].done[dayIdx];
    save(state);
  }

  /* --------- Styles --------- */
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  (function(){
    if (document.getElementById('bsh-plans-style')) return;
    var st = document.createElement('style');
    st.id = 'bsh-plans-style';
    st.textContent = [
      '.bsh-plans-overlay{position:fixed;inset:0;z-index:10001;background:rgba(4,4,6,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:16px;font-family:var(--font-sans,"Inter",system-ui,sans-serif)}',
      '.bsh-plans-modal{background:var(--surface,#fff);border:1px solid var(--border,#e4e4e7);border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.2),0 4px 16px rgba(0,0,0,.1);width:100%;max-width:620px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;color:var(--ink,#18181b)}',
      '.bsh-plans-head{border-bottom:1px solid var(--border,#e4e4e7);padding:18px 20px 16px;display:flex;align-items:center;gap:12px;flex:0 0 auto}',
      '.bsh-plans-head-inner{flex:1;min-width:0}',
      '.bsh-plans-head-title{font:600 18px/1.2 var(--font-serif,"EB Garamond",Georgia,serif);color:var(--ink,#18181b)}',
      '.bsh-plans-head-sub{font:400 12px/1 var(--font-sans);color:var(--ink-3,#71717a);margin-top:3px}',
      '.bsh-plans-head-actions{display:flex;gap:6px;flex:0 0 auto}',
      '.bsh-plans-close{background:transparent;border:1px solid var(--border,#e4e4e7);color:var(--ink-3,#71717a);border-radius:6px;width:28px;height:28px;display:grid;place-items:center;cursor:pointer;transition:background .12s,color .12s}',
      '.bsh-plans-close:hover{background:var(--surface-2,#f4f4f5);color:var(--ink,#18181b)}',
      '.bsh-plans-add-btn{background:var(--accent,#7a1f2b);color:#fff;border:none;border-radius:6px;padding:5px 12px;font:600 12px/1 var(--font-sans);cursor:pointer;transition:background .12s;white-space:nowrap}',
      '.bsh-plans-add-btn:hover{background:var(--accent-hover,#661820)}',
      '.bsh-plans-body{overflow-y:auto;padding:16px 20px;background:var(--bg,#fafafa);flex:1 1 auto}',
      '.bsh-plans-body::-webkit-scrollbar{width:4px}.bsh-plans-body::-webkit-scrollbar-thumb{background:var(--border-strong,#d4d4d8);border-radius:2px}',
      '.bsh-plan-section-label{font:600 10px/1 var(--font-sans);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3,#71717a);margin:0 0 8px;padding:0 2px}',
      '.bsh-plan-section{margin-bottom:20px}',
      '.bsh-plan-section:last-child{margin-bottom:4px}',
      '.bsh-plan-card{background:var(--surface,#fff);border:1px solid var(--border,#e4e4e7);border-radius:12px;padding:14px 16px;margin-bottom:8px;display:flex;gap:12px;align-items:flex-start;transition:border-color .13s,box-shadow .13s}',
      '.bsh-plan-card:last-child{margin-bottom:0}',
      '.bsh-plan-card.active{border-color:var(--accent,#7a1f2b);box-shadow:0 0 0 3px rgba(122,31,43,.10)}',
      '.bsh-plan-card.inactive:hover{border-color:var(--border-strong,#d4d4d8)}',
      '.bsh-rp-ring{--pct:0;width:44px;height:44px;flex:0 0 44px;border-radius:50%;background:conic-gradient(var(--accent,#7a1f2b) calc(var(--pct)*1%),var(--border,#e4e4e7) 0);display:flex;align-items:center;justify-content:center;position:relative;margin-top:2px}',
      '.bsh-rp-ring-inner{position:absolute;inset:5px;border-radius:50%;background:var(--surface,#fff);display:flex;align-items:center;justify-content:center;font:600 10px/1 var(--font-sans);color:var(--ink-2,#52525b)}',
      '.bsh-plan-icon{width:44px;height:44px;flex:0 0 44px;background:rgba(122,31,43,.09);border:1px solid rgba(122,31,43,.18);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--accent,#7a1f2b);margin-top:2px}',
      '.bsh-plan-body{flex:1;min-width:0}',
      '.bsh-plan-name{font:600 14px/1.3 var(--font-serif,"EB Garamond",Georgia,serif);color:var(--ink,#18181b);display:flex;align-items:baseline;flex-wrap:wrap;gap:6px}',
      '.bsh-plan-daycount{font:500 11px/1 var(--font-sans);color:var(--ink-3,#71717a);font-family:var(--font-sans)}',
      '.bsh-plan-desc{color:var(--ink-3,#71717a);font:400 12px/1.45 var(--font-sans);margin:4px 0 8px}',
      '.bsh-plan-refs{font:400 13px/1.45 var(--font-sans);margin-bottom:8px;color:var(--ink-2,#52525b)}',
      '.bsh-plan-refs b{font:600 11px/1 var(--font-sans);color:var(--ink-3,#71717a);text-transform:uppercase;letter-spacing:.06em;margin-right:6px}',
      '.bsh-plan-refs a{color:var(--accent,#7a1f2b);text-decoration:none;margin-right:8px;font-size:12px}',
      '.bsh-plan-refs a:hover{text-decoration:underline}',
      '.bsh-plan-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
      '.bsh-plan-mark{background:var(--accent,#7a1f2b);color:#fff;border:none;border-radius:6px;padding:6px 12px;font:600 12px/1 var(--font-sans);cursor:pointer;transition:background .12s}',
      '.bsh-plan-mark:hover{background:var(--accent-hover,#661820)}',
      '.bsh-plan-mark.done{background:#3a6b2c}',
      '.bsh-plan-mark.done:hover{background:#2d5322}',
      '.bsh-plan-stop{background:transparent;color:var(--ink-3,#71717a);border:1px solid var(--border,#e4e4e7);border-radius:6px;padding:6px 10px;font:600 11px/1 var(--font-sans);cursor:pointer;transition:background .12s,border-color .12s,color .12s}',
      '.bsh-plan-stop:hover{background:rgba(122,31,43,.07);border-color:rgba(122,31,43,.3);color:var(--accent,#7a1f2b)}',
      '.bsh-plan-edit{background:transparent;color:var(--ink-3,#71717a);border:1px solid var(--border,#e4e4e7);border-radius:6px;padding:6px 10px;font:600 11px/1 var(--font-sans);cursor:pointer;transition:background .12s,color .12s}',
      '.bsh-plan-edit:hover{background:var(--surface-2,#f4f4f5);color:var(--ink,#18181b)}',
      '.bsh-plan-start{background:var(--accent,#7a1f2b);color:#fff;border:none;border-radius:6px;padding:7px 14px;font:600 13px/1 var(--font-sans);cursor:pointer;transition:background .12s}',
      '.bsh-plan-start:hover{background:var(--accent-hover,#661820)}',
      /* ---- Custom plan editor ---- */
      '.bsh-cpe-overlay{position:fixed;inset:0;z-index:10002;background:rgba(4,4,6,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:16px;font-family:var(--font-sans)}',
      '.bsh-cpe-modal{background:var(--surface,#fff);border:1px solid var(--border,#e4e4e7);border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.2);width:100%;max-width:540px;max-height:92vh;overflow:hidden;display:flex;flex-direction:column;color:var(--ink,#18181b)}',
      '.bsh-cpe-head{border-bottom:1px solid var(--border,#e4e4e7);padding:16px 20px;display:flex;align-items:center;gap:12px;flex:0 0 auto}',
      '.bsh-cpe-title{font:600 17px/1.2 var(--font-serif,"EB Garamond",Georgia,serif);color:var(--ink,#18181b);flex:1}',
      '.bsh-cpe-body{overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:14px;flex:1 1 auto}',
      '.bsh-cpe-foot{border-top:1px solid var(--border,#e4e4e7);padding:12px 20px;display:flex;gap:8px;justify-content:flex-end;flex:0 0 auto;background:var(--surface,#fff)}',
      '.bsh-cpe-field{display:flex;flex-direction:column;gap:6px}',
      '.bsh-cpe-label{font:600 10px/1 var(--font-sans);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3,#71717a)}',
      '.bsh-cpe-input{padding:9px 12px;border:1px solid var(--border,#e4e4e7);border-radius:8px;font:400 14px/1.4 var(--font-sans);color:var(--ink,#18181b);background:var(--bg,#fafafa);transition:border-color .12s,box-shadow .12s;width:100%}',
      '.bsh-cpe-input:focus{outline:none;border-color:var(--accent,#7a1f2b);box-shadow:0 0 0 3px rgba(122,31,43,.12)}',
      '.bsh-cpe-days-list{display:flex;flex-direction:column;gap:6px;max-height:38vh;overflow-y:auto;padding:2px 0}',
      '.bsh-cpe-days-list::-webkit-scrollbar{width:3px}.bsh-cpe-days-list::-webkit-scrollbar-thumb{background:var(--border-strong,#d4d4d8);border-radius:2px}',
      '.bsh-cpe-day-row{display:flex;align-items:center;gap:8px}',
      '.bsh-cpe-day-num{font:600 11px/1 var(--font-sans);color:var(--ink-3,#71717a);width:28px;flex:0 0 28px;text-align:right}',
      '.bsh-cpe-day-input{flex:1;padding:7px 10px;border:1px solid var(--border,#e4e4e7);border-radius:6px;font:400 13px/1 var(--font-sans);color:var(--ink,#18181b);background:var(--bg,#fafafa);transition:border-color .12s}',
      '.bsh-cpe-day-input:focus{outline:none;border-color:var(--accent,#7a1f2b)}',
      '.bsh-cpe-day-rm{background:transparent;border:0;color:var(--ink-3,#71717a);cursor:pointer;padding:4px 6px;border-radius:4px;font-size:14px;line-height:1;transition:color .12s}',
      '.bsh-cpe-day-rm:hover{color:var(--accent,#7a1f2b)}',
      '.bsh-cpe-add-day{display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px dashed var(--border-strong,#d4d4d8);border-radius:6px;padding:7px 12px;font:500 12px/1 var(--font-sans);color:var(--ink-2,#52525b);cursor:pointer;transition:border-color .12s,color .12s,background .12s;align-self:flex-start}',
      '.bsh-cpe-add-day:hover{border-color:var(--accent,#7a1f2b);color:var(--accent,#7a1f2b);background:rgba(122,31,43,.05)}',
      '.bsh-btn-primary{background:var(--accent,#7a1f2b);color:#fff;border:none;border-radius:6px;padding:8px 16px;font:600 13px/1 var(--font-sans);cursor:pointer;transition:background .12s}',
      '.bsh-btn-primary:hover{background:var(--accent-hover,#661820)}',
      '.bsh-btn-ghost{background:transparent;color:var(--ink,#18181b);border:1px solid var(--border,#e4e4e7);border-radius:6px;padding:8px 14px;font:600 13px/1 var(--font-sans);cursor:pointer;transition:background .12s}',
      '.bsh-btn-ghost:hover{background:var(--surface-2,#f4f4f5)}',
      '.bsh-btn-danger{background:transparent;color:var(--accent,#7a1f2b);border:1px solid var(--border,#e4e4e7);border-radius:6px;padding:8px 14px;font:600 13px/1 var(--font-sans);cursor:pointer;transition:background .12s,border-color .12s}',
      '.bsh-btn-danger:hover{background:rgba(122,31,43,.08);border-color:rgba(122,31,43,.3)}',
      '.bsh-cpe-hint{font:400 12px/1.45 var(--font-sans);color:var(--ink-3,#71717a)}'
    ].join('');
    document.head.appendChild(st);
  })();

  /* --------- Picker --------- */
  var pickerOpen = false, pickerRoot = null;

  function ensureRoot(){
    if (pickerRoot) return pickerRoot;
    pickerRoot = document.createElement('div');
    pickerRoot.className = 'bsh-plans-overlay';
    pickerRoot.innerHTML =
      '<div class="bsh-plans-modal">' +
        '<div class="bsh-plans-head">' +
          '<div class="bsh-plans-head-inner"><div class="bsh-plans-head-title">Reading Plans</div><div class="bsh-plans-head-sub">Track your daily progress across devices.</div></div>' +
          '<div class="bsh-plans-head-actions">' +
            '<button class="bsh-plans-add-btn" data-new-custom>+ Custom plan</button>' +
            '<button class="bsh-plans-close" aria-label="Close">\u00d7</button>' +
          '</div>' +
        '</div>' +
        '<div class="bsh-plans-body"></div>' +
      '</div>';
    document.body.appendChild(pickerRoot);
    pickerRoot.querySelector('.bsh-plans-close').addEventListener('click', closePicker);
    pickerRoot.querySelector('[data-new-custom]').addEventListener('click', function(){ openCustomEditor(null); });
    pickerRoot.addEventListener('click', function(e){ if (e.target === pickerRoot) closePicker(); });
    return pickerRoot;
  }

  function openPicker(){ ensureRoot(); pickerOpen = true; pickerRoot.style.display = 'flex'; renderPicker(); }
  function closePicker(){ if (pickerRoot) pickerRoot.style.display = 'none'; pickerOpen = false; }

  function renderPicker(){
    if (!pickerRoot) return;
    var body = pickerRoot.querySelector('.bsh-plans-body');
    body.innerHTML = '';

    var activePlans = [], inactivePlans = [], customActivePlans = [], customInactivePlans = [];
    list().forEach(function(p){
      var ps = state[p.id];
      if (p.custom) { if (ps) customActivePlans.push(p); else customInactivePlans.push(p); }
      else { if (ps) activePlans.push(p); else inactivePlans.push(p); }
    });

    function renderSection(label, plans){
      if (!plans.length) return;
      var sec = document.createElement('div'); sec.className = 'bsh-plan-section';
      var lbl = document.createElement('div'); lbl.className = 'bsh-plan-section-label'; lbl.textContent = label;
      sec.appendChild(lbl);
      plans.forEach(function(p){ sec.appendChild(buildCard(p)); });
      body.appendChild(sec);
    }

    if (activePlans.length || customActivePlans.length) {
      renderSection('Active plans', activePlans.concat(customActivePlans));
    }
    if (inactivePlans.length) renderSection('Start a plan', inactivePlans);
    if (customInactivePlans.length) renderSection('My custom plans', customInactivePlans);

    if (!activePlans.length && !inactivePlans.length && !customActivePlans.length && !customInactivePlans.length) {
      var empty = document.createElement('div');
      empty.style.cssText = 'padding:32px;text-align:center;color:var(--ink-3,#71717a);font:400 14px/1.55 var(--font-sans)';
      empty.textContent = 'No plans yet. Click "+ Custom plan" to create your own.';
      body.appendChild(empty);
    }
  }

  function buildCard(p){
    var ps = state[p.id];
    var active = !!ps;
    var day = active ? Math.min(p.days - 1, Math.floor((Date.now() - (ps.startedAt||0)) / 86400000)) : 0;
    var doneCount = active ? Object.keys(ps.done||{}).length : 0;
    var pct = (p.days > 0 && active) ? Math.min(100, Math.round(100 * doneCount / p.days)) : 0;
    var refs = planDay(p.id, active ? day : 0);

    var card = document.createElement('div');
    card.className = 'bsh-plan-card ' + (active ? 'active' : 'inactive');

    // Left: ring or icon
    var iconEl;
    if (active) {
      iconEl = document.createElement('div'); iconEl.className = 'bsh-rp-ring'; iconEl.style.setProperty('--pct', pct);
      var inner = document.createElement('div'); inner.className = 'bsh-rp-ring-inner'; inner.textContent = pct + '%';
      iconEl.appendChild(inner);
    } else {
      iconEl = document.createElement('div'); iconEl.className = 'bsh-plan-icon';
      iconEl.textContent = p.custom ? '\u270e' : '\u2302'; // ✎ or ⌂
    }
    card.appendChild(iconEl);

    // Body
    var body2 = document.createElement('div'); body2.className = 'bsh-plan-body';

    var nameRow = document.createElement('div'); nameRow.className = 'bsh-plan-name';
    nameRow.textContent = p.name;
    if (active) {
      var dc = document.createElement('span'); dc.className = 'bsh-plan-daycount';
      dc.textContent = 'Day ' + (day+1) + ' / ' + p.days;
      nameRow.appendChild(dc);
    }
    body2.appendChild(nameRow);

    if (p.desc) {
      var descEl = document.createElement('div'); descEl.className = 'bsh-plan-desc'; descEl.textContent = p.desc;
      body2.appendChild(descEl);
    }

    if (refs && refs.length) {
      var refsEl = document.createElement('div'); refsEl.className = 'bsh-plan-refs';
      var label = document.createElement('b'); label.textContent = active ? 'Today' : 'Day 1';
      refsEl.appendChild(label);
      refs.forEach(function(r){
        var a = document.createElement('a');
        a.href = '/read/?ref=' + encodeURIComponent(r);
        a.target = '_blank'; a.rel = 'noopener';
        a.textContent = r + ' \u2197';
        refsEl.appendChild(a);
      });
      body2.appendChild(refsEl);
    }

    var actions = document.createElement('div'); actions.className = 'bsh-plan-actions';
    if (active) {
      var markBtn = document.createElement('button');
      markBtn.className = 'bsh-plan-mark' + (ps.done && ps.done[day] ? ' done' : '');
      markBtn.textContent = (ps.done && ps.done[day]) ? '\u2713 Today done' : 'Mark today done';
      markBtn.addEventListener('click', function(){
        var cur = state[p.id] && state[p.id].done && state[p.id].done[day];
        markDay(p.id, day, !cur);
        renderPicker();
      });
      actions.appendChild(markBtn);
      var stopBtn = document.createElement('button');
      stopBtn.className = 'bsh-plan-stop';
      stopBtn.textContent = 'Stop plan';
      stopBtn.addEventListener('click', function(){
        // No confirm() — just stop immediately
        stop(p.id);
        renderPicker();
      });
      actions.appendChild(stopBtn);
    } else {
      var startBtn = document.createElement('button');
      startBtn.className = 'bsh-plan-start';
      startBtn.textContent = 'Start plan';
      startBtn.addEventListener('click', function(){ start(p.id); renderPicker(); });
      actions.appendChild(startBtn);
    }
    if (p.custom) {
      var editBtn = document.createElement('button');
      editBtn.className = 'bsh-plan-edit';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', function(){ openCustomEditor(p.id); });
      actions.appendChild(editBtn);
    }
    body2.appendChild(actions);
    card.appendChild(body2);
    return card;
  }

  /* --------- Custom plan editor --------- */
  var cpeRoot = null;
  function openCustomEditor(planId){
    if (!cpeRoot) {
      cpeRoot = document.createElement('div');
      cpeRoot.className = 'bsh-cpe-overlay';
      document.body.appendChild(cpeRoot);
      cpeRoot.addEventListener('click', function(e){ if (e.target === cpeRoot) closeCpe(); });
    }
    var existing = planId ? getCustomDef(planId) : null;
    var days = existing ? existing.days.slice() : [{ reading: '' }];
    renderCpe(planId, existing, days);
    cpeRoot.style.display = 'flex';
  }
  function closeCpe(){ if (cpeRoot) cpeRoot.style.display = 'none'; }

  function renderCpe(planId, existing, days){
    cpeRoot.innerHTML =
      '<div class="bsh-cpe-modal">' +
        '<div class="bsh-cpe-head">' +
          '<div class="bsh-cpe-title">' + (existing ? 'Edit Plan' : 'New Custom Plan') + '</div>' +
          '<button class="bsh-plans-close" aria-label="Close">\u00d7</button>' +
        '</div>' +
        '<div class="bsh-cpe-body">' +
          '<div class="bsh-cpe-field"><label class="bsh-cpe-label">Plan name</label>' +
            '<input class="bsh-cpe-input" id="bshCpeName" type="text" maxlength="120" placeholder="e.g. Acts Series" value="' + esc(existing ? existing.name : '') + '" /></div>' +
          '<div class="bsh-cpe-field"><label class="bsh-cpe-label">Description <span style="font-weight:500;text-transform:none;letter-spacing:0">(optional)</span></label>' +
            '<input class="bsh-cpe-input" id="bshCpeDesc" type="text" maxlength="300" placeholder="What is this plan about?" value="' + esc(existing ? existing.desc : '') + '" /></div>' +
          '<div class="bsh-cpe-field"><label class="bsh-cpe-label">Daily readings</label>' +
            '<p class="bsh-cpe-hint">Enter one reading per day — any text or Bible reference (e.g. "Acts 2" or "John 3:16\u20133:21").</p>' +
            '<div class="bsh-cpe-days-list" id="bshCpeDaysList"></div>' +
            '<button type="button" class="bsh-cpe-add-day" id="bshCpeAddDay">+ Add day</button>' +
          '</div>' +
        '</div>' +
        '<div class="bsh-cpe-foot">' +
          (existing ? '<button type="button" class="bsh-btn-danger" id="bshCpeDelete">Delete plan</button>' : '<span></span>') +
          '<div style="display:flex;gap:8px">' +
            '<button type="button" class="bsh-btn-ghost" id="bshCpeCancel">Cancel</button>' +
            '<button type="button" class="bsh-btn-primary" id="bshCpeSave">Save plan</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    cpeRoot.querySelector('.bsh-plans-close').addEventListener('click', closeCpe);
    cpeRoot.querySelector('#bshCpeCancel').addEventListener('click', closeCpe);

    var daysList = cpeRoot.querySelector('#bshCpeDaysList');
    function renderDayRows(){
      daysList.innerHTML = '';
      days.forEach(function(day, i){
        var row = document.createElement('div'); row.className = 'bsh-cpe-day-row';
        var num = document.createElement('span'); num.className = 'bsh-cpe-day-num'; num.textContent = 'Day ' + (i+1);
        var inp = document.createElement('input'); inp.className = 'bsh-cpe-day-input'; inp.type = 'text';
        inp.placeholder = 'e.g. Acts ' + (i+2);
        inp.value = (typeof day === 'string') ? day : (day.reading || '');
        inp.addEventListener('input', function(){ days[i] = { reading: inp.value }; });
        var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'bsh-cpe-day-rm';
        rm.setAttribute('aria-label', 'Remove day ' + (i+1));
        rm.textContent = '\u00d7';
        rm.addEventListener('click', function(){ days.splice(i, 1); renderDayRows(); });
        row.appendChild(num); row.appendChild(inp); row.appendChild(rm);
        daysList.appendChild(row);
      });
    }
    renderDayRows();

    cpeRoot.querySelector('#bshCpeAddDay').addEventListener('click', function(){
      days.push({ reading: '' });
      renderDayRows();
      var rows = daysList.querySelectorAll('.bsh-cpe-day-input');
      if (rows.length) rows[rows.length-1].focus();
    });

    if (existing) {
      cpeRoot.querySelector('#bshCpeDelete').addEventListener('click', function(){
        deleteCustom(planId);
        closeCpe();
        if (pickerOpen) renderPicker();
      });
    }

    cpeRoot.querySelector('#bshCpeSave').addEventListener('click', function(){
      var name = (cpeRoot.querySelector('#bshCpeName').value || '').trim();
      if (!name) { cpeRoot.querySelector('#bshCpeName').focus(); return; }
      var desc = (cpeRoot.querySelector('#bshCpeDesc').value || '').trim();
      // Collect latest values from inputs
      cpeRoot.querySelectorAll('.bsh-cpe-day-input').forEach(function(inp, i){
        if (days[i] !== undefined) days[i] = { reading: inp.value };
      });
      var cleanDays = days.filter(function(d){ return (d.reading || '').trim(); });
      if (!cleanDays.length) cleanDays = [{ reading: '' }];
      if (planId) {
        updateCustom(planId, { name: name, desc: desc, days: cleanDays });
      } else {
        createCustom({ name: name, desc: desc, days: cleanDays });
      }
      closeCpe();
      if (pickerOpen) renderPicker();
    });
  }

  window.BshPlans = {
    list: list,
    getProgress: getProgress,
    start: start,
    markDay: markDay,
    stop: stop,
    openPicker: openPicker,
    closePicker: closePicker,
    onChange: onChange,
    planDay: planDay,
    refsOf: refsOf,
    createCustom: createCustom,
    updateCustom: updateCustom,
    deleteCustom: deleteCustom,
    openCustomEditor: openCustomEditor
  };
})();
