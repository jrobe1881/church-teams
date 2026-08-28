/* Bible Parlor — client-side PDF export (notebook notes + sermons)
   Loads jsPDF from CDN on first use. Exposes window.BiblePDF.note(obj) / .sermon(obj).
   No backend; runs fully in the browser (works on published pplx.app sites). */
(function(){
  if(window.BiblePDF) return;
  var CDN='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  function ensureJsPDF(){
    if(window.jspdf&&window.jspdf.jsPDF)return Promise.resolve(window.jspdf.jsPDF);
    if(window._bnPdfLoading)return window._bnPdfLoading;
    window._bnPdfLoading=new Promise(function(res,rej){
      var s=document.createElement('script');s.src=CDN;s.onload=function(){(window.jspdf&&window.jspdf.jsPDF)?res(window.jspdf.jsPDF):rej(new Error('jsPDF not found'));};s.onerror=function(){rej(new Error('Could not load PDF library'));};document.head.appendChild(s);
    });
    return window._bnPdfLoading;
  }
  function safeName(s){s=String(s||'').replace(/[^\w\- ]+/g,'').trim().replace(/\s+/g,'-').slice(0,60);return s||'document';}
  function escAmp(s){return String(s==null?'':s).replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
  function plain(s){ // strip simple HTML tags from verse text fallback
    return String(s==null?'':s).replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  }
  function fold(s){ // ASCII-fold for jsPDF built-in fonts (no Greek/Hebrew/diacritic glyphs)
    s=String(s==null?'':s);
    try{s=s.normalize('NFD');}catch(e){}
    s=s.replace(/[\u0300-\u036f]/g,'')      // strip combining diacritics
        .replace(/\u2026/g,'...')            // ellipsis
        .replace(/[\u00b7\u2219\u2022]/g,'-') // middot/bullet
        .replace(/[\u2018\u2019\u02bc]/g,"'") // curly/modifier apostrophe
        .replace(/[\u201c\u201d]/g,'"')      // curly quotes
        .replace(/[\u2013\u2014]/g,'-')      // en/em dash
        .replace(/[^\x20-\x7e]/g,'');        // drop anything else non-ASCII
    return s;
  }

  function build(doc,opts){
    var W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight();
    var M=opts.margin||64, foot=opts.footer||'Bible Parlor · KJV';
    var cw=W-2*M, y=M;
    function newPage(){doc.addPage();y=M;}
    function ensure(h){if(y+h>H-M-26){newPage();}}
    function text(str,o){
      o=o||{};var size=o.size||11,font=o.font||'times',style=o.style||'normal';
      var color=o.color||[43,38,34],lh=o.lh||size*1.42,indent=o.indent||0,gap=o.gap!=null?o.gap:6;
      doc.setFont(font,style);doc.setFontSize(size);doc.setTextColor(color[0],color[1],color[2]);
      var lines=doc.splitTextToSize(String(str==null?'':str),cw-indent);
      for(var i=0;i<lines.length;i++){ensure(lh);doc.text(lines[i],M+indent,y);y+=lh;}
      y+=gap;
    }
    function rule(c){ensure(14);doc.setDrawColor(c?c[0]:176,c?c[1]:141,c?c[2]:60);doc.setLineWidth(1);doc.line(M,y,W-M,y);y+=12;}
    function space(h){y+=h;}
    return {text:text,rule:rule,space:space,cw:cw,M:M,W:W,H:H,
      finish:function(name,payload){
        var pages=doc.internal.getNumberOfPages();
        for(var p=1;p<=pages;p++){doc.setPage(p);doc.setFont('times','italic');doc.setFontSize(8);doc.setTextColor(150,145,134);
          doc.text(foot,M,H-26);doc.text('Page '+p+' of '+pages,W-M,H-26,{align:'right'});}
        // hidden round-trip payload (white, tiny) so the note/sermon can be restored from this PDF
        if(payload){
          doc.setPage(pages);
          doc.setTextColor(255,255,255);doc.setFont('helvetica','normal');doc.setFontSize(3);
          var enc='';try{enc=btoa(unescape(encodeURIComponent(JSON.stringify(payload))));}catch(e){}
          // each chunk carries its byte-offset so order is recovered even if pdf.js reorders items
          var CH=180,row=0;
          for(var i=0;i<enc.length;i+=CH){
            doc.text('BDX'+i+'|'+enc.slice(i,i+CH),M,H-7-row*3.4);row++;
          }
        }
        doc.save(safeName(name)+'.pdf');
      }};
  }

  function note(note){
    return ensureJsPDF().then(function(jsPDF){
      var doc=new jsPDF({unit:'pt',format:'letter'});
      doc.setProperties({title:note.title||'Note',author:'Perplexity Computer',subject:'Bible Study Notebook',creator:'Bible Parlor'});
      var b=build(doc,{footer:'Apostolic Bible Study Notebook · KJV'});
      b.text('STUDY NOTE',{size:9,style:'normal',color:[176,141,60],gap:4});
      b.text(note.title||'Untitled Note',{size:22,style:'bold',gap:6});
      var meta=[];
      if(note.refs&&note.refs.length)meta.push(note.refs.length+' scripture'+(note.refs.length===1?'':'s')+' referenced');
      if(meta.length)b.text(meta.join(' · '),{size:9,style:'italic',color:[122,31,43],gap:8});
      b.rule();
      if(note.body&&note.body.trim()){b.text(note.body.trim(),{size:12,lh:17,gap:10});}
      else if(!(note.refs&&note.refs.length)){b.text('(This note is empty.)',{size:11,style:'italic',color:[140,135,126]});}
      if(note.refs&&note.refs.length){
        b.space(4);b.text('SCRIPTURES REFERENCED',{size:11,style:'bold',color:[122,31,43],gap:6});
        note.refs.forEach(function(r){
          b.text(r.ref,{size:11,style:'bold',gap:2});
          b.text(plain(r.text),{size:10,style:'italic',color:[90,82,73],lh:14,indent:10,gap:8});
        });
      }
      b.finish(note.title||'note',{kind:'note',data:note});
    });
  }

  function sermon(s){
    return ensureJsPDF().then(function(jsPDF){
      var doc=new jsPDF({unit:'pt',format:'letter'});
      doc.setProperties({title:s.title||'Sermon',author:'Perplexity Computer',subject:'Sermon Outline',creator:'Bible Parlor'});
      var b=build(doc,{footer:'Bible Parlor · Builder · KJV'});
      b.text('SERMON OUTLINE',{size:9,style:'normal',color:[176,141,60],gap:4});
      b.text(s.title||'Untitled Sermon',{size:22,style:'bold',gap:6});
      var meta=[];
      if(s.mainText)meta.push('Text: '+s.mainText);
      if(s.speaker)meta.push(s.speaker);
      if(s.theme)meta.push(s.theme);
      if(s.date)meta.push(s.date);
      if(meta.length)b.text(meta.join('  ·  '),{size:10,style:'italic',color:[122,31,43],gap:8});
      b.rule();
      var pn=0;
      (s.sections||[]).forEach(function(sec,idx){
        b.space(4);
        var label;
        if(sec.kind==='intro')label='INTRODUCTION';
        else if(sec.kind==='conclusion')label='CONCLUSION';
        else{pn++;label='POINT '+pn;}
        b.text(label,{size:10,style:'bold',color:[122,31,43],gap:3});
        if(sec.title)b.text(sec.title,{size:14,style:'bold',gap:6});
        if(sec.verses&&sec.verses.length){
          sec.verses.forEach(function(v){
            b.text(v.ref,{size:11,style:'bold',indent:8,gap:1});
            b.text(plain(v.text),{size:10,style:'italic',color:[90,82,73],lh:14,indent:18,gap:6});
          });
          b.space(2);
        }
        if(sec.words&&sec.words.length){
          b.text('Word Study',{size:9,style:'bold',color:[176,141,60],gap:2});
          sec.words.forEach(function(w){
            // jsPDF built-in Times lacks Greek/Hebrew glyphs; show ASCII-folded transliteration + English + definition.
            var head=[];
            if(w.translit)head.push(fold(w.translit));
            if(w.gloss)head.push(fold(w.gloss));
            if(w.strong)head.push(w.strong);
            if(head.length)b.text(head.join('  -  '),{size:11,style:'bold',indent:8,gap:1});
            if(w.def)b.text(fold(plain(w.def)),{size:10,style:'italic',color:[80,74,66],lh:14,indent:18,gap:6});
          });
          b.space(2);
        }
        if(sec.notes&&sec.notes.trim()){b.text('Exposition',{size:9,style:'bold',color:[176,141,60],gap:2});b.text(sec.notes.trim(),{size:11,lh:16,gap:8});}
        if(sec.illustration&&sec.illustration.trim()){b.text('Illustration',{size:9,style:'bold',color:[176,141,60],gap:2});b.text(sec.illustration.trim(),{size:10,style:'italic',color:[80,74,66],lh:15,gap:8});}
      });
      b.finish(s.title||'sermon',{kind:'sermon',data:s});
    });
  }

  var KIND_LABELS={intro:'INTRODUCTION',icebreaker:'ICEBREAKER / OPENING',point:'POINT',teaching:'TEACHING POINT',
    observation:'OBSERVATION',interpretation:'INTERPRETATION',application:'APPLICATION',discussion:'DISCUSSION',
    memory:'MEMORY VERSE',crossref:'CROSS-REFERENCES',leader:'LEADER NOTES',conclusion:'CLOSING'};
  var NUMBERED_PDF=['point','teaching'];
  function studyLabel(sec,idx,sections){
    var k=KIND_LABELS[sec.kind]||(sec.kind||'').toUpperCase();
    if(NUMBERED_PDF.indexOf(sec.kind)>=0){var n=0;for(var i=0;i<=idx;i++)if(NUMBERED_PDF.indexOf(sections[i].kind)>=0)n++;return k+' '+n;}
    return k;
  }
  function study(s,mode){
    mode=mode||'leader';
    return ensureJsPDF().then(function(jsPDF){
      var doc=new jsPDF({unit:'pt',format:'letter'});
      var isLeader=mode!=='participant';
      doc.setProperties({title:s.title||'Bible Study',author:'Perplexity Computer',subject:isLeader?'Bible Study Leader Guide':'Bible Study Participant Handout',creator:'Bible Parlor'});
      var b=build(doc,{footer:'Bible Parlor · '+(isLeader?'Leader Guide':'Participant Handout')+' · KJV'});
      b.text(isLeader?'BIBLE STUDY — LEADER GUIDE':'BIBLE STUDY — PARTICIPANT HANDOUT',{size:9,style:'normal',color:[176,141,60],gap:4});
      b.text(s.title||'Untitled Study',{size:22,style:'bold',gap:6});
      var meta=[];
      if(s.mainText)meta.push((isLeader?'Passage: ':'')+s.mainText);
      if(s.audience)meta.push('Audience: '+s.audience);
      if(s.series)meta.push('Series: '+s.series);
      if(s.teacher&&isLeader)meta.push('Teacher: '+s.teacher);
      if(s.date)meta.push(s.date);
      if(meta.length)b.text(meta.join('  ·  '),{size:10,style:'italic',color:[122,31,43],gap:8});
      b.rule();
      var secs=s.sections||[];
      secs.forEach(function(sec,idx){
        // participant handout hides Leader Notes sections entirely
        if(!isLeader&&sec.kind==='leader')return;
        b.space(4);
        b.text(studyLabel(sec,idx,secs),{size:10,style:'bold',color:[122,31,43],gap:3});
        if(sec.title)b.text(sec.title,{size:14,style:'bold',gap:6});
        if(sec.verses&&sec.verses.length){
          sec.verses.forEach(function(v){
            b.text(v.ref,{size:11,style:'bold',indent:8,gap:1});
            b.text(plain(v.text),{size:10,style:'italic',color:[90,82,73],lh:14,indent:18,gap:6});
          });
          b.space(2);
        }
        if(sec.words&&sec.words.length){
          b.text('Word Study',{size:9,style:'bold',color:[176,141,60],gap:2});
          sec.words.forEach(function(w){
            var head=[];if(w.translit)head.push(fold(w.translit));if(w.gloss)head.push(fold(w.gloss));if(w.strong)head.push(w.strong);
            if(head.length)b.text(head.join('  -  '),{size:11,style:'bold',indent:8,gap:1});
            if(w.def)b.text(fold(plain(w.def)),{size:10,style:'italic',color:[80,74,66],lh:14,indent:18,gap:6});
          });
          b.space(2);
        }
        if(sec.kind==='discussion'&&sec.questions&&sec.questions.length){
          sec.questions.forEach(function(qi,i){
            b.text('Q'+(i+1)+'. '+(qi.q||''),{size:11,style:'bold',indent:8,gap:2});
            if(isLeader){if(qi.a)b.text(qi.a,{size:10,style:'italic',color:[80,74,66],lh:14,indent:18,gap:6});}
            else{b.text('Answer: ___________________________________________',{size:10,color:[140,135,126],indent:18,gap:6});b.text('____________________________________________',{size:10,color:[140,135,126],indent:18,gap:6});}
          });
          b.space(2);
        }
        // participant handout hides Exposition/Leader notes content (only prompts reflection)
        if(sec.notes&&sec.notes.trim()){
          if(sec.kind==='leader'){if(isLeader){b.text('Leader Notes',{size:9,style:'bold',color:[176,141,60],gap:2});b.text(sec.notes.trim(),{size:11,lh:16,gap:8});}}
          else if(isLeader){b.text('Teaching Notes',{size:9,style:'bold',color:[176,141,60],gap:2});b.text(sec.notes.trim(),{size:11,lh:16,gap:8});}
          else if(['application','interpretation','observation'].indexOf(sec.kind)>=0){b.text('Notes:',{size:9,style:'bold',color:[176,141,60],gap:2});b.text('_________________________________________',{size:10,color:[140,135,126],lh:16,gap:4});b.text('_________________________________________',{size:10,color:[140,135,126],lh:16,gap:8});}
        }
        if(sec.illustration&&sec.illustration.trim()&&isLeader){b.text('Illustration',{size:9,style:'bold',color:[176,141,60],gap:2});b.text(sec.illustration.trim(),{size:10,style:'italic',color:[80,74,66],lh:15,gap:8});}
      });
      if(!isLeader)b.text('“Study to shew thyself approved unto God.” — 2 Timothy 2:15',{size:9,style:'italic',color:[140,135,126],gap:6});
      b.finish((s.title||'bible_study')+'_'+mode,{kind:'study',data:s});
    });
  }

  function loadPdfJs(){
    if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
    if(window._pdfjsLoading)return window._pdfjsLoading;
    var VER='3.11.174';
    window._pdfjsLoading=new Promise(function(res,rej){
      var s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/'+VER+'/pdf.min.js';
      s.onload=function(){if(window.pdfjsLib){window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/'+VER+'/pdf.worker.min.js';res(window.pdfjsLib);}else rej(new Error('pdf.js not found'));};
      s.onerror=function(){rej(new Error('Could not load pdf.js'));};document.head.appendChild(s);
    });
    return window._pdfjsLoading;
  }
  function restore(file){
    return loadPdfJs().then(function(pdfjsLib){
      return file.arrayBuffer();
    }).then(function(buf){
      return pdfjsLib.getDocument({data:buf}).promise;
    }).then(function(pdf){
      var n=pdf.numPages,all=[],chain=Promise.resolve();
      function grab(i){return pdf.getPage(i).then(function(page){return page.getTextContent();}).then(function(tc){for(var k=0;k<tc.items.length;k++){if(tc.items[k].str)all.push(tc.items[k].str);}});}
      for(var i=1;i<=n;i++){(function(i){chain=chain.then(function(){return grab(i);});})(i);}
      return chain.then(function(){
        var stripped=all.join('').replace(/\s+/g,'');
        var re=/BDX(\d+)\|([A-Za-z0-9+/=]*?)(?=BDX\d+\||$)/g,map={},m;
        while((m=re.exec(stripped))){map[+m[1]]=m[2];}
        var keys=Object.keys(map);
        if(!keys.length)throw new Error('No restorable data found. Only PDFs exported from this tool can be imported.');
        keys.sort(function(a,b){return +a-+b;});
        var enc=keys.map(function(k){return map[k];}).join('');
        var json;try{json=JSON.parse(decodeURIComponent(escape(atob(enc))));}catch(e){throw new Error('Could not read embedded data.');}
        if(!json||!json.kind)throw new Error('Unrecognized data format.');
        return json;
      });
    });
  }

  window.BiblePDF={note:note,sermon:sermon,study:study,restore:restore};
})();
