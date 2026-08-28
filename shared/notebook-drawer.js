/* Bible Study Notebook — slide-in drawer (shared across all hub tools)
   Injects its own styles + DOM. Exposes window.BibleNotebook.
   Shares the storage key "bible_study_notebook_v1" with the standalone notebook page. */
(function(){
  if(window.BibleNotebook) return;
  var KEY='bible_study_notebook_v1';
  /* VBASE must resolve to "<site-root>/sermon/" no matter which page includes this
     script (root-level pages like index.html/split.html vs one-level-deep pages like
     strongs/index.html) or how deeply the whole site is nested under a URL prefix
     (e.g. a preview sandbox path). A hardcoded '../sermon/' only worked by accident
     when the including page happened to be exactly one directory deep with no prefix.
     Instead, derive it from this script's own resolved absolute src, which the browser
     always resolves correctly regardless of nesting. */
  var VBASE=(function(){
    try{
      var s=document.currentScript&&document.currentScript.src;
      if(s){var idx=s.indexOf('shared/notebook-drawer.js');if(idx>=0)return s.slice(0,idx)+'sermon/';}
    }catch(e){}
    return '../sermon/';
  })();
  var BOOKS=null, ALIASES=null;
  /* Split View embeds each tool in an iframe pane with ?embed=split. In that mode we
     never show this page's own floating Notebook button/drawer (it would render at a
     fraction of full size, squeezed into the pane) — instead every open/toggle/add
     action is relayed via postMessage to the Split View shell (split.html), which hosts
     one single, full-size Notebook toggle+drawer that behaves exactly like a standalone page. */
  var isEmbedded=false;
  try{isEmbedded=new URLSearchParams(location.search).get('embed')==='split';}catch(e){}

  /* ---------- styles ---------- */
  var css = `
.bn-root,.bn-root *{box-sizing:border-box}
.bn-fab{position:fixed;right:16px;bottom:16px;z-index:9998;display:flex;align-items:center;justify-content:center;gap:7px;
  width:40px;height:40px;background:var(--surface);color:var(--ink-2);border:1px solid var(--border);border-radius:50%;padding:0;cursor:grab;touch-action:none;
  font-family:var(--font-sans);font-size:var(--t-sm);font-weight:700;letter-spacing:.3px;
  box-shadow:var(--shadow-1);transition:background 160ms,color 160ms,border-color 160ms,transform 160ms,opacity var(--dur-1),left .12s,top .12s}
.bn-fab:hover{transform:translateY(-1px);background:var(--surface-2);color:var(--accent);border-color:var(--accent)}
.bn-fab.bn-dragging{cursor:grabbing;transition:none;transform:none!important;opacity:.94;z-index:10002}
.bn-fab .bn-fab-ic{display:inline-flex;align-items:center;justify-content:center;line-height:1}
.bn-fab .bn-fab-ic svg{display:block;stroke:currentColor}
.bn-fab .bn-fab-lbl{display:none}
.bn-fab .bn-badge{position:absolute;top:-4px;right:-4px;background:var(--ink);color:var(--surface);border:2px solid var(--surface);border-radius:50%;font-size:.6rem;font-weight:700;line-height:1;width:16px;height:16px;display:flex;align-items:center;justify-content:center;text-align:center}
.bn-fab .bn-badge[hidden],.bn-fab .bn-badge.bn-badge-empty{display:none}
.bn-overlay{position:fixed;inset:0;z-index:9999;background:rgba(20,19,16,.4);opacity:0;pointer-events:none;transition:opacity var(--dur-2)}
.bn-root.bn-open .bn-overlay{opacity:1;pointer-events:auto}
.bn-panel{position:fixed;top:0;right:0;bottom:0;z-index:10000;width:420px;max-width:92vw;
  background:var(--surface);border-left:1px solid var(--border);display:flex;flex-direction:column;
  transform:translateX(100%);transition:transform var(--dur-3) var(--ease);
  box-shadow:var(--shadow-3);font-family:var(--font-sans);color:var(--ink)}
.bn-root.bn-open .bn-panel{transform:translateX(0)}
.bn-head{display:flex;align-items:center;gap:8px;background:var(--surface-2);color:var(--ink);padding:12px 14px;flex-shrink:0;border-bottom:1px solid var(--border)}
.bn-head .bn-h-title{font-family:var(--font-serif);font-weight:600;font-size:var(--t-lg);flex:1;line-height:1;color:var(--accent)}
.bn-head .bn-h-sub{font-size:var(--t-xs);color:var(--ink-3);letter-spacing:.4px;margin-top:2px;text-transform:uppercase}
.bn-iconbtn{background:transparent;color:var(--ink-2);border:none;border-radius:var(--r-sm);width:32px;height:32px;
  cursor:pointer;font-size:1.05rem;line-height:1;display:flex;align-items:center;justify-content:center;transition:background var(--dur-1),color var(--dur-1)}
.bn-iconbtn:hover{background:var(--surface-2);color:var(--ink)}
.bn-body{flex:1;overflow-y:auto;padding:12px 14px 18px}
.bn-bar{display:flex;gap:6px;align-items:center;margin-bottom:10px}
.bn-select{flex:1;font-family:var(--font-sans);font-size:var(--t-sm);padding:7px 8px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--ink)}
.bn-select:focus{outline:none;border-color:var(--accent);box-shadow:var(--focus)}
.bn-btn{font-family:var(--font-sans);font-size:var(--t-sm);font-weight:600;padding:7px 11px;border-radius:var(--r-sm);cursor:pointer;border:1px solid var(--border);background:var(--surface);color:var(--accent);transition:background var(--dur-1),border-color var(--dur-1)}
.bn-btn:hover{border-color:var(--border-strong);background:var(--surface-2)}
.bn-btn.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
.bn-btn.primary:hover{background:var(--accent-hover)}
.bn-field{width:100%;font-family:var(--font-sans);font-size:var(--t-md);padding:9px 11px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--ink);margin-bottom:8px}
.bn-field:focus{outline:none;border-color:var(--accent);box-shadow:var(--focus)}
.bn-title{font-family:var(--font-serif);font-weight:600;font-size:var(--t-lg);color:var(--ink)}
.bn-textarea{width:100%;min-height:150px;font-family:var(--font-sans);font-size:var(--t-md);line-height:1.6;padding:11px 12px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--ink);resize:vertical;margin-bottom:10px}
.bn-textarea:focus{outline:none;border-color:var(--accent);box-shadow:var(--focus)}
.bn-sec-label{font-family:var(--font-sans);font-size:var(--t-xs);font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin:12px 0 6px;font-variant-caps:all-small-caps}
.bn-reflist{display:flex;flex-direction:column;gap:7px;margin-bottom:10px}
.bn-refcard{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:8px 10px;transition:background var(--dur-1),border-color var(--dur-1)}
.bn-refcard:hover{background:var(--surface-2)}
.bn-refcard.bn-selected{background:var(--accent-tint);border-color:var(--accent)}
.bn-refcard .bn-ref-hd{display:flex;align-items:center;gap:6px;margin-bottom:3px}
.bn-refcard .bn-ref-ref{font-family:var(--font-sans);font-weight:600;font-size:var(--t-xs);text-transform:uppercase;letter-spacing:.04em;color:var(--accent);flex:1}
.bn-refcard .bn-ref-src{font-size:var(--t-xs);color:var(--ink-3);background:var(--surface-2);border-radius:var(--r-xs);padding:1px 6px}
.bn-refcard .bn-ref-txt{font-size:var(--t-sm);line-height:1.55;color:var(--ink);font-family:var(--font-scripture)}
.bn-refcard .bn-rm{background:none;border:none;color:var(--accent);cursor:pointer;font-size:var(--t-xs);font-weight:600;padding:2px 4px;text-decoration:none;transition:color var(--dur-1)}
.bn-refcard .bn-rm:hover{color:var(--accent-hover);text-decoration:underline}
.bn-refcard .bn-ins{background:none;border:none;color:var(--accent);font-size:var(--t-xs);font-weight:700;padding:2px 4px;cursor:pointer;font-family:var(--font-sans);margin-left:auto;text-decoration:none;transition:color var(--dur-1)}
.bn-refcard .bn-ins:hover{color:var(--accent-hover);text-decoration:underline}
.bn-addrow{display:flex;gap:6px}
.bn-addrow .bn-field{margin-bottom:0;flex:1}
.bn-empty{padding:16px 8px;text-align:center;color:var(--ink-3);font-size:var(--t-sm);line-height:1.6}
.bn-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);background:var(--ink);color:var(--surface);
  padding:9px 16px;border-radius:var(--r-pill);font-size:var(--t-sm);font-weight:600;opacity:0;pointer-events:none;transition:.25s;z-index:10001;
  box-shadow:var(--shadow-3)}
.bn-toast.bn-show{opacity:1;transform:translateX(-50%) translateY(0)}
.bn-body-drop{position:relative}
.bn-body-drop::after{content:"Drop to attach scripture";position:absolute;inset:6px;border:2px dashed var(--accent);border-radius:var(--r-lg);background:var(--accent-tint);display:flex;align-items:center;justify-content:center;font-family:var(--font-serif);font-weight:600;color:var(--accent);font-size:var(--t-lg);pointer-events:none;z-index:5}
.drag-handle{display:inline-flex;align-items:center;gap:5px;cursor:grab;color:var(--accent);background:var(--accent-tint);border:1px solid transparent;border-radius:var(--r-sm);padding:4px 8px;font-size:var(--t-xs);font-weight:700;font-family:var(--font-sans);vertical-align:middle;margin-left:auto;user-select:none;-webkit-user-select:none}
.drag-handle:hover{border-color:var(--border-strong);background:var(--surface-2)}
.drag-handle:active{cursor:grabbing}
.drag-handle svg{display:block}
@media(max-width:620px){
  .bn-fab{bottom:12px;right:12px;width:36px;height:36px}
  .bn-fab .bn-fab-lbl{display:none}
  .bn-panel{width:100vw;max-width:100vw}
}
`;
  var st=document.createElement('style'); st.id='bn-drawer-style'; st.textContent=css; document.head.appendChild(st);

  /* ---------- DOM ---------- */
  var root=document.createElement('div'); root.className='bn-root';
  root.innerHTML=`
<div class="bn-overlay" data-bn="close"></div>
<button class="bn-fab" data-bn="toggle" aria-label="Open notebook">
  <span class="bn-fab-ic" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 19.5v-15Z"/><path d="M4 7h2M4 11h2M4 15h2M4 19h2"/><path d="M9 8h6"/></svg></span><span class="bn-fab-lbl">Notebook</span><span class="bn-badge" data-bn="count">0</span>
</button>
<aside class="bn-panel" role="dialog" aria-label="Bible Study Notebook">
  <div class="bn-head">
    <div style="flex:1"><div class="bn-h-title">Study Notebook</div><div class="bn-h-sub">SAVED IN THIS BROWSER · KJV</div></div>
    <button class="bn-iconbtn" data-bn="close" aria-label="Close">✕</button>
  </div>
  <div class="bn-body" data-bn="body"></div>
</aside>
<div class="bn-toast" data-bn="toast"></div>
<input type="file" accept="application/pdf" data-bn="pdffile" style="display:none">`;
  if(!isEmbedded) document.body.appendChild(root);

  var elBody=root.querySelector('[data-bn=body]');
  var elCount=root.querySelector('[data-bn=count]');
  var elToast=root.querySelector('[data-bn=toast]');
  var elFile=root.querySelector('[data-bn=pdffile]');

  /* ---------- book metadata + verse resolution ---------- */
  function fetchJSON(p){return fetch(VBASE+p).then(function(r){return r.json();});}
  function ensureBooks(){
    if(BOOKS) return Promise.resolve(BOOKS);
    return fetchJSON('books.json').then(function(b){ BOOKS=b||[]; buildAliases(); return BOOKS; })
      .catch(function(){ BOOKS=[]; buildAliases(); return []; });
  }
  function buildAliases(){
    var m={}; var norm=function(s){return s.toLowerCase().replace(/[.\s]/g,'');};
    var add=function(ks,id){ks.forEach(function(k){m[norm(k)]=id;});};
    BOOKS.forEach(function(b){add([b.name,b.abbr],b.id);});
    var E={GEN:['Genesis','Gen'],EXO:['Exodus','Exod','Exo','Ex'],LEV:['Leviticus','Lev'],NUM:['Numbers','Num'],DEU:['Deuteronomy','Deut','Deu'],JOS:['Joshua','Josh','Jos'],JDG:['Judges','Judg','Jdg'],RUT:['Ruth','Rut','Ru'],'1SA':['1 Samuel','1 Sam','1Sam','1Sa'],'2SA':['2 Samuel','2 Sam','2Sam','2Sa'],'1KI':['1 Kings','1 Kgs','1Ki','1Kgs','1Kings'],'2KI':['2 Kings','2 Kgs','2Ki','2Kgs','2Kings'],'1CH':['1 Chronicles','1 Chron','1Ch','1Chr'],'2CH':['2 Chronicles','2 Chron','2Ch','2Chr'],EZR:['Ezra','Ezr'],NEH:['Nehemiah','Neh'],EST:['Esther','Esth','Est'],JOB:['Job'],PSA:['Psalms','Psalm','Ps','Pss'],PRO:['Proverbs','Prov','Pr'],ECC:['Ecclesiastes','Eccles','Eccl','Ecc','Ec'],SNG:['Song of Solomon','Song of Songs','Song','So','Cant','Canticles'],ISA:['Isaiah','Isa','Is'],JER:['Jeremiah','Jer','Je'],LAM:['Lamentations','Lam'],EZK:['Ezekiel','Ezek','Eze','Ezk'],DAN:['Daniel','Dan','Dn'],HOS:['Hosea','Hos','Ho'],JOL:['Joel','Jl'],AMO:['Amos','Am'],OBA:['Obadiah','Obad','Oba','Ob'],JON:['Jonah','Jon','Jnh'],MIC:['Micah','Mi'],NAM:['Nahum','Nah','Na'],HAB:['Habakkuk','Hab'],ZEP:['Zephaniah','Zeph','Zep'],HAG:['Haggai','Hag'],ZEC:['Zechariah','Zech','Zec','Zc'],MAL:['Malachi','Mal'],MAT:['Matthew','Matt','Mt'],MRK:['Mark','Mk','Mar'],LUK:['Luke','Lk','Lu'],JHN:['John','Jn','Joh'],ACT:['Acts','Ac'],ROM:['Romans','Rom','Ro'],'1CO':['1 Corinthians','1 Cor','1Cor','1Co'],'2CO':['2 Corinthians','2 Cor','2Cor','2Co'],GAL:['Galatians','Gal','Ga'],EPH:['Ephesians','Eph'],PHP:['Philippians','Phil','Php'],COL:['Colossians','Col'],'1TH':['1 Thessalonians','1 Thess','1Thess','1Th'],'2TH':['2 Thessalonians','2 Thess','2Thess','2Th'],'1TI':['1 Timothy','1 Tim','1Tim','1Ti'],'2TI':['2 Timothy','2 Tim','2Tim','2Ti'],TIT:['Titus','Ti'],PHM:['Philemon','Phlm','Phm','Philem'],HEB:['Hebrews','Heb'],JAS:['James','Jas','Ja'],'1PE':['1 Peter','1 Pet','1Pet','1Pe'],'2PE':['2 Peter','2 Pet','2Pet','2Pe'],'1JN':['1 John','1 Jn','1Jn','1Jo'],'2JN':['2 John','2 Jn','2Jn','2Jo'],'3JN':['3 John','3 Jn','3Jn','3Jo'],JUD:['Jude','Jud'],REV:['Revelation','Rev','Re','Apoc']};
    Object.keys(E).forEach(function(id){add(E[id],id);});
    ALIASES=m;
  }
  function parseRefStr(str){
    str=String(str||'').trim().replace(/\s+/g,' ');
    var m=str.match(/^((?:[1-3]\s+)?[A-Za-z]+(?:\s+of\s+[A-Za-z]+)?)\s*\.?\s*(\d.*)$/);
    if(!m)return null;
    var bookPart=m[1].trim(); var spec=m[2].trim().replace(/[.\s]/g,'');
    if(!/^\d/.test(spec))return null;
    var id=ALIASES[bookPart.toLowerCase().replace(/[.\s]/g,'')];
    if(!id)return null; return {id:id,spec:spec};
  }
  function parseSpec(spec){
    var parts=spec.split(',');var curCh=null;var out=[];
    for(var i=0;i<parts.length;i++){var p=parts[i].trim();if(!p)continue;
      if(p.indexOf(':')>=0){var c=p.split(':')[0];curCh=+c;addRange(out,curCh,p.split(':')[1]);}
      else if(p.indexOf('-')>=0){if(curCh!=null){var ab=p.split('-');out.push({c:curCh,a:+ab[0],b:+ab[1]});}}
      else{if(curCh!=null)out.push({c:curCh,a:+p,b:+p});else out.push({c:+p,whole:true});}}
    return out;
    function addRange(o,c,vs){if(vs.indexOf('-')>=0){var ab=vs.split('-');o.push({c:c,a:+ab[0],b:+ab[1]});}else o.push({c:c,a:+vs,b:vs});}
  }
  function findBook(id){for(var i=0;i<BOOKS.length;i++){if(BOOKS[i].id===id)return BOOKS[i];}return null;}
  function formatRef(id,spec){var b=findBook(id);return (b?b.name:id)+' '+(spec.indexOf(':')>=0?spec:('Chapter '+spec));}
  function resolveVerses(id,spec){
    var b=findBook(id);if(!b)return Promise.resolve([]);
    return fetchJSON(b.vfile).then(function(arr){
      var ranges=parseSpec(spec);var out=[];
      for(var r=0;r<ranges.length;r++){for(var e=0;e<arr.length;e++){if(arr[e][0]!==ranges[r].c)continue;var vv=arr[e][1];
        if(ranges[r].whole)out.push({c:ranges[r].c,v:vv,words:arr[e][2]});
        else if(vv>=ranges[r].a&&vv<=ranges[r].b)out.push({c:ranges[r].c,v:vv,words:arr[e][2]});}}
      out.sort(function(x,y){return x.c-y.c||x.v-y.v;});
      return out;
    });
  }
  function plainText(words){var out='',need=false;for(var i=0;i<words.length;i++){var w=words[i];if(w==='¶')continue;if(w==='+')break;var punct=!/[\p{L}\p{N}]/u.test(w);out+=(need&&!punct?' ':'')+w;need=true;}return out;}
  function stripMarginalia(t){if(typeof t!=='string')return t;var i=t.search(/\+\s*\d+\.\d+/);if(i<0)i=t.search(/\s\d+\.\d+\s/);return i<0?t:t.slice(0,i).replace(/\s+$/,'');}

  /* ---------- storage ---------- */
  function load(){try{return JSON.parse(safeLS.getItem(KEY))||{version:1,activeNoteId:null,notes:[]};}catch(e){return {version:1,activeNoteId:null,notes:[]};}}
  function save(db){try{safeLS.setItem(KEY,JSON.stringify(db));}catch(e){}if(notebookSync)notebookSync.notifyLocalChange();}
  var notebookSync=null;
  if(window.CloudAccount){
    notebookSync=window.CloudAccount.bindSync('notebook',{
      getLocal:load,
      setLocal:function(cloudData){try{safeLS.setItem(KEY,JSON.stringify(cloudData));}catch(e){}},
      emptyValue:{version:1,activeNoteId:null,notes:[]},
      onRemoteUpdate:function(){render();}
    });
  }
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function uid(){return 'n'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}

  function activeNote(db){db=db||load();if(!db.notes.length)return null;var n=db.notes.find(function(x){return x.id===db.activeNoteId;});return n||db.notes[0];}
  function newNote(opts){var db=load();var n=Object.assign({id:uid(),title:opts&&opts.title||'Untitled note',body:'',refs:[],createdAt:Date.now(),updatedAt:Date.now()},opts||{});db.notes.unshift(n);db.activeNoteId=n.id;save(db);render();return n;}
  function touch(db,n){n.updatedAt=Date.now();save(db);}

  /* ---------- render ---------- */
  function render(){
    var db=load();
    elCount.textContent=db.notes.length;
    if(!db.notes.length){
      elBody.innerHTML='<div class="bn-empty"><b>No notes yet.</b><br>Click <b>+ New Note</b> to start, or send a verse here from Builder or Concordance with the <b>＋ Notebook</b> button.</div>'+
        '<button class="bn-btn primary" data-bn="new" style="width:100%">+ New Note</button>'+
        '<button class="bn-btn" data-bn="import" style="width:100%;margin-top:8px">↥ Import note from PDF</button>';
      if(window.BuilderTray)window.BuilderTray.attachPanel(elBody);
      return;
    }
    var cur=activeNote(db);
    var opts=db.notes.map(function(n){return '<option value="'+n.id+'"'+(n.id===cur.id?' selected':'')+'>'+esc(n.title||'Untitled')+'</option>';}).join('');
    var refsHtml=(cur.refs&&cur.refs.length)?cur.refs.map(function(r,i){
      return '<div class="bn-refcard"><div class="bn-ref-hd"><span class="bn-ref-ref">'+esc(r.ref)+'</span>'+
        (r.sourceTool?'<span class="bn-ref-src">'+esc(r.sourceTool)+'</span>':'')+
        '<button class="bn-ins" data-bn="insert" data-i="'+i+'" title="Insert this scripture into your note at the cursor">Insert \u2193</button>'+
        '<button class="bn-rm" data-bn="rm" data-i="'+i+'">Remove</button></div>'+
        '<div class="bn-ref-txt">'+esc(stripMarginalia(r.text))+'</div></div>';
    }).join(''):'<div class="bn-empty" style="padding:8px 0">No scriptures attached yet. Send a verse here from Builder or Concordance, then use Insert to place it in your note.</div>';
    elBody.innerHTML=
      '<div class="bn-bar"><select class="bn-select" data-bn="select">'+opts+'</select>'+
      '<button class="bn-btn" data-bn="new">+ New</button><button class="bn-btn" data-bn="pdf" title="Download this note as a PDF">PDF</button><button class="bn-btn" data-bn="import" title="Restore a note from a PDF">Import</button></div>'+
      '<input class="bn-field bn-title" data-bn="title" value="'+esc(cur.title)+'" placeholder="Note title…">'+
      '<textarea class="bn-textarea" data-bn="body" placeholder="Write your study notes here…">'+esc(cur.body)+'</textarea>'+
      '<div class="bn-sec-label">Attached Scriptures</div>'+
      '<div class="bn-reflist">'+refsHtml+'</div>'+
      '<div class="bn-addrow"><input class="bn-field" data-bn="addref" placeholder="Add: John 3:16, Rom 8, Heb 11…">'+
      '<button class="bn-btn primary" data-bn="addscripture">+ Add</button></div>';
    if(window.BuilderTray)window.BuilderTray.attachPanel(elBody);
  }

  /* ---------- actions ---------- */
  function selectNote(id){var db=load();db.activeNoteId=id;save(db);render();}
  function updateField(field,val){var db=load();var n=activeNote(db);if(!n)return;n[field]=val;touch(db,n);
    /* keep the dropdown option label in sync when a note is renamed, without a full re-render (avoids losing focus) */
    if(field==='title'){var sel=elBody.querySelector('.bn-select');if(sel){var opt=sel.querySelector('option[value="'+n.id+'"]');if(opt)opt.textContent=n.title||'Untitled';}}}
  function removeRef(i){var db=load();var n=activeNote(db);if(!n||!n.refs)return;n.refs.splice(i,1);touch(db,n);render();}
  function insertRef(i){
    var db=load();var n=activeNote(db);if(!n||!n.refs||!n.refs[i])return;
    var r=n.refs[i];
    var ta=elBody.querySelector('.bn-textarea');if(!ta)return;
    var content=(r.insertOverride!=null?r.insertOverride:(r.ref+'\n'+stripMarginalia(r.text)));
    ta.focus();
    var len=ta.value.length;
    var s,e;
    if(document.activeElement===ta){s=ta.selectionStart||0;e=ta.selectionEnd||s;}
    else{s=(typeof lastSel.s==='number'&&lastSel.s<=len)?lastSel.s:len;e=(typeof lastSel.e==='number'&&lastSel.e<=len)?lastSel.e:s;}
    if(s>len){s=len;}if(e>len){e=len;}
    var b=ta.value.slice(0,s).replace(/\s+$/,'');
    var a=ta.value.slice(e).replace(/^\s+/,'');
    var block=(b?'\n':'')+content+(a?'\n':'');
    ta.value=b+block+a;
    var pos=b.length+(b?1:0)+content.length;ta.setSelectionRange(pos,pos);
    lastSel={s:pos,e:pos};
    ta.dispatchEvent(new Event('input',{bubbles:true}));
    toast('Inserted '+r.ref+' into note');
  }
  function addRefObj(refDisp,text,source,extra){
    var db=load();var n=activeNote(db);
    if(!n){n=newNote({title:refDisp});db=load();n=activeNote(db);}
    n.refs=n.refs||[];n.refs.push(Object.assign({ref:refDisp,text:text,sourceTool:source||'',addedAt:Date.now()},extra||{}));
    touch(db,n);render();toast('Added '+refDisp);
  }
  function addScriptureByRef(){
    var inp=elBody.querySelector('[data-bn=addref]');if(!inp)return;var v=inp.value.trim();if(!v)return;
    toast('Resolving…');
    ensureBooks().then(function(){var p=parseRefStr(v);if(!p){toast('Could not parse "'+v+'"');return;}
      return resolveVerses(p.id,p.spec).then(function(vs){if(!vs.length){toast('No verses for "'+v+'"');return;}
        var refDisp=formatRef(p.id,p.spec);
        var text=vs.map(function(x){return x.c+':'+x.v+' '+plainText(x.words);}).join('\n\n');
        addRefObj(refDisp,text,'');
      });
    });
  }
  function pushRef(refStr,source){
    if(isEmbedded){
      try{window.parent.postMessage({bshNotebook:true,action:'pushRef',refStr:refStr,source:source||''},location.origin);}catch(e){}
      return;
    }
    open();
    toast('Resolving '+refStr+'…');
    ensureBooks().then(function(){var p=parseRefStr(refStr);if(!p){toast('Could not parse "'+refStr+'"');return;}
      return resolveVerses(p.id,p.spec).then(function(vs){if(!vs.length){toast('No verses for "'+refStr+'"');return;}
        var refDisp=formatRef(p.id,p.spec);
        var text=vs.map(function(x){return x.c+':'+x.v+' '+plainText(x.words);}).join('\n\n');
        addRefObj(refDisp,text,source||'');
      });
    });
  }
  /* Attach a Strong's Greek/Hebrew lexicon entry to the active note as an insertable card. */
  function pushWord(p){
    if(isEmbedded){
      try{window.parent.postMessage({bshNotebook:true,action:'pushWord',payload:p},location.origin);}catch(e){}
      return;
    }
    open();
    var strong=(p&&p.strong)||'', lemma=(p&&p.lemma)||'', translit=(p&&p.translit)||'',
        gloss=(p&&p.gloss)||'', def=(p&&p.def)||'', lang=(p&&p.lang)||'';
    var refDisp=strong+(lemma?(' \u00b7 '+lemma):'')+(translit?(' ('+translit+')'):'')+(gloss?(' \u2014 '+gloss):'');
    var lines=[];
    lines.push((lang==='G'?'Greek':'Hebrew')+' lexicon entry \u00b7 '+strong);
    if(lemma)lines.push('Lemma: '+lemma);
    if(translit)lines.push('Transliteration: '+translit);
    if(gloss)lines.push('English gloss: '+gloss);
    if(def)lines.push('Definition: '+def);
    var text=lines.join('\n');
    /* When inserted into the note, keep the original word, its transliteration (how to sound it out), the English word, and the definition. */
    var ins='';
    if(lemma||translit||gloss){
      ins+=lemma;
      if(translit)ins+=(lemma?' (':'')+translit+(lemma?')':'');
      if(gloss)ins+=ins?' — '+gloss:gloss;
    }
    if(def){if(ins)ins+='\n';ins+=def;}
    addRefObj(refDisp,text,"Strong's",ins?{insertOverride:ins}:null);
  }

  /* ---------- open/close ---------- */
  function exportActiveNotePDF(){
    var db=load();var n=activeNote(db);
    if(!n){toast('No note to export');return;}
    if(!window.BiblePDF){toast('PDF module not loaded');return;}
    toast('Building PDF…');
    window.BiblePDF.note(n).then(function(){toast('PDF downloaded');}).catch(function(e){toast((e&&e.message)||'PDF failed');});
  }
  function importNotePDF(file){
    if(!file)return;
    if(!window.BiblePDF){toast('PDF module not loaded');return;}
    toast('Reading PDF…');
    window.BiblePDF.restore(file).then(function(r){
      if(r.kind!=='note')throw new Error('This PDF is a '+r.kind+', not a note.');
      var d=r.data||{},db=load();
      var n={id:uid(),title:d.title||'Imported note',body:d.body||'',refs:(d.refs||[]).map(function(x){return {ref:x.ref||'',text:x.text||'',sourceTool:x.sourceTool||'Imported',addedAt:x.addedAt||Date.now()};}),createdAt:Date.now(),updatedAt:Date.now()};
      db.notes.unshift(n);db.activeNoteId=n.id;save(db);render();
      toast('Imported: '+(n.title));
    }).catch(function(e){toast((e&&e.message)||'Import failed');});
  }
  function open(){
    if(isEmbedded){try{window.parent.postMessage({bshNotebook:true,action:'open'},location.origin);}catch(e){}return;}
    root.classList.add('bn-open');var fab=root.querySelector('.bn-fab');if(fab)fab.setAttribute('aria-expanded','true');render();
  }
  function close(){
    if(isEmbedded){try{window.parent.postMessage({bshNotebook:true,action:'close'},location.origin);}catch(e){}return;}
    root.classList.remove('bn-open');var fab=root.querySelector('.bn-fab');if(fab)fab.setAttribute('aria-expanded','false');
  }
  function toggle(){
    if(isEmbedded){try{window.parent.postMessage({bshNotebook:true,action:'toggle'},location.origin);}catch(e){}return;}
    if(root.classList.contains('bn-open'))close();else open();
  }
  var toastTimer=null;
  function toast(msg){elToast.textContent=msg;elToast.classList.add('bn-show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){elToast.classList.remove('bn-show');},2200);}

  /* ---------- events ---------- */
  root.addEventListener('click',function(e){
    var t=e.target.closest('[data-bn]');if(!t)return;
    var act=t.getAttribute('data-bn');
    if(act==='close'){close();return;}
    if(act==='toggle'){toggle();return;}
    if(act==='new'){newNote();return;}
    if(act==='rm'){removeRef(+t.getAttribute('data-i'));return;}
    if(act==='insert'){insertRef(+t.getAttribute('data-i'));return;}
    if(act==='addscripture'){addScriptureByRef();return;}
    if(act==='pdf'){exportActiveNotePDF();return;}
    if(act==='import'){elFile.click();return;}
  });
  elFile.addEventListener('change',function(e){var f=e.target.files&&e.target.files[0];if(f)importNotePDF(f);e.target.value='';});
  /* Note switching: a <select> only fires `change` when a new option is chosen (not `click`).
     Handling it on click re-rendered the panel and destroyed the dropdown before it could open. */
  root.addEventListener('change',function(e){
    var t=e.target.closest('[data-bn]');if(!t)return;
    if(t.getAttribute('data-bn')==='select'){selectNote(t.value);}
  });
  root.addEventListener('input',function(e){
    var t=e.target.closest('[data-bn]');if(!t)return;
    var act=t.getAttribute('data-bn');
    if(act==='title'){updateField('title',t.value);}
    else if(act==='body'){updateField('body',t.value);}
  });
  elBody.addEventListener('keydown',function(e){
    if(e.key==='Enter'&&e.target.getAttribute('data-bn')==='addref'){e.preventDefault();addScriptureByRef();}
  });
  var lastSel={s:0,e:0};
  function captureSel(e){var t=e.target;if(t&&t.classList&&t.classList.contains('bn-textarea')){lastSel.s=t.selectionStart||0;lastSel.e=t.selectionEnd||lastSel.s;}}
  elBody.addEventListener('keyup',captureSel);
  elBody.addEventListener('click',captureSel);
  elBody.addEventListener('select',captureSel);
  elBody.addEventListener('input',captureSel);
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&root.classList.contains('bn-open'))close();});
  window.addEventListener('storage',function(e){if(e.key===KEY)render();});

  /* Receive relayed actions from Split View panes (only relevant when this page IS the
     shell hosting the single real drawer, i.e. not itself embedded). Origin-checked since
     even same-origin postMessage should be validated defensively. */
  if(!isEmbedded){
    window.addEventListener('message',function(e){
      if(e.origin!==location.origin) return;
      var d=e.data;
      if(!d||!d.bshNotebook) return;
      if(d.action==='open')open();
      else if(d.action==='close')close();
      else if(d.action==='toggle')toggle();
      else if(d.action==='pushRef')pushRef(d.refStr,d.source);
      else if(d.action==='pushWord')pushWord(d.payload);
    });
  }

  /* ---------- draggable FAB (mobile only; locked on desktop) ---------- */
  (function(){
    var fab=root.querySelector('.bn-fab');
    if(!fab)return;
    var POS_KEY='bn_fab_pos_v1';
    // Desktop = coarse pointer absent AND viewport wide. Drag is mobile-only.
    var isMobile=function(){
      try{
        return window.matchMedia('(pointer:coarse)').matches || window.innerWidth < 900;
      }catch(e){return window.innerWidth < 900;}
    };
    function resetToCorner(){
      // Clear inline position so the CSS bottom/right anchor takes over.
      fab.style.left='';fab.style.top='';fab.style.right='';fab.style.bottom='';
    }
    if(!isMobile()){
      // Desktop: wipe any previously-saved drag position and lock the FAB in place.
      try{safeLS.removeItem(POS_KEY);}catch(e){}
      resetToCorner();
      // Re-check on resize in case the window shrinks into mobile territory.
      window.addEventListener('resize',function(){
        if(isMobile()) return; // let mobile branch handle it next reload
        resetToCorner();
      });
      return; // do not wire drag handlers on desktop
    }
    // -- Mobile branch --
    var dragging=false,moved=false,sx=0,sy=0,ox=0,oy=0,suppressNext=false;
    function clamp(x,y){
      var w=fab.offsetWidth||150,h=fab.offsetHeight||44;
      var mx=Math.max(0,window.innerWidth-w),my=Math.max(0,window.innerHeight-h);
      return {x:Math.max(0,Math.min(x,mx)),y:Math.max(0,Math.min(y,my))};
    }
    function applyPos(x,y){fab.style.right='auto';fab.style.bottom='auto';fab.style.left=x+'px';fab.style.top=y+'px';}
    function savePos(x,y){try{safeLS.setItem(POS_KEY,JSON.stringify({x:x,y:y}));}catch(e){}}
    function loadPos(){try{var p=JSON.parse(safeLS.getItem(POS_KEY));return (p&&typeof p.x==='number')?p:null;}catch(e){return null;}}
    function restore(){var p=loadPos();if(!p)return;var c=clamp(p.x,p.y);applyPos(c.x,c.y);}
    restore();
    window.addEventListener('resize',function(){var p=loadPos();if(!p)return;var c=clamp(p.x,p.y);applyPos(c.x,c.y);});
    fab.addEventListener('pointerdown',function(e){
      if(e.button!==undefined&&e.button!==0)return;
      dragging=true;moved=false;sx=e.clientX;sy=e.clientY;
      var r=fab.getBoundingClientRect();ox=r.left;oy=r.top;
      try{fab.setPointerCapture(e.pointerId);}catch(err){}
    });
    fab.addEventListener('pointermove',function(e){
      if(!dragging)return;
      var dx=e.clientX-sx,dy=e.clientY-sy;
      if(!moved&&Math.hypot(dx,dy)<6)return;
      if(!moved){moved=true;fab.classList.add('bn-dragging');}
      var c=clamp(ox+dx,oy+dy);applyPos(c.x,c.y);
    });
    function endDrag(){
      if(!dragging)return;
      dragging=false;
      if(moved){fab.classList.remove('bn-dragging');var r=fab.getBoundingClientRect();savePos(r.left,r.top);suppressNext=true;}
    }
    fab.addEventListener('pointerup',endDrag);
    fab.addEventListener('pointercancel',endDrag);
    // suppress the toggle click that follows a drag
    fab.addEventListener('click',function(e){if(suppressNext){suppressNext=false;e.stopPropagation();e.preventDefault();}},true);
  })();

  // Import a pre-formed note (e.g. from Bible Connect "Add to my Notebook").
  // Goes through save() so cloud sync fires and drawer state updates in this tab.
  function importNote(entry){
    if(!entry||typeof entry!=='object')return null;
    var db=load();
    var n={
      id:entry.id||uid(),
      title:String(entry.title||'Untitled note'),
      body:String(entry.body||''),
      refs:Array.isArray(entry.refs)?entry.refs.map(function(r){return {ref:r.ref||'',text:r.text||'',sourceTool:r.sourceTool||'Bible Connect',addedAt:r.addedAt||Date.now()};}):[],
      createdAt:entry.createdAt||Date.now(),
      updatedAt:Date.now()
    };
    db.notes.unshift(n);
    db.activeNoteId=n.id;
    save(db);
    render();
    return n;
  }

// expose
  window.BibleNotebook={toggle:toggle,open:open,close:close,pushRef:pushRef,pushWord:pushWord,addScriptureByRef:addScriptureByRef,newNote:newNote,importNote:importNote,
    list:function(){ return load().notes||[]; }
  };

  /* Auto-open the drawer when a caller navigates with #notebook=open or
     ?notebook=open (e.g. Bible Connect "Open in Notebook" after import). */
  (function(){
    function shouldOpen(){
      try{
        var qs=new URLSearchParams(location.search||'');
        if(qs.get('notebook')==='open')return true;
        var h=(location.hash||'').replace(/^#/,'');
        if(!h)return false;
        var hs=new URLSearchParams(h);
        if(hs.get('notebook')==='open')return true;
        // also match a bare "#notebook=open" fragment style used by earlier links
        return /(^|&)notebook=open(&|$)/.test(h);
      }catch(e){return false;}
    }
    function stripFlag(){
      try{
        var url=new URL(location.href);
        url.searchParams.delete('notebook');
        var h=(url.hash||'').replace(/^#/,'');
        if(h){
          var hs=new URLSearchParams(h);
          hs.delete('notebook');
          var rest=hs.toString();
          url.hash=rest?('#'+rest):'';
        }
        history.replaceState(history.state,'',url.pathname+url.search+url.hash);
      }catch(e){}
    }
    if(shouldOpen()){
      // Delay so drawer DOM + cloud sync have a moment to hydrate first.
      setTimeout(function(){try{open();}catch(e){}stripFlag();},250);
    }
  })();

  // initial badge count
  elCount.textContent=load().notes.length;
})();

/* ============================================================
   Builder Tray — cross-tool inbox for the Bible Study Builder.
   Loaded on every hub tool (this file is shared). Collects verses, word-study
   entries, and text snippets into shared storage ("builder_tray"); the Builder
   reads them on load and renders a tray banner for placing into sections.
   Exposes window.BuilderTray.
   ============================================================ */
(function(){
  if(window.BuilderTray)return;
  var KEY='builder_tray';
  var BUILDER_URL='../builder/index.html?tray=1';
  var isEmbedded=false;
  try{isEmbedded=new URLSearchParams(location.search).get('embed')==='split';}catch(e){}
  function uid(){return 't'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
  function load(){try{var a=JSON.parse(safeLS.getItem(KEY));return Array.isArray(a)?a:[];}catch(e){return [];}}
  function save(arr){try{safeLS.setItem(KEY,JSON.stringify(arr));}catch(e){}if(traySync)traySync.notifyLocalChange();notifyChanged(arr);}
  function notifyChanged(arr){try{window.dispatchEvent(new CustomEvent('buildertray:changed',{detail:arr||load()}));}catch(e){}}
  var traySync=null;
  if(window.CloudAccount){
    traySync=window.CloudAccount.bindSync('builder_tray',{
      getLocal:load,
      setLocal:function(cloudData){try{safeLS.setItem(KEY,JSON.stringify(cloudData));}catch(e){}},
      emptyValue:[],
      onRemoteUpdate:function(){updateBadge();}
    });
  }
  function items(){return load();}
  function count(){return load().length;}
  function remove(id){var a=load().filter(function(x){return x.id!==id;});save(a);updateBadge();}
  function clear(){save([]);updateBadge();}
  function add(item){var a=load();item.id=item.id||uid();item.addedAt=Date.now();a.push(item);save(a);updateBadge();return item.id;}
  function pushVerse(ref,source){
    if(isEmbedded){try{window.parent.postMessage({bshTray:true,action:'pushVerse',ref:ref,source:source||''},location.origin);}catch(e){}flash('Added '+ref+' to Builder Tray');return;}
    var id=add({kind:'verse',ref:String(ref||'').trim(),text:'',source:source||''});flash('Added '+ref+' to Builder Tray');return id;
  }
  function pushWord(payload,source){
    if(isEmbedded){try{window.parent.postMessage({bshTray:true,action:'pushWord',payload:payload,source:source||"Strong's"},location.origin);}catch(e){}flash('Added word to Builder Tray');return;}
    var id=add({kind:'word',payload:payload||{},source:source||"Strong's"});flash('Added word to Builder Tray');return id;
  }
  function pushText(label,text,source){
    if(isEmbedded){try{window.parent.postMessage({bshTray:true,action:'pushText',label:label,text:text,source:source||''},location.origin);}catch(e){}flash('Added text to Builder Tray');return;}
    var id=add({kind:'text',label:String(label||'').trim(),text:String(text||''),source:source||''});flash('Added text to Builder Tray');return id;
  }
  var toastEl=null,flashTimer=null;
  function flash(msg){if(window.BibleNotebook){try{var t=document.querySelector('.bn-toast');if(t){t.textContent=msg;t.classList.add('bn-show');clearTimeout(flashTimer);flashTimer=setTimeout(function(){t.classList.remove('bn-show');},2000);return;}}catch(e){}}
    if(!toastEl){toastEl=document.createElement('div');toastEl.style.cssText='position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:var(--accent);color:#fff;padding:9px 16px;border-radius:var(--r-pill);font-size:var(--t-sm);font-weight:600;opacity:0;pointer-events:none;transition:.25s;z-index:10001;box-shadow:var(--shadow-3);font-family:var(--font-sans)';document.body.appendChild(toastEl);}
    toastEl.textContent=msg;toastEl.style.opacity='1';clearTimeout(flashTimer);flashTimer=setTimeout(function(){toastEl.style.opacity='0';},2000);}
  function openBuilder(){try{window.location.href=BUILDER_URL;}catch(e){}}
  function isBuilderPage(){return /\/(sermon|builder)\/index\.html/.test(location.pathname);}
  function esc2(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

  /* ---- tray panel rendered INSIDE the Notebook drawer (no extra floating button) ---- */
  function fabBadgeEl(){
    var fab=document.querySelector('.bn-fab');if(!fab)return null;
    var b=fab.querySelector('.bn-fab-tray');if(!b){b=document.createElement('span');b.className='bn-fab-tray';fab.appendChild(b);}
    return b;
  }
  function renderPanel(){
    var hosts=document.querySelectorAll('.bt-panel');if(!hosts.length)return;
    var its=load();
    var cards=its.map(function(it,i){
      var label,sub;
      if(it.kind==='verse'){label=it.ref;sub=it.text?(String(it.text).slice(0,90)+(it.text.length>90?'…':'')):'Resolves to KJV text on insert';}
      else if(it.kind==='word'){var p=it.payload||{};label=p.strong||(p.lemma||'Word entry');sub=p.gloss||('Strong\'s '+(p.lang==='G'?'Greek':'Hebrew')+' entry');}
      else{label=it.label||'Text snippet';sub=String(it.text||'').slice(0,90)+(it.text&&it.text.length>90?'…':'');}
      return '<div class="bt-card"><div class="bt-card-hd"><span class="bt-card-l">'+esc2(label)+'</span>'+
        (it.source?'<span class="bt-card-src">'+esc2(it.source)+'</span>':'')+
        '<button class="bt-card-rm" data-bt="rm" data-i="'+i+'" aria-label="Remove">✕</button></div>'+
        '<div class="bt-card-sub">'+esc2(sub)+'</div></div>';
    }).join('');
    var html=
      '<div class="bt-head"><span class="bt-title">Builder Tray</span>'+
      '<span class="bt-count">'+its.length+'</span>'+
      (its.length?'<button class="bt-mini" data-bt="clear">Clear</button>':'')+
      '<button class="bt-open" data-bt="open">'+(isBuilderPage()?'Jump to Builder ↘':'Open Builder ↗')+'</button></div>'+
      (its.length?('<div class="bt-cards">'+cards+'</div>'):'<div class="bt-empty">Collect from any tool with the <b>＋ Builder</b> button on a verse, word entry, or atlas stop — then open the Builder to drop them into your outline.</div>')+
      '<div class="bt-addrow"><input class="bt-input" data-bt="addref" placeholder="Quick-add a reference: Acts 2:38, John 3…"><button class="bt-addbtn" data-bt="addref-go">+ Add</button></div>';
    hosts.forEach(function(host){ host.innerHTML=html; });
  }
  function ensurePanel(body){var h=body.querySelector('.bt-panel');if(h)return h;h=document.createElement('div');h.className='bt-panel';body.insertBefore(h,body.firstChild);renderPanel();return h;}
  function attachPanel(body){if(body)ensurePanel(body);}
  function addByRef(val){val=String(val||'').trim();if(!val)return;pushVerse(val,'Typed');renderPanel();}
  function updateBadge(){var c=count();var b=fabBadgeEl();if(b){b.textContent=c;b.style.display=c>0?'flex':'none';}if(document.querySelector('.bt-panel'))renderPanel();}

  document.addEventListener('click',function(e){
    var t=e.target.closest('[data-bt]');if(!t)return;var act=t.getAttribute('data-bt');
    if(act==='rm'){var a=load();a.splice(+t.getAttribute('data-i'),1);save(a);updateBadge();return;}
    if(act==='clear'){clear();renderPanel();return;}
    if(act==='open'){if(isBuilderPage()){var bb=document.getElementById('builder-content')||document.getElementById('pane-builder');if(bb)bb.scrollIntoView({behavior:'smooth',block:'start'});return;}openBuilder();return;}
    if(act==='addref-go'){var inp=document.querySelector('.bt-input');addByRef(inp?inp.value:'');return;}
  });
  document.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target&&e.target.getAttribute&&e.target.getAttribute('data-bt')==='addref'){e.preventDefault();addByRef(e.target.value);}});

  (function(){var st=document.createElement('style');st.textContent=
    '.bn-fab-tray{position:absolute;top:-4px;right:-4px;background:var(--ink);color:var(--surface);border:2px solid var(--surface);border-radius:50%;font-size:.6rem;font-weight:700;min-width:16px;width:16px;height:16px;padding:0;display:none;align-items:center;justify-content:center;font-family:var(--font-sans);line-height:1;z-index:9999}'+
    '.bt-panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:10px 11px;margin-bottom:12px}'+
    '.bt-head{display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap}'+
    '.bt-title{font-family:var(--font-sans);font-weight:600;font-size:var(--t-xs);letter-spacing:.08em;text-transform:uppercase;font-variant-caps:all-small-caps;color:var(--ink-3);flex:1}'+
    '.bt-count{background:var(--accent);color:#fff;border-radius:var(--r-pill);font-size:.6rem;font-weight:700;padding:1px 6px;min-width:14px;text-align:center}'+
    '.bt-mini{background:none;border:none;color:var(--accent);border-radius:var(--r-xs);font-size:.64rem;font-weight:700;padding:2px 4px;cursor:pointer;font-family:var(--font-sans);text-decoration:none;transition:color var(--dur-1)}'+
    '.bt-mini:hover{color:var(--accent-hover);text-decoration:underline}'+
    '.bt-open{background:var(--accent);color:#fff;border:none;border-radius:var(--r-xs);font-size:.66rem;font-weight:700;padding:3px 9px;cursor:pointer;font-family:var(--font-sans);transition:background var(--dur-1)}'+
    '.bt-open:hover{background:var(--accent-hover)}'+
    '.bt-cards{display:flex;flex-direction:column;gap:6px;max-height:190px;overflow-y:auto;margin-bottom:8px}'+
    '.bt-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:6px 8px}'+
    '.bt-card-hd{display:flex;align-items:center;gap:6px}'+
    '.bt-card-l{font-family:var(--font-serif);font-weight:700;font-size:var(--t-sm);color:var(--accent);flex:1;word-break:break-word}'+
    '.bt-card-src{font-size:.56rem;color:var(--ink-3);background:var(--surface-2);border-radius:var(--r-xs);padding:1px 5px;white-space:nowrap}'+
    '.bt-card-rm{background:none;border:none;color:var(--ink-3);cursor:pointer;font-size:.8rem;line-height:1;padding:0 2px;border-radius:var(--r-xs);transition:color var(--dur-1),background var(--dur-1)}'+
    '.bt-card-rm:hover{color:var(--accent);background:var(--surface-2)}'+
    '.bt-card-sub{font-size:var(--t-xs);color:var(--ink-2);margin-top:2px;line-height:1.45}'+
    '.bt-empty{font-size:var(--t-xs);color:var(--ink-3);line-height:1.55;padding:2px 2px 8px}'+
    '.bt-addrow{display:flex;gap:6px}'+
    '.bt-input{flex:1;font-family:var(--font-sans);font-size:var(--t-sm);padding:6px 8px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--ink);min-width:0}'+
    '.bt-input:focus{outline:none;border-color:var(--accent);box-shadow:var(--focus)}'+
    '.bt-addbtn{background:var(--accent);color:#fff;border:none;border-radius:var(--r-sm);font-size:var(--t-xs);font-weight:700;padding:6px 11px;cursor:pointer;font-family:var(--font-sans);white-space:nowrap;transition:background var(--dur-1)}'+
    '.bt-addbtn:hover{background:var(--accent-hover)}';
    document.head.appendChild(st);
  })();
  updateBadge();
  window.addEventListener('storage',function(e){if(e.key===KEY)updateBadge();});
  window.addEventListener('buildertray:changed',function(){updateBadge();});

  /* Receive relayed tray adds from Split View panes (shell side only). */
  if(!isEmbedded){
    window.addEventListener('message',function(e){
      if(e.origin!==location.origin) return;
      var d=e.data;
      if(!d||!d.bshTray) return;
      if(d.action==='pushVerse')pushVerse(d.ref,d.source);
      else if(d.action==='pushWord')pushWord(d.payload,d.source);
      else if(d.action==='pushText')pushText(d.label,d.text,d.source);
    });
  }

  window.BuilderTray={items:items,count:count,remove:remove,clear:clear,pushVerse:pushVerse,pushWord:pushWord,pushText:pushText,openBuilder:openBuilder,updateBadge:updateBadge,attachPanel:attachPanel,renderPanel:renderPanel};
})();
