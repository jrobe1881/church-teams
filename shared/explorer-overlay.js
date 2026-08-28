/* explorer-overlay.js — Explorer as a slide-in overlay for every tool.
   Wraps the Explorer UI (search, A-Z browse, native topic view) with send-to actions.
   Exposes window.BshExplorerOverlay.{ open, close, toggle, openTopic }.
   Requires: BshTopicExplorer, BuilderTray + BibleNotebook (from notebook-drawer.js). */
(function(){
  if (window.BshExplorerOverlay) return;

  const SRC = '/sermon/';
  var TOPICS=null, VMETA=null, VDATA={}, TIDX=null, XREFS=null;

  // ---------- Styles ----------
  var css = document.createElement('style');
  css.textContent = `
  .bsh-eov-fab{position:fixed;right:16px;bottom:120px;z-index:9997;
    width:40px;height:40px;border-radius:50%;
    background:var(--surface);color:var(--ink-2);
    border:1px solid var(--border);cursor:pointer;
    box-shadow:var(--shadow-1);display:flex;align-items:center;justify-content:center;
    font-size:1rem;transition:background 160ms,color 160ms,border-color 160ms,transform 160ms;font-family:var(--font-serif)}
  .bsh-eov-fab:hover{background:var(--surface-2);color:var(--accent);border-color:var(--accent);transform:translateY(-1px)}
  .bsh-eov-fab .bsh-eov-lbl{position:absolute;right:48px;background:var(--ink);color:var(--surface);padding:5px 10px;border-radius:var(--r-sm);font-family:var(--font-sans);font-size:var(--t-xs);font-weight:600;letter-spacing:.2px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity var(--dur-1);box-shadow:var(--shadow-1)}
  .bsh-eov-fab:hover .bsh-eov-lbl{opacity:1}
  @media(max-width:620px){.bsh-eov-fab{width:36px;height:36px;font-size:1rem;right:12px;bottom:104px}.bsh-eov-fab .bsh-eov-lbl{display:none}}
  body.embed-split .bsh-eov-fab{display:none}

  .bsh-eov-overlay{position:fixed;inset:0;z-index:10005;background:rgba(20,19,16,.5);opacity:0;pointer-events:none;transition:opacity var(--dur-2)}
  .bsh-eov-root.open .bsh-eov-overlay{opacity:1;pointer-events:auto}

  .bsh-eov-panel{position:fixed;top:0;right:-780px;bottom:0;z-index:10006;
    width:min(760px,96vw);background:var(--surface);color:var(--ink);
    box-shadow:var(--shadow-3);
    transition:right var(--dur-3) var(--ease);display:flex;flex-direction:column;
    font-family:var(--font-sans);overflow:hidden}
  .bsh-eov-root.open .bsh-eov-panel{right:0}
  @media(max-width:620px){.bsh-eov-panel{width:100vw}}
  @media(max-width:840px){.bsh-eov-root.open .bsh-eov-panel{left:0 !important;right:0 !important;width:100% !important}}

  .bsh-eov-head{background:var(--surface-2);border-bottom:1px solid var(--border);color:var(--ink);padding:14px 18px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex-shrink:0}
  .bsh-eov-head .ttl{font-family:var(--font-serif);font-size:var(--t-xl);font-weight:600;letter-spacing:.3px;flex:1;min-width:0;color:var(--ink)}
  .bsh-eov-head .ttl .sub{font-size:var(--t-xs);font-weight:500;color:var(--ink-3);display:block;font-family:var(--font-sans);margin-top:2px}
  .bsh-eov-head .x{background:transparent;color:var(--ink-2);border:1px solid var(--border);border-radius:var(--r-sm);padding:8px 12px;font-size:var(--t-sm);font-weight:600;cursor:pointer;font-family:inherit;transition:background var(--dur-1)}
  .bsh-eov-head .x:hover{background:var(--surface-3)}
  .bsh-eov-head .tabs{display:flex;gap:4px;width:100%;margin-top:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
  .bsh-eov-head .tabs::-webkit-scrollbar{display:none}
  .bsh-eov-head .tabs button{background:transparent;color:var(--ink-3);border:1px solid transparent;border-radius:var(--r-sm);padding:7px 12px;font-size:var(--t-xs);font-weight:600;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;font-family:inherit;white-space:nowrap}
  .bsh-eov-head .tabs button.active{background:var(--accent-tint);color:var(--accent)}

  .bsh-eov-body{flex:1;overflow-y:auto;padding:16px 18px 90px;background:var(--surface)}
  .bsh-eov-body input,.bsh-eov-body select,.bsh-eov-body button{font-family:inherit}

  /* Search bar in overlay */
  .bsh-eov-search{display:flex;gap:8px;margin-bottom:12px;position:sticky;top:0;background:var(--surface);padding:2px 0 8px;z-index:2}
  .bsh-eov-search input{flex:1;min-width:160px;padding:12px 14px;font-size:16px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface-2);color:inherit}
  .bsh-eov-search input:focus{outline:none;border-color:var(--accent);box-shadow:var(--focus)}
  .bsh-eov-search select{padding:11px 10px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface-2);font-size:var(--t-sm)}
  @media(max-width:620px){.bsh-eov-search select{flex:1 1 40%}}

  .bsh-eov-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
  .bsh-eov-chips button{background:var(--surface);border:1px solid var(--border);color:var(--ink-3);padding:6px 11px;border-radius:var(--r-pill);font-size:var(--t-sm);cursor:pointer;transition:border-color var(--dur-1),color var(--dur-1)}
  .bsh-eov-chips button:hover{border-color:var(--border-strong);color:var(--accent)}

  .bsh-eov-status{color:var(--ink-3);font-size:var(--t-sm);margin:2px 0 10px}
  .bsh-eov-status b{color:var(--ink)}

  /* Continue-conversation banner (shared Ask AI history) */
  .bsh-eov-prior{background:var(--surface-2);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:var(--r-md);padding:10px 12px;margin-bottom:10px;font-size:var(--t-sm)}
  .bsh-eov-prior-hd{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
  .bsh-eov-prior-ti{font-weight:600;color:var(--ink-2)}
  .bsh-eov-prior-actions{display:flex;gap:6px}
  .bsh-eov-prior-btn{border:1px solid var(--border);background:var(--surface);color:var(--ink-2);border-radius:var(--r-sm);padding:4px 10px;font-size:var(--t-xs);font-weight:600;cursor:pointer;font-family:inherit}
  .bsh-eov-prior-btn.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
  .bsh-eov-prior-btn:hover{background:var(--surface-3)}
  .bsh-eov-prior-btn.primary:hover{background:var(--accent-hover)}
  .bsh-eov-prior-last{color:var(--ink-3);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

  /* Detected-topic bar and AI answer panel */
  .bsh-eov-qatop{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md);padding:10px 12px;margin-bottom:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
  .bsh-eov-qatop .lbl{font-size:var(--t-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:700}
  .bsh-eov-qatop .topicPill{background:var(--accent);color:#fff;padding:3px 10px;border-radius:var(--r-pill);font-size:var(--t-sm);font-weight:600}
  .bsh-eov-qatop .intent{background:var(--surface);border:1px solid var(--border);color:var(--ink-2);padding:3px 8px;border-radius:var(--r-pill);font-size:var(--t-xs);font-weight:600;text-transform:uppercase;letter-spacing:.05em}
  .bsh-eov-qatop .askBtn{background:var(--accent);color:#fff;border:none;padding:8px 14px;border-radius:var(--r-md);font-size:var(--t-sm);font-weight:600;cursor:pointer;transition:background var(--dur-1)}
  .bsh-eov-qatop .askBtn:hover{background:var(--accent-hover)}
  .bsh-eov-qatop .askBtn:disabled{opacity:.6;cursor:not-allowed}
  .bsh-eov-answer{background:var(--surface);border:1px solid var(--accent);border-left:4px solid var(--accent);border-radius:var(--r-md);padding:14px 16px;margin-bottom:12px;box-shadow:var(--shadow-1)}
  .bsh-eov-notice{background:#fff8e6;border:1px solid #e6c96b;color:#5c4600;font-size:12.5px;padding:8px 10px;border-radius:6px;margin-bottom:10px;line-height:1.35}
  .bsh-eov-answer .hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap}
  .bsh-eov-answer .hd .ti{font-family:var(--font-serif);font-weight:600;color:var(--accent);font-size:var(--t-md)}
  .bsh-eov-answer .hd .mm{font-size:var(--t-xs);color:var(--ink-3)}
  .bsh-eov-answer .bd{color:var(--ink);font-size:var(--t-md);line-height:1.6;white-space:pre-wrap;font-family:var(--font-scripture);max-height:none}
  .bsh-eov-answer .bd.streaming::after{content:'█';color:var(--accent);animation:bshBlink 1s steps(2) infinite;margin-left:2px}
  @keyframes bshBlink{50%{opacity:0}}
  .bsh-eov-answer .fd{margin-top:8px;font-size:var(--t-xs);color:var(--ink-3);font-style:italic}
  .bsh-eov-answer .err{color:#b3261e;font-size:var(--t-sm);padding:6px 0}
  /* Tool-use activity badges */
  .bsh-eov-tools{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
  .bsh-eov-tools .toolBadge{background:var(--surface-2);border:1px solid var(--border);color:var(--ink-2);padding:3px 9px;border-radius:var(--r-pill);font-size:var(--t-xs);font-weight:600;font-family:var(--font-sans);display:inline-flex;align-items:center;gap:5px}
  .bsh-eov-tools .toolBadge.running{border-color:var(--accent);color:var(--accent)}
  .bsh-eov-tools .toolBadge .dot{width:6px;height:6px;border-radius:50%;background:var(--ink-3);display:inline-block}
  .bsh-eov-tools .toolBadge.running .dot{background:var(--accent);animation:bshPulse 1s infinite}
  .bsh-eov-tools .toolBadge.done .dot{background:#2f7d3a}
  @keyframes bshPulse{50%{opacity:.35}}
  /* Follow-up input */
  .bsh-eov-followup{margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:stretch}
  .bsh-eov-followup input{flex:1;padding:11px 14px;font-size:16px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface-2);color:inherit;font-family:inherit}
  .bsh-eov-followup button{background:var(--accent);color:#fff;border:none;padding:11px 15px;border-radius:var(--r-md);font-weight:600;font-size:var(--t-sm);cursor:pointer;transition:background var(--dur-1);white-space:nowrap}
  .bsh-eov-followup button:hover{background:var(--accent-hover)}
  .bsh-eov-followup button:disabled{opacity:.6;cursor:not-allowed}
  /* Prior turns collapsed */
  .bsh-eov-turn{padding:12px 0;border-bottom:1px dashed var(--border)}
  .bsh-eov-turn:last-child{border-bottom:none}
  .bsh-eov-turn .qLine{font-family:var(--font-serif);font-weight:600;color:var(--accent);font-size:var(--t-sm);margin-bottom:6px}
  .bsh-eov-turn .qLine::before{content:'Q: ';color:var(--ink-3);font-weight:400}
  .bsh-eov-turn .aLine{color:var(--ink);font-size:var(--t-md);line-height:1.6;white-space:pre-wrap;font-family:var(--font-scripture)}
  .bsh-eov-empty{text-align:center;color:var(--ink-3);padding:22px;font-style:italic;font-family:var(--font-scripture)}

  .bsh-eov-match{background:var(--surface);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:var(--r-md);padding:11px 13px;margin-bottom:8px;cursor:pointer;transition:border-color var(--dur-2),box-shadow var(--dur-2)}
  .bsh-eov-match:hover{box-shadow:var(--shadow-1);border-color:var(--border-strong)}
  .bsh-eov-match .n{font-family:var(--font-serif);font-weight:600;font-size:var(--t-lg);color:var(--accent)}
  .bsh-eov-match .m{color:var(--ink-3);font-size:var(--t-xs);margin-top:2px}
  .bsh-eov-match .m .cat{background:var(--surface-2);padding:1px 8px;border-radius:var(--r-sm);font-weight:600;text-transform:uppercase;letter-spacing:.05em;font-size:var(--t-xs);color:var(--ink-2);margin-right:6px}

  /* Topic view */
  .bsh-eov-thead{background:var(--accent);color:#fff;border-radius:var(--r-md);padding:16px 18px;margin-bottom:12px;box-shadow:var(--shadow-2)}
  .bsh-eov-thead h1{font-family:var(--font-serif);font-size:var(--t-2xl);font-weight:600;margin:0 0 6px;letter-spacing:.3px}
  .bsh-eov-thead .tm{font-size:var(--t-sm);color:rgba(255,255,255,.85);display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .bsh-eov-thead .tm .pill{background:rgba(255,255,255,.16);padding:2px 9px;border-radius:var(--r-sm);font-weight:600;text-transform:uppercase;letter-spacing:.05em;font-size:var(--t-xs)}
  .bsh-eov-thead .act{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
  .bsh-eov-thead .act button,.bsh-eov-thead .act a{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.24);padding:6px 11px;border-radius:var(--r-sm);font-size:var(--t-xs);font-weight:600;cursor:pointer;text-decoration:none}

  .bsh-eov-sub{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;margin-bottom:10px}
  .bsh-eov-sub .sh{padding:11px 14px;background:var(--surface-2);border-bottom:1px solid var(--border);font-family:var(--font-serif);font-weight:600;font-size:var(--t-md);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;color:var(--ink)}
  .bsh-eov-sub .sh .c{font-size:var(--t-xs);color:var(--ink-3);background:var(--surface);border:1px solid var(--border);padding:2px 8px;border-radius:var(--r-pill);font-weight:600;font-family:var(--font-sans)}
  .bsh-eov-sub .sb{padding:6px 8px 10px}

  .bsh-eov-verse{padding:10px 10px;border-radius:var(--r-sm);border-top:1px solid transparent}
  .bsh-eov-verse + .bsh-eov-verse{border-top-color:var(--border)}
  .bsh-eov-verse .vh{display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:4px}
  .bsh-eov-verse .vr{font-family:var(--font-serif);font-weight:600;color:var(--accent);font-size:var(--t-sm);text-decoration:none}
  .bsh-eov-verse .vr:hover{text-decoration:underline}
  .bsh-eov-verse .vt{color:var(--ink);font-family:var(--font-scripture);font-size:var(--t-md);line-height:1.55}
  .bsh-eov-verse .va{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
  .bsh-eov-verse .va button{background:var(--surface);border:1px solid var(--border);color:var(--accent);padding:5px 10px;border-radius:var(--r-sm);font-size:var(--t-xs);font-weight:600;cursor:pointer;font-family:inherit;transition:background var(--dur-1),border-color var(--dur-1)}
  .bsh-eov-verse .va button:hover{border-color:var(--border-strong);background:var(--surface-2)}
  .bsh-eov-verse .va button.primary{background:var(--accent);color:#fff;border-color:transparent}
  .bsh-eov-verse .va button.primary:hover{background:var(--accent-hover)}

  .bsh-eov-see{color:var(--accent);cursor:pointer;font-weight:600;text-decoration:underline;padding:8px 4px;display:inline-block;font-size:var(--t-sm)}

  .bsh-eov-crumbs{margin-bottom:10px;font-size:var(--t-sm)}
  .bsh-eov-crumbs a{color:var(--accent);text-decoration:none;font-weight:600;cursor:pointer}
  .bsh-eov-crumbs a:hover{text-decoration:underline}
  .bsh-eov-crumbs .sep{color:var(--ink-3);margin:0 6px}

  /* Compare tab */
  .bsh-eov-compare{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
  .bsh-eov-compare .col{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:12px}
  .bsh-eov-compare .col h4{font-family:var(--font-serif);color:var(--accent);margin:0 0 6px;font-size:var(--t-md);font-weight:600;display:flex;justify-content:space-between;align-items:center}
  .bsh-eov-compare .col h4 button{background:transparent;border:1px solid var(--border);color:var(--ink-3);border-radius:var(--r-xs);padding:2px 7px;font-size:var(--t-xs);cursor:pointer}
  .bsh-eov-compare .col p{margin:0;font-family:var(--font-scripture);line-height:1.55;font-size:var(--t-md);color:var(--ink)}
  .bsh-eov-compare-empty{grid-column:1/-1;text-align:center;color:var(--ink-3);padding:28px;font-style:italic;background:var(--surface);border:1px dashed var(--border);border-radius:var(--r-md)}
  .bsh-eov-compare-add{display:flex;gap:8px;margin-bottom:10px}
  .bsh-eov-compare-add input{flex:1;padding:11px 14px;font-size:16px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface-2)}
  .bsh-eov-compare-add button{background:var(--accent);color:#fff;border:none;padding:11px 15px;border-radius:var(--r-md);font-weight:600;font-size:var(--t-sm);cursor:pointer;transition:background var(--dur-1)}
  .bsh-eov-compare-add button:hover{background:var(--accent-hover)}

  /* Cross-refs */
  .bsh-eov-xref-in{display:flex;gap:8px;margin-bottom:10px}
  .bsh-eov-xref-in input{flex:1;padding:11px 14px;font-size:16px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface-2)}
  .bsh-eov-xref-in button{background:var(--accent);color:#fff;border:none;padding:11px 15px;border-radius:var(--r-md);font-weight:600;font-size:var(--t-sm);cursor:pointer;transition:background var(--dur-1)}
  .bsh-eov-xref-in button:hover{background:var(--accent-hover)}

  /* Memorize */
  .bsh-eov-mem-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:22px 22px;text-align:center;margin-bottom:12px;box-shadow:var(--shadow-1)}
  .bsh-eov-mem-card .ref{font-family:var(--font-serif);color:var(--accent);font-weight:600;font-size:var(--t-lg);margin-bottom:10px}
  .bsh-eov-mem-card .txt{font-family:var(--font-scripture);font-size:var(--t-lg);line-height:1.7;color:var(--ink);min-height:80px;transition:filter var(--dur-3)}
  .bsh-eov-mem-card .txt.hidden{filter:blur(6px) opacity(.42)}
  .bsh-eov-mem-controls{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
  .bsh-eov-mem-controls button{background:var(--surface);border:1px solid var(--border);color:var(--ink);padding:9px 14px;border-radius:var(--r-md);font-size:var(--t-sm);font-weight:600;cursor:pointer;font-family:inherit;transition:background var(--dur-1)}
  .bsh-eov-mem-controls button:hover{background:var(--surface-2)}
  .bsh-eov-mem-controls button.primary{background:var(--accent);color:#fff;border-color:transparent}
  .bsh-eov-mem-controls button.primary:hover{background:var(--accent-hover)}
  .bsh-eov-mem-add{display:flex;gap:8px;margin-bottom:12px}
  .bsh-eov-mem-add input{flex:1;padding:11px 14px;font-size:16px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface-2)}
  .bsh-eov-mem-add button{background:var(--accent);color:#fff;border:none;padding:11px 15px;border-radius:var(--r-md);font-weight:600;font-size:var(--t-sm);cursor:pointer;transition:background var(--dur-1)}
  .bsh-eov-mem-add button:hover{background:var(--accent-hover)}
  .bsh-eov-mem-list{margin-top:14px}
  .bsh-eov-mem-item{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:9px 12px;display:flex;gap:10px;align-items:center;margin-bottom:6px}
  .bsh-eov-mem-item .ref{font-family:var(--font-serif);color:var(--accent);font-weight:600;font-size:var(--t-sm);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bsh-eov-mem-item button{background:transparent;border:1px solid var(--border);border-radius:var(--r-xs);padding:3px 7px;font-size:var(--t-xs);cursor:pointer;color:var(--ink-3)}

  /* Journal */
  .bsh-eov-jr-in{display:flex;flex-direction:column;gap:8px;margin-bottom:14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:14px}
  .bsh-eov-jr-in input,.bsh-eov-jr-in textarea{padding:11px 14px;font-size:16px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface-2);color:inherit;font-family:inherit;resize:vertical}
  .bsh-eov-jr-in textarea{min-height:70px;font-family:var(--font-scripture);line-height:1.55}
  .bsh-eov-jr-in .row{display:flex;gap:8px;flex-wrap:wrap}
  .bsh-eov-jr-in .row button{background:var(--accent);color:#fff;border:none;padding:10px 15px;border-radius:var(--r-md);font-weight:600;font-size:var(--t-sm);cursor:pointer;transition:background var(--dur-1)}
  .bsh-eov-jr-in .row button:hover{background:var(--accent-hover)}
  .bsh-eov-jr-in .row button.ghost{background:transparent;color:var(--ink);border:1px solid var(--border)}
  .bsh-eov-jr-in .row button.ghost:hover{background:var(--surface-2)}
  .bsh-eov-jr-note{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:12px 14px;margin-bottom:8px}
  .bsh-eov-jr-note h5{margin:0 0 4px;font-family:var(--font-serif);color:var(--accent);font-size:var(--t-md);font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:8px}
  .bsh-eov-jr-note .rf{font-size:var(--t-xs);color:var(--ink-3);font-family:var(--font-sans);font-weight:600}
  .bsh-eov-jr-note p{margin:6px 0 0;font-family:var(--font-scripture);line-height:1.55;color:var(--ink);font-size:var(--t-md);white-space:pre-wrap}
  .bsh-eov-jr-note .del{background:transparent;border:1px solid var(--border);color:var(--ink-3);border-radius:var(--r-xs);padding:3px 7px;font-size:var(--t-xs);cursor:pointer}

  /* Streak */
  .bsh-eov-streak{background:var(--accent-tint);border:1px solid var(--border);border-radius:var(--r-md);padding:16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
  .bsh-eov-streak .num{font-family:var(--font-serif);font-size:var(--t-3xl);font-weight:600;color:var(--accent);line-height:1}
  .bsh-eov-streak .lbl{font-size:var(--t-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--accent);font-weight:700;margin-top:4px}
  .bsh-eov-streak .g{flex:1}

  .bsh-eov-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:var(--ink);color:var(--surface);padding:10px 18px;border-radius:var(--r-md);font-size:var(--t-sm);font-weight:600;opacity:0;pointer-events:none;transition:.25s;z-index:10010;box-shadow:var(--shadow-2);font-family:var(--font-sans)}
  .bsh-eov-toast.on{opacity:1}
  `;
  document.head.appendChild(css);


  // ---------- DOM ----------
  var root = document.createElement('div');
  root.className = 'bsh-eov-root';
  root.innerHTML = '<div class="bsh-eov-overlay"></div>' +
    '<div class="bsh-eov-panel" role="dialog" aria-label="Explorer">' +
      '<div class="bsh-eov-head">' +
        '<div class="ttl">✧ Explorer<span class="sub" id="bsheovSub">Overlay — pull in verses without leaving this tool</span></div>' +
        '<button class="x" data-x>Close ✕</button>' +
        '<div class="tabs">' +
          '<button data-tab="search" class="active">Search / Topics</button>' +
          '<button data-tab="compare">⇄ Compare</button>' +
          '<button data-tab="xref">Cross-Refs</button>' +
          '<button data-tab="mem">Memorize</button>' +
          '<button data-tab="journal">Journal</button>' +
        '</div>' +
      '</div>' +
      '<div class="bsh-eov-body" id="bsheovBody"></div>' +
    '</div>';
  document.body.appendChild(root);

  var toast = document.createElement('div');
  toast.className = 'bsh-eov-toast';
  document.body.appendChild(toast);
  var toastTimer=null;
  function say(msg){ toast.textContent=msg; toast.classList.add('on'); clearTimeout(toastTimer); toastTimer=setTimeout(function(){toast.classList.remove('on');}, 1800); }

  var body = document.getElementById('bsheovBody');
  var subLabel = document.getElementById('bsheovSub');
  var currentTab = 'search';

  // ---------- FAB ----------
  var fab = document.createElement('button');
  fab.className = 'bsh-eov-fab';
  fab.setAttribute('aria-label', 'Open Explorer');
  fab.setAttribute('title', 'Explorer');
  fab.innerHTML = '<span class="bsh-eov-lbl">Explorer</span>✧';
  fab.addEventListener('click', toggle);
  document.body.appendChild(fab);

  // ---------- Open/close ----------
  function open(opts){
    opts=opts||{};
    root.classList.add('open');
    document.body.style.overflow = 'hidden';
    detectContext();
    if (opts.topic) { switchTab('search'); openTopic(opts.topic); }
    else if (opts.tab) switchTab(opts.tab);
    else switchTab(currentTab);
    logSession();
  }
  function close(){
    root.classList.remove('open');
    document.body.style.overflow = '';
  }
  function toggle(){ if (root.classList.contains('open')) close(); else open(); }
  root.querySelector('[data-x]').addEventListener('click', close);
  root.querySelector('.bsh-eov-overlay').addEventListener('click', close);
  document.addEventListener('keydown', function(e){ if (e.key==='Escape' && root.classList.contains('open')) close(); });

  // ---------- Context detection ----------
  var CTX = { tool: 'other', canSendBibleRef: false, canSendTray: false };
  function detectContext(){
    var p = location.pathname;
    if (/\/sermon\//.test(p)) CTX = { tool:'sermon', canSendBibleRef:false, canSendTray:true };
    else if (/\/atlas\//.test(p)) CTX = { tool:'atlas', canSendBibleRef:false, canSendTray:true };
    else if (/\/strongs\//.test(p)) CTX = { tool:'strongs', canSendBibleRef:false, canSendTray:true };
    else if (/\/wordstudy\//.test(p)) CTX = { tool:'wordstudy', canSendBibleRef:false, canSendTray:true };
    else if (/\/explorer\//.test(p)) CTX = { tool:'explorer', canSendBibleRef:false, canSendTray:true };
    else CTX = { tool:'bible', canSendBibleRef:true, canSendTray:true };
    subLabel.textContent = ({
      'bible':'On Study Bible — open verses in the reader without leaving the page',
      'sermon':'On Builder — send verses right into the Builder Tray',
      'atlas':'On Scripture Atlas — pull cross-references and topics',
      'strongs':"On Strong's — jump to any topic or verse",
      'wordstudy':'On Word Study — grab verses and drop them into the Builder',
      'explorer':'On Explorer — same tools available as an overlay',
      'other':'Pull in verses without leaving this tool'
    })[CTX.tool] || 'Pull in verses without leaving this tool';
  }

  // ---------- Tabs ----------
  root.querySelectorAll('.tabs button').forEach(function(b){
    b.addEventListener('click', function(){ switchTab(b.getAttribute('data-tab')); });
  });
  function switchTab(name){
    currentTab = name;
    root.querySelectorAll('.tabs button').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-tab')===name); });
    if (name==='search') renderSearchTab();
    else if (name==='compare') renderCompareTab();
    else if (name==='xref') renderXrefTab();
    else if (name==='mem') renderMemTab();
    else if (name==='journal') renderJournalTab();
  }

  // ---------- Data loaders (absolute, so it works from every tool) ----------
  function _okText(r,u){ if(!r.ok) throw new Error('HTTP '+r.status+' loading '+u); return r.text(); }
  function _okJson(r,u){ if(!r.ok) throw new Error('HTTP '+r.status+' loading '+u); return r.json(); }
  function loadTopics(){ if (TOPICS) return Promise.resolve(TOPICS); var u=SRC+'topics.js'; return fetch(u).then(r=>_okText(r,u)).then(t=>{ TOPICS=JSON.parse(t.replace(/^\s*const\s+TOPICS\s*=\s*/,'').replace(/;\s*$/,'')); return TOPICS; }).catch(function(e){ console.error('[BshExplorerOverlay] loadTopics:', e); throw e; }); }
  function loadMeta(){ if (VMETA) return Promise.resolve(VMETA); var u=SRC+'books.json'; return fetch(u).then(r=>_okJson(r,u)).then(j=>{ VMETA=j; return j; }).catch(function(e){ console.error('[BshExplorerOverlay] loadMeta:', e); throw e; }); }
  function loadIdx(){ if (TIDX) return Promise.resolve(TIDX); var u=SRC+'topics_index.js'; return fetch(u).then(r=>_okText(r,u)).then(t=>{ TIDX=JSON.parse(t.replace(/^\s*const\s+TOPIC_INDEX\s*=\s*/,'').replace(/;\s*$/,'')); return TIDX; }).catch(function(e){ console.error('[BshExplorerOverlay] loadIdx:', e); throw e; }); }
  function loadXrefs(){ if (XREFS) return Promise.resolve(XREFS); var u=SRC+'xrefs.js'; return fetch(u).then(r=>_okText(r,u)).then(t=>{ XREFS=JSON.parse(t.replace(/^\s*const\s+XREFS\s*=\s*/,'').replace(/;\s*$/,'')); return XREFS; }).catch(function(e){ console.warn('[BshExplorerOverlay] loadXrefs (optional):', e); XREFS={}; return XREFS; }); }
  function bookById(id){ if (!VMETA) return null; for (var i=0;i<VMETA.length;i++) if (VMETA[i].id===id) return VMETA[i]; return null; }
  // Full canonical name → id map — safe fallback when VMETA hasn't loaded yet.
  var CANON_NAMES = {
    'genesis':'GEN','exodus':'EXO','leviticus':'LEV','numbers':'NUM','deuteronomy':'DEU',
    'joshua':'JOS','judges':'JDG','ruth':'RUT','1samuel':'1SA','2samuel':'2SA',
    '1kings':'1KI','2kings':'2KI','1chronicles':'1CH','2chronicles':'2CH','ezra':'EZR',
    'nehemiah':'NEH','esther':'EST','job':'JOB','psalms':'PSA','psalm':'PSA','proverbs':'PRO',
    'ecclesiastes':'ECC','songofsolomon':'SNG','songofsongs':'SNG','song':'SNG','canticles':'SNG',
    'isaiah':'ISA','jeremiah':'JER','lamentations':'LAM','ezekiel':'EZE','daniel':'DAN',
    'hosea':'HOS','joel':'JOL','amos':'AMO','obadiah':'OBA','jonah':'JON','micah':'MIC',
    'nahum':'NAH','habakkuk':'HAB','zephaniah':'ZEP','haggai':'HAG','zechariah':'ZEC','malachi':'MAL',
    'matthew':'MAT','mark':'MRK','luke':'LUK','john':'JHN','acts':'ACT','actsoftheapostles':'ACT',
    'romans':'ROM','1corinthians':'1CO','2corinthians':'2CO','galatians':'GAL','ephesians':'EPH',
    'philippians':'PHP','colossians':'COL','1thessalonians':'1TH','2thessalonians':'2TH',
    '1timothy':'1TI','2timothy':'2TI','titus':'TIT','philemon':'PHM','hebrews':'HEB',
    'james':'JAS','1peter':'1PE','2peter':'2PE','1john':'1JN','2john':'2JN','3john':'3JN',
    'jude':'JUD','revelation':'REV','revelations':'REV','apocalypse':'REV'
  };
  // Common abbreviations (kept lowercase, no spaces or dots) → id
  var CANON_ABBR = {
    'gen':'GEN','ge':'GEN','gn':'GEN',
    'ex':'EXO','exo':'EXO','exod':'EXO',
    'lev':'LEV','lv':'LEV',
    'num':'NUM','nu':'NUM','nm':'NUM','nb':'NUM',
    'deut':'DEU','deu':'DEU','dt':'DEU',
    'josh':'JOS','jos':'JOS','jsh':'JOS',
    'judg':'JDG','jdg':'JDG','jg':'JDG','jdgs':'JDG',
    'rth':'RUT','ru':'RUT',
    '1sam':'1SA','1sa':'1SA','1s':'1SA','1sm':'1SA',
    '2sam':'2SA','2sa':'2SA','2s':'2SA','2sm':'2SA',
    '1kgs':'1KI','1ki':'1KI','1k':'1KI',
    '2kgs':'2KI','2ki':'2KI','2k':'2KI',
    '1chr':'1CH','1ch':'1CH','1chron':'1CH',
    '2chr':'2CH','2ch':'2CH','2chron':'2CH',
    'ezr':'EZR',
    'neh':'NEH','ne':'NEH',
    'esth':'EST','est':'EST','es':'EST',
    'jb':'JOB',
    'ps':'PSA','psa':'PSA','psm':'PSA','pss':'PSA',
    'prov':'PRO','pro':'PRO','prv':'PRO','pr':'PRO',
    'eccl':'ECC','ecc':'ECC','ec':'ECC','qoh':'ECC',
    'sos':'SNG','so':'SNG','sng':'SNG',
    'isa':'ISA','is':'ISA',
    'jer':'JER','je':'JER','jr':'JER',
    'lam':'LAM','la':'LAM',
    'ezek':'EZE','eze':'EZE','ezk':'EZE',
    'dan':'DAN','da':'DAN','dn':'DAN',
    'hos':'HOS','ho':'HOS',
    'jl':'JOL','joe':'JOL',
    'am':'AMO','amo':'AMO',
    'obad':'OBA','oba':'OBA','ob':'OBA',
    'jon':'JON','jnh':'JON',
    'mic':'MIC','mi':'MIC',
    'nah':'NAH','na':'NAH',
    'hab':'HAB',
    'zeph':'ZEP','zep':'ZEP','zp':'ZEP',
    'hag':'HAG','hg':'HAG',
    'zech':'ZEC','zec':'ZEC','zc':'ZEC',
    'mal':'MAL','ml':'MAL',
    'matt':'MAT','mat':'MAT','mt':'MAT',
    'mrk':'MRK','mk':'MRK','mar':'MRK','mr':'MRK',
    'luk':'LUK','lk':'LUK','lu':'LUK',
    'jhn':'JHN','jn':'JHN','joh':'JHN',
    'act':'ACT','ac':'ACT',
    'rom':'ROM','ro':'ROM','rm':'ROM',
    '1cor':'1CO','1co':'1CO',
    '2cor':'2CO','2co':'2CO',
    'gal':'GAL','ga':'GAL',
    'eph':'EPH','ephes':'EPH',
    'phil':'PHP','php':'PHP','phi':'PHP','pp':'PHP',
    'col':'COL','co':'COL',
    '1thes':'1TH','1th':'1TH','1thess':'1TH',
    '2thes':'2TH','2th':'2TH','2thess':'2TH',
    '1tim':'1TI','1ti':'1TI',
    '2tim':'2TI','2ti':'2TI',
    'tit':'TIT','ti':'TIT',
    'phlm':'PHM','philem':'PHM','phm':'PHM','pm':'PHM',
    'heb':'HEB','he':'HEB',
    'jas':'JAS','jm':'JAS',
    '1pet':'1PE','1pe':'1PE','1p':'1PE','1pt':'1PE',
    '2pet':'2PE','2pe':'2PE','2p':'2PE','2pt':'2PE',
    '1jn':'1JN','1jo':'1JN','1jhn':'1JN',
    '2jn':'2JN','2jo':'2JN','2jhn':'2JN',
    '3jn':'3JN','3jo':'3JN','3jhn':'3JN',
    'jud':'JUD','jd':'JUD',
    'rev':'REV','rv':'REV','re':'REV','apoc':'REV'
  };
  /* Legacy code -> USFM code translation.
     The topic/xref data files were built with old-style 3-letter codes
     ('EZE' for Ezekiel, 'NAH' for Nahum). books.json (which is the source
     of truth used by every other tool on the site: reader, Strong's,
     reading plans, Builder) uses standard USFM codes ('EZK', 'NAM').
     We normalize to USFM here at the boundary so every downstream call
     (bookById, verseText, refDisplay) uses the same id space. Without
     this, Ezekiel and Nahum verses looked up '(verse text unavailable)'
     because VDATA was keyed by 'EZK' but topic refs asked for 'EZE'. */
  var LEGACY_TO_USFM = { 'EZE':'EZK', 'NAH':'NAM' };
  function canonizeId(id){ return LEGACY_TO_USFM[id] || id; }

  function _bookByCanon(norm){
    var key = norm.replace(/\s+/g,'');
    if (CANON_NAMES[key]) return canonizeId(CANON_NAMES[key]);
    if (CANON_ABBR[key])  return canonizeId(CANON_ABBR[key]);
    return null;
  }
  function bookByName(nm){
    if (!nm) return null;
    var norm = String(nm).toLowerCase().replace(/\./g,'').replace(/\s+/g,' ').trim();
    // Try VMETA first if loaded
    if (VMETA){
      for (var i=0;i<VMETA.length;i++){
        var b = VMETA[i];
        if (b.name.toLowerCase() === norm) return b;
        if (b.abbr && b.abbr.toLowerCase() === norm) return b;
        if (b.name.toLowerCase().replace(/\s+/g,'') === norm.replace(/\s+/g,'')) return b;
      }
    }
    // Canonical/abbreviation fallback — works even when VMETA hasn't loaded yet
    var canonId = _bookByCanon(norm);
    if (canonId){
      // If VMETA is loaded, return the full record; otherwise return a minimal stand-in
      if (VMETA){ var rec = bookById(canonId); if (rec) return rec; }
      return { id: canonId, name: canonId, abbr: canonId, _synthetic: true };
    }
    return null;
  }
  function loadBookVerses(id){ if (VDATA[id]) return Promise.resolve(VDATA[id]); var b = bookById(id); if (!b) return Promise.resolve(null); return fetch(SRC+b.vfile).then(r=>r.json()).then(v=>{ VDATA[id]=v; return v; }); }
  function verseText(bookId,c,v){
    var rows = VDATA[bookId]; if (!rows) return '';
    for (var i=0;i<rows.length;i++) if (rows[i][0]===c && rows[i][1]===v){
      var toks=rows[i][2],s='';
      for (var k=0;k<toks.length;k++){ var t=toks[k]; if(k===0){s=t;continue;} if(/^[\.,;:!\?\)\]]/.test(t))s+=t; else s+=' '+t; }
      return s;
    }
    return '';
  }
  function parseTopicRef(r){
    var parts=r.split('|'); if(parts.length!==2) return null;
    var id=canonizeId(parts[0]), rest=parts[1];
    if (rest.indexOf(':')===-1){ var c=parseInt(rest,10); if(isNaN(c))return null; return {id:id,c:c,v:1,v2:null,whole:true}; }
    var cv=rest.split(':'); var c=parseInt(cv[0],10); if(isNaN(c))return null;
    var first=cv[1].split(',')[0]; var rng=first.split('-');
    var v=parseInt(rng[0],10); if(isNaN(v))return null;
    var v2=rng[1]?parseInt(rng[1],10):null;
    return {id:id,c:c,v:v,v2:(v2&&!isNaN(v2))?v2:null};
  }
  function refDisplay(pr){ var b=bookById(pr.id); var nm=b?b.name:pr.id; if(pr.whole)return nm+' '+pr.c; return nm+' '+pr.c+':'+pr.v+(pr.v2?'-'+pr.v2:''); }
  function refString(pr){ var b=bookById(pr.id); var nm=b?b.name:pr.id; return nm+' '+pr.c+':'+pr.v; }
  // Parse a natural reference like "John 3:16" or "1 Cor 13:4-7"
  function parseNaturalRef(s){
    if (!s) return null;
    var m = /^\s*(\d?\s?[A-Za-z\.]+(?:\s[A-Za-z\.]+)?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?\s*$/.exec(s.trim());
    if (!m) return null;
    var bookName = m[1].replace(/\./g,'').replace(/\s+/g,' ').trim();
    var b = bookByName(bookName); if (!b) return null;
    return { id:b.id, c:parseInt(m[2],10), v:m[3]?parseInt(m[3],10):1, v2:m[4]?parseInt(m[4],10):null, whole: !m[3] };
  }

  // ---------- Utility ----------
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function refUrl(refStr){
    // Always route to the Reader (which parses ?ref=/#ref=), never the
    // homepage — /read/ is an absolute path so it works from any page.
    return '/read/?ref=' + encodeURIComponent(refStr);
  }

  // ---------- Send-to actions ----------
  function sendToBible(refStr){
    if (CTX.tool === 'bible') {
      // Close the overlay first so the reader is visible immediately,
      // then set the hash so the deep-link handler runs.
      say('Opening ' + refStr + ' in the reader');
      close();
      var newHash = '#ref=' + encodeURIComponent(refStr);
      // If the hash is identical to what's already there, the browser will not
      // fire hashchange — clear it first so the handler always runs.
      if (location.hash === newHash) {
        history.replaceState(null, '', location.pathname + location.search);
      }
      // Prefer a small tick so any close animation begins before the reader
      // repaints, then trigger the deep-link update.
      setTimeout(function(){
        location.hash = newHash;
        // Fallback: if the page's own listener hasn't reacted (older builds,
        // or when the page was navigated into via bfcache), call the loader
        // directly if it's exposed.
        if (typeof window.loadFromHash === 'function'){
          try { window.loadFromHash(); } catch(_){}
        }
      }, 30);
    } else {
      // Navigate the current window to the Study Bible with the ref
      say('Opening ' + refStr + ' in Study Bible…');
      location.href = refUrl(refStr);
    }
  }
  function sendToBuilder(refStr){
    if (window.BuilderTray && window.BuilderTray.pushVerse) {
      window.BuilderTray.pushVerse(refStr, ({sermon:'Builder',bible:'Study Bible',atlas:'Atlas',strongs:"Strong's",wordstudy:'Word Study',explorer:'Explorer'})[CTX.tool] || 'Explorer');
    } else {
      say('Builder Tray not available on this page');
    }
  }
  function sendToNotebook(refStr){
    if (window.BibleNotebook && window.BibleNotebook.pushRef) {
      window.BibleNotebook.pushRef(refStr, 'Explorer');
      say('Sent ' + refStr + ' to Notebook');
    }
  }
  function copyToClipboard(txt){
    try { navigator.clipboard.writeText(txt); say('Copied to clipboard'); }
    catch(e){ var ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy'); say('Copied');}catch(_){} ta.remove(); }
  }

  // ---------- SEARCH / TOPIC VIEW ----------
  var CURVIEW = 'search'; // 'search' | 'topic'
  var CURTOPIC = null;
  var searchState = { q:'', cat:'all' };

  /* AI question-answering support (uses BshQA v2 tool-use). */
  var _lastMatches = [];
  var _lastParsed = null;
  var _askInFlight = false;
  // Multi-turn conversation state — SHARED with the full Explorer page and
  // cloud-synced per account so the same chat follows the user across
  // devices and every entry point (quick-jump overlay, /explorer/, etc.).
  var _convo = [];          // [{q:'...', a:'...'}] prior turns for display
  var _convoMessages = [];  // OpenAI-style messages sent to backend
  var CONVO_KEY = 'bshai_convo_v1';
  var _convoSync = null;

  function _readConvoRaw(key){
    try {
      var s = localStorage.getItem(key);
      if (!s) return null;
      var j = JSON.parse(s);
      if (!j) return null;
      if (Array.isArray(j.convo) && Array.isArray(j.messages)) return j;
      return null;
    } catch(_e){ return null; }
  }
  function loadConvoFromStorage(){
    var j = _readConvoRaw(CONVO_KEY);
    if (!j){
      // One-time migration from legacy keys. Adopt whichever is longer.
      var a = _readConvoRaw('bsheov_convo_v2');
      var b = _readConvoRaw('explorer_convo_v2');
      var pick = null;
      if (a && b) pick = (a.convo.length >= b.convo.length) ? a : b;
      else pick = a || b;
      if (pick){
        j = pick;
        try { localStorage.setItem(CONVO_KEY, JSON.stringify(j)); } catch(_e){}
      }
    }
    if (j){
      _convo = j.convo.slice(-6);
      _convoMessages = j.messages.slice(-24);
    }
  }
  function saveConvoToStorage(){
    try {
      localStorage.setItem(CONVO_KEY, JSON.stringify({
        convo: _convo.slice(-6),
        messages: _convoMessages.slice(-24),
        ts: Date.now()
      }));
    } catch(_e){}
    if (_convoSync) _convoSync.notifyLocalChange();
  }
  function clearConvo(){
    _convo = [];
    _convoMessages = [];
    try { localStorage.removeItem(CONVO_KEY); } catch(_e){}
    if (_convoSync) _convoSync.notifyLocalChange();
  }
  loadConvoFromStorage();

  // Cross-tab live sync: adopt writes from other tabs immediately.
  window.addEventListener('storage', function(e){
    if (e.key !== CONVO_KEY) return;
    loadConvoFromStorage();
    try { renderQaTop(_lastParsed); } catch(_e){}
    try { renderPriorConvoBanner(); } catch(_e){}
  });

  // Bind cloud sync so the chat follows the account across devices.
  if (window.CloudAccount && window.CloudAccount.bindSync){
    _convoSync = window.CloudAccount.bindSync('ask_ai_chat', {
      getLocal: function(){
        return { convo: _convo.slice(-6), messages: _convoMessages.slice(-24), ts: Date.now() };
      },
      setLocal: function(v){
        try {
          if (v && Array.isArray(v.convo) && Array.isArray(v.messages)){
            localStorage.setItem(CONVO_KEY, JSON.stringify(v));
          } else {
            localStorage.removeItem(CONVO_KEY);
          }
        } catch(_e){}
      },
      emptyValue: { convo: [], messages: [], ts: 0 },
      onRemoteUpdate: function(){
        loadConvoFromStorage();
        try { renderQaTop(_lastParsed); } catch(_e){}
        try { renderPriorConvoBanner(); } catch(_e){}
      }
    });
  }

  function renderQaTop(parsed){
    var qt = document.getElementById('eqqatop');
    if (!qt) return;
    var parts = [];
    parts.push('<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">');
    if (parsed && parsed.topic){
      parts.push('<span class="lbl">Topic</span>');
      parts.push('<span class="topicPill">'+esc(parsed.topic)+'</span>');
    } else {
      parts.push('<span class="lbl">Question</span>');
    }
    if (parsed && parsed.intent){
      var intents = ['where','what','how','who','why','when','list'].filter(function(k){ return parsed.intent[k]; });
      if (intents.length && !(intents.length===1 && intents[0]==='where')){
        intents.slice(0,2).forEach(function(k){ parts.push('<span class="intent">'+k+'</span>'); });
      }
    }
    if (_convo.length){
      parts.push('<span class="intent" title="Conversation length">'+_convo.length+' prior turn'+(_convo.length===1?'':'s')+'</span>');
    }
    parts.push('</div>');
    parts.push('<div style="display:flex;gap:6px;flex-wrap:wrap">');
    if (_convo.length){
      parts.push('<button class="askBtn" id="eqNewChat" type="button" style="background:transparent;color:var(--ink-2);border:1px solid var(--border)">New chat</button>');
    }
    parts.push('<button class="askBtn" id="eqAskBtn" type="button">Ask AI</button>');
    parts.push('</div>');
    qt.innerHTML = parts.join('');
    qt.style.display = 'flex';
    var btn = document.getElementById('eqAskBtn');
    if (btn) btn.addEventListener('click', function(){ runAskAI(searchState.q, false); });
    var nb = document.getElementById('eqNewChat');
    if (nb) nb.addEventListener('click', function(){ clearConvo(); renderQaTop(_lastParsed); var ans = document.getElementById('eqanswer'); if (ans) ans.innerHTML = ''; });
  }

  // Render the conversation view (prior turns + current answer skeleton + follow-up input)
  function renderConvoShell(){
    var ans = document.getElementById('eqanswer');
    if (!ans) return;
    var priorHtml = '';
    if (_convo.length){
      priorHtml = '<div class="bsh-eov-answer" style="border-left-color:var(--border);border-color:var(--border);box-shadow:none">' +
        '<div class="hd"><span class="ti" style="color:var(--ink-2);font-size:var(--t-sm)">Earlier in this conversation</span></div>' +
        _convo.map(function(t){
          return '<div class="bsh-eov-turn"><div class="qLine">'+esc(t.q)+'</div><div class="aLine">'+esc(t.a)+'</div></div>';
        }).join('') +
      '</div>';
    }
    ans.innerHTML = priorHtml +
      '<div class="bsh-eov-answer" id="eqCurAnswer">' +
        '<div class="hd"><span class="ti">Answer</span><span class="mm" id="eqAmm">Thinking…</span></div>' +
        '<div class="bsh-eov-tools" id="eqTools"></div>' +
        '<div class="bd streaming" id="eqAbody"></div>' +
        '<div class="fd">Grounded in KJV. Apostolic Pentecostal / Oneness framing. Verify against Scripture.</div>' +
        '<div class="bsh-eov-followup" id="eqFollow" style="display:none">' +
          '<input id="eqFollowInput" type="text" placeholder="Ask a follow-up question" autocomplete="off"/>' +
          '<button id="eqFollowSend" type="button">Send</button>' +
        '</div>' +
      '</div>';
  }

  function addToolBadge(name, args){
    var host = document.getElementById('eqTools');
    if (!host) return null;
    var badge = document.createElement('span');
    badge.className = 'toolBadge running';
    var label = name;
    var argStr = '';
    if (args){
      if (args.query) argStr = ' “' + String(args.query).slice(0,40) + '”';
      else if (args.reference) argStr = ' ' + args.reference;
      else if (args.word) argStr = ' ' + args.word;
    }
    var friendly = { search_kjv: 'Searching KJV', get_passage: 'Fetching', get_xrefs: 'Cross-refs for', get_strongs: "Strong's" };
    badge.innerHTML = '<span class="dot"></span>' + esc((friendly[label]||label) + argStr);
    host.appendChild(badge);
    return badge;
  }

  function runAskAI(question, isFollowup){
    if (_askInFlight) return;
    var ans = document.getElementById('eqanswer');
    if (!ans) return;
    var q = String(question || '').trim();
    if (!q){ ans.innerHTML=''; return; }
    if (!window.BshQA || !window.BshQA.chat){ ans.innerHTML = '<div class="bsh-eov-answer"><div class="err">AI module not loaded.</div></div>'; return; }

    _askInFlight = true;

    // If this is a follow-up, push earlier answer into _convo for display before rendering.
    if (isFollowup){
      // Prior current-answer body is already stored in _convo (added when previous turn finished).
    }

    renderConvoShell();

    var body = document.getElementById('eqAbody');
    var mm = document.getElementById('eqAmm');
    var toolsEl = document.getElementById('eqTools');
    var followEl = document.getElementById('eqFollow');
    var badges = {};

    // Build the message payload.
    var newUserMsg = { role: 'user', content: q };
    var messages;
    if (_convoMessages.length && isFollowup){
      messages = _convoMessages.slice().concat([newUserMsg]);
    } else if (_convoMessages.length && !isFollowup){
      // Fresh top-line question — start a new conversation but preserve any accidentally-non-cleared state.
      messages = [newUserMsg];
      _convo = [];
      _convoMessages = [];
    } else {
      messages = [newUserMsg];
    }

    var received = '';
    BshQA.chat(messages, {
      timeoutMs: 90000,
      onDelta: function(chunk){
        received += chunk;
        if (body) body.textContent = received;
      },
      onTool: function(name, args, result){
        // A tool call means the streamed text so far was a preamble — clear it and
        // reserve the answer body for the model's grounded response after tools return.
        if (!result){
          received = '';
          if (body) body.textContent = '';
        }
        var key = name + '|' + JSON.stringify(args||{});
        if (!badges[key]){
          badges[key] = addToolBadge(name, args);
        }
        if (result && badges[key]){
          badges[key].classList.remove('running');
          badges[key].classList.add('done');
        }
      }
    }).then(function(res){
      _askInFlight = false;
      if (body) body.classList.remove('streaming');
      if (mm) mm.textContent = res && res.model ? res.model : 'ready';
      var finalText = received || (res && res.text) || '';
      if (body && !received && finalText) body.textContent = finalText;

      // Save turn into conversation history
      _convo.push({ q: q, a: finalText });
      _convoMessages.push(newUserMsg);
      _convoMessages.push({ role: 'assistant', content: finalText });
      // Prune to last 6 turns to keep tokens sensible
      if (_convo.length > 6){
        var drop = _convo.length - 6;
        _convo = _convo.slice(drop);
        _convoMessages = _convoMessages.slice(drop * 2);
      }
      saveConvoToStorage();

      // Wire up the follow-up input
      if (followEl) followEl.style.display = 'flex';
      var fi = document.getElementById('eqFollowInput');
      var fs = document.getElementById('eqFollowSend');
      function submitFollow(){
        var v = fi && fi.value.trim();
        if (!v || _askInFlight) return;
        fi.value = '';
        runAskAI(v, true);
      }
      if (fs) fs.addEventListener('click', submitFollow);
      if (fi) fi.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); submitFollow(); } });
      if (fi) setTimeout(function(){ try { fi.focus(); } catch(_e){} }, 60);

      // Refresh top bar so it shows updated turn count
      renderQaTop(_lastParsed);
    }).catch(function(err){
      _askInFlight = false;
      if (body) body.classList.remove('streaming');
      var msg = String(err && err.message || err || 'Something went wrong.');
      if (/429|too many/i.test(msg)){
        if (body) body.innerHTML = '<span class="err">Too many questions in a short time. Please wait a minute and try again.</span>';
      } else if (/timed out|network|failed to fetch|aborted/i.test(msg)){
        if (body) body.innerHTML = '<span class="err">The AI helper could not reach the server. Check your network and try again.</span>';
      } else {
        if (body) body.innerHTML = '<span class="err">'+esc(msg)+'</span>';
      }
      // Still show follow-up so they can retry with a different phrasing
      if (followEl) followEl.style.display = 'flex';
      var fi2 = document.getElementById('eqFollowInput');
      var fs2 = document.getElementById('eqFollowSend');
      function submitFollow2(){ var v = fi2 && fi2.value.trim(); if (!v || _askInFlight) return; fi2.value=''; runAskAI(v, true); }
      if (fs2) fs2.addEventListener('click', submitFollow2);
      if (fi2) fi2.addEventListener('keydown', function(e){ if (e.key==='Enter'){ e.preventDefault(); submitFollow2(); } });
    });
  }

  function renderSearchTab(){
    if (CURVIEW === 'topic' && CURTOPIC){
      renderTopicView(CURTOPIC);
      return;
    }
    body.innerHTML =
      '<div class="bsh-eov-search">' +
        '<input id="eqbox" type="text" placeholder="Ask a question or search a topic" value="'+esc(searchState.q)+'"/>' +
        '<select id="eqcat">' +
          ['all','doctrine','virtues','sins','people','places','events','worship','prophetic','other'].map(function(c){ return '<option value="'+c+'"'+(c===searchState.cat?' selected':'')+'>'+c[0].toUpperCase()+c.slice(1)+'</option>'; }).join('') +
        '</select>' +
      '</div>' +
      '<div class="bsh-eov-chips">' +
        ['God','forgiving enemies','faith and love','anger','holy spirit baptism','grace and works','fear not','second coming'].map(function(q){ return '<button data-q="'+esc(q)+'">'+esc(q)+'</button>'; }).join('') +
      '</div>' +
      '<div id="eqqatop" class="bsh-eov-qatop" style="display:none"></div>' +
      '<div id="eqPriorConvo"></div>' +
      '<div id="eqanswer"></div>' +
      '<div id="eqstatus" class="bsh-eov-status" style="display:none"></div>' +
      '<div id="eqresults"></div>' +
      '<div style="margin-top:16px;font-size:var(--t-sm);color:var(--ink-3);text-align:center">Tip: tap a topic to open sub-topics and verses right here. Ask a real question ("where is speaking in tongues in the Bible") for a smart topical match.</div>';
    renderPriorConvoBanner();
    var i = document.getElementById('eqbox');
    var c = document.getElementById('eqcat');
    var deb;
    function run(){
      searchState.q = i.value.trim(); searchState.cat = c.value;
      if (!searchState.q){
        document.getElementById('eqresults').innerHTML='';
        document.getElementById('eqstatus').style.display='none';
        var qt = document.getElementById('eqqatop'); if (qt){ qt.style.display='none'; qt.innerHTML=''; }
        var an = document.getElementById('eqanswer'); if (an) an.innerHTML='';
        return;
      }
      if (!window.BshTopicExplorer){ document.getElementById('eqresults').innerHTML='<div class="bsh-eov-empty">Loading topic index…</div>'; setTimeout(run, 200); return; }
      // Parse the raw question first (if BshQA is available) and use the expanded query for topic search.
      var parsed = (window.BshQA && window.BshQA.parse) ? window.BshQA.parse(searchState.q) : null;
      var effectiveQuery = (parsed && parsed.expandedQuery) ? parsed.expandedQuery : searchState.q;
      renderQaTop(parsed);
      BshTopicExplorer.search(effectiveQuery, {category:searchState.cat, limit:40}).then(function(res){
        // If the expanded (canonical topic) query returned nothing, fall back to the raw user text.
        if (!res.matches.length && effectiveQuery !== searchState.q){
          return BshTopicExplorer.search(searchState.q, {category:searchState.cat, limit:40}).then(function(res2){ renderMatches(res2); return res2; });
        }
        renderMatches(res);
        return res;
      }).then(function(finalRes){ _lastMatches = (finalRes && finalRes.matches) || []; _lastParsed = parsed; });
    }
    i.addEventListener('input', function(){ clearTimeout(deb); deb=setTimeout(run, 180); });
    i.addEventListener('keydown', function(e){ if (e.key==='Enter'){ e.preventDefault(); run(); } });
    c.addEventListener('change', run);
    body.querySelectorAll('.bsh-eov-chips button').forEach(function(b){ b.addEventListener('click', function(){ i.value=b.getAttribute('data-q'); run(); i.focus(); }); });
    if (searchState.q) run();
  }

  // Show a compact “Continue conversation” banner at the top of the Search tab
  // whenever there is a shared Ask AI history, so the user can see and resume it.
  function renderPriorConvoBanner(){
    var host = document.getElementById('eqPriorConvo');
    if (!host) return;
    if (!_convo.length){ host.innerHTML = ''; return; }
    var last = _convo[_convo.length - 1];
    host.innerHTML =
      '<div class="bsh-eov-prior">' +
        '<div class="bsh-eov-prior-hd">' +
          '<span class="bsh-eov-prior-ti">Continue conversation \u00b7 ' + _convo.length + ' turn' + (_convo.length===1?'':'s') + '</span>' +
          '<span class="bsh-eov-prior-actions">' +
            '<button type="button" id="eqPriorResume" class="bsh-eov-prior-btn primary">Resume</button>' +
            '<button type="button" id="eqPriorClear" class="bsh-eov-prior-btn">New chat</button>' +
          '</span>' +
        '</div>' +
        '<div class="bsh-eov-prior-last">Last: ' + esc(last.q) + '</div>' +
      '</div>';
    var rb = document.getElementById('eqPriorResume');
    if (rb) rb.addEventListener('click', function(){
      // Render the transcript inline so the user sees the full prior chat and
      // can send a follow-up. Uses the existing convo-shell view.
      renderConvoShell();
      var followEl = document.getElementById('eqFollow');
      if (followEl){
        followEl.style.display = 'flex';
        var f = document.getElementById('eqFollowInput'); if (f) setTimeout(function(){ f.focus(); }, 30);
        var mm = document.getElementById('eqAmm'); if (mm) mm.textContent = 'Ready';
        var body = document.getElementById('eqAbody'); if (body){ body.classList.remove('streaming'); body.innerHTML = '<div style="color:var(--ink-3);font-size:var(--t-sm)">Ask a follow-up below.</div>'; }
        var send = document.getElementById('eqFollowSend');
        if (send && !send._wired){
          send._wired = true;
          function submit(){
            var v = (document.getElementById('eqFollowInput')||{}).value || '';
            v = v.trim(); if (!v) return;
            document.getElementById('eqFollowInput').value = '';
            runAskAI(v, true);
          }
          send.addEventListener('click', submit);
          document.getElementById('eqFollowInput').addEventListener('keydown', function(e){
            if (e.key === 'Enter'){ e.preventDefault(); submit(); }
          });
        }
      }
      var host2 = document.getElementById('eqPriorConvo'); if (host2) host2.innerHTML = '';
    });
    var cb = document.getElementById('eqPriorClear');
    if (cb) cb.addEventListener('click', function(){
      clearConvo();
      renderPriorConvoBanner();
      var an = document.getElementById('eqanswer'); if (an) an.innerHTML = '';
    });
  }
  function renderMatches(res){
    var el = document.getElementById('eqresults');
    var st = document.getElementById('eqstatus');
    if (!res.matches.length){ el.innerHTML='<div class="bsh-eov-empty">No matching topics. Try broader terms or OR / -word.</div>'; st.style.display='none'; return; }
    st.style.display='block';
    st.innerHTML = '<b>'+res.matches.length+'</b> topic'+(res.matches.length===1?'':'s')+' matched — tap any to see verses';
    el.innerHTML = res.matches.map(function(m){
      return '<div class="bsh-eov-match" data-n="'+esc(m.name)+'"><div class="n">'+esc(m.name)+'</div><div class="m"><span class="cat">'+esc(m.category)+'</span> '+m.refs.toLocaleString()+' references · '+m.entries+' sub-topics</div></div>';
    }).join('');
    el.querySelectorAll('.bsh-eov-match').forEach(function(mel){ mel.addEventListener('click', function(){ openTopic(mel.getAttribute('data-n')); }); });
  }
  function openTopic(name){
    Promise.all([loadTopics(), loadMeta()]).then(function(){
      var t = TOPICS.find(function(x){return x.n===name;});
      if (!t) t = TOPICS.find(function(x){return x.n.toLowerCase()===String(name||'').toLowerCase();});
      if (!t){
        if (window.BshTopicExplorer){
          return BshTopicExplorer.search(name,{limit:1}).then(function(r){
            if (r.matches.length) openTopic(r.matches[0].name);
            else say('Topic not found');
          });
        }
        say('Topic not found'); return;
      }
      CURVIEW='topic'; CURTOPIC=t.n;
      renderTopicView(t);
    });
  }
  function renderTopicView(topic){
    var t = (typeof topic === 'string') ? TOPICS.find(function(x){return x.n===topic;}) : topic;
    if (!t){ renderSearchTab(); return; }
    var cat = (window.BshTopicExplorer && BshTopicExplorer.categoryOf) ? BshTopicExplorer.categoryOf(t.n) : 'other';
    var totalRefs = 0; t.e.forEach(function(s){ totalRefs += (s.r||[]).length; });
    body.innerHTML =
      '<div class="bsh-eov-crumbs"><a id="eovBack">← Back to search</a><span class="sep">›</span><span>'+esc(t.n)+'</span></div>' +
      '<div class="bsh-eov-thead">' +
        '<h1>'+esc(t.n)+'</h1>' +
        '<div class="tm"><span class="pill">'+esc(cat)+'</span><span>'+totalRefs.toLocaleString()+' references</span><span>'+t.e.length+' sub-topics</span></div>' +
        '<div class="act">' +
          '<button data-open-full>Open in full Explorer</button>' +
          '<button data-copy-topic>⧉ Copy all refs</button>' +
        '</div>' +
      '</div>' +
      '<div id="eovSub"><div class="bsh-eov-empty">Loading verses…</div></div>';
    body.querySelector('#eovBack').addEventListener('click', function(){ CURVIEW='search'; CURTOPIC=null; renderSearchTab(); });
    body.querySelector('[data-open-full]').addEventListener('click', function(){ window.open('/explorer/?topic=' + encodeURIComponent(t.n), '_blank', 'noopener'); });
    body.querySelector('[data-copy-topic]').addEventListener('click', function(){
      var refs = []; t.e.forEach(function(sub){ (sub.r||[]).forEach(function(r){ var pr=parseTopicRef(r); if(pr) refs.push(refString(pr)); }); });
      copyToClipboard(refs.join('; '));
    });
    // Preload verse files
    var bookIds = {};
    t.e.forEach(function(sub){ (sub.r||[]).forEach(function(r){ var pr=parseTopicRef(r); if(pr) bookIds[pr.id]=1; }); });
    Promise.all(Object.keys(bookIds).map(loadBookVerses)).then(function(){
      var html = '';
      t.e.forEach(function(sub, si){
        html += '<div class="bsh-eov-sub">' +
          '<div class="sh"><div>'+esc(sub.t || ('Sub-topic '+(si+1)))+'</div>' +
          (sub.r && sub.r.length ? '<div class="c">'+sub.r.length+' ref'+(sub.r.length===1?'':'s')+'</div>' : '') +
          '</div><div class="sb">';
        if (sub.x) html += '<div class="bsh-eov-see" data-see="'+esc(sub.x)+'">See also: '+esc(sub.x)+' →</div>';
        if (sub.r && sub.r.length){
          sub.r.forEach(function(r){
            var pr = parseTopicRef(r); if (!pr) return;
            var disp = refDisplay(pr), rs = refString(pr);
            var txt = verseText(pr.id, pr.c, pr.v);
            if (pr.v2 && pr.v2>pr.v){
              var ex=[]; for (var v=pr.v+1; v<=Math.min(pr.v2, pr.v+2); v++){ var t2=verseText(pr.id,pr.c,v); if(t2)ex.push(t2); }
              if (ex.length) txt += ' ' + ex.join(' ') + (pr.v2>pr.v+2?'…':'');
            }
            if (!txt) txt = '(verse text unavailable)';
            html += '<div class="bsh-eov-verse" data-ref="'+esc(rs)+'" data-txt="'+esc(txt)+'">' +
              '<div class="vh"><a class="vr" href="'+refUrl(rs)+'">'+esc(disp)+'</a></div>' +
              '<div class="vt">'+esc(txt)+'</div>' +
              '<div class="va">' +
                (CTX.canSendBibleRef ? '<button class="primary" data-a="bible">⌂ Open in reader</button>' : '<button data-a="bible">⌂ Open Study Bible</button>') +
                (CTX.canSendTray ? '<button class="'+(CTX.tool==='sermon'?'primary':'')+'" data-a="tray">▼ To Builder Tray</button>' : '') +
                '<button data-a="notebook">＋ Notebook</button>' +
                '<button data-a="copy">⧉ Copy</button>' +
                '<button data-a="compare">⇄ Compare</button>' +
                '<button data-a="memorize">◎ Memorize</button>' +
              '</div>' +
              '</div>';
          });
        } else if (!sub.x) html += '<div class="bsh-eov-empty" style="padding:12px">No verses in this sub-topic.</div>';
        html += '</div></div>';
      });
      document.getElementById('eovSub').innerHTML = html;
      // Wire up
      body.querySelectorAll('.bsh-eov-see').forEach(function(e){ e.addEventListener('click', function(){ openTopic(e.getAttribute('data-see')); }); });
      body.querySelectorAll('.bsh-eov-verse').forEach(function(el){
        var rf = el.getAttribute('data-ref');
        var tx = el.getAttribute('data-txt');
        el.querySelectorAll('.va button').forEach(function(btn){
          btn.addEventListener('click', function(e){ e.stopPropagation();
            var a = btn.getAttribute('data-a');
            if (a==='bible') sendToBible(rf);
            else if (a==='tray') sendToBuilder(rf);
            else if (a==='notebook') sendToNotebook(rf);
            else if (a==='copy') copyToClipboard(rf + ' — ' + tx + ' (KJV)');
            else if (a==='compare') { addToCompare(rf); say('Added ' + rf + ' to Compare'); }
            else if (a==='memorize') { addToMemorize(rf); say('Added ' + rf + ' to Memorize'); }
          });
        });
      });
    });
  }

  // ---------- COMPARE ----------
  var COMPARE_KEY = 'bsh_eov_compare_v1';
  function loadCompare(){ try { return JSON.parse((window.safeLS||localStorage).getItem(COMPARE_KEY)||'[]')||[]; } catch(e){ return []; } }
  function saveCompare(arr){ try { (window.safeLS||localStorage).setItem(COMPARE_KEY, JSON.stringify(arr.slice(0,4))); } catch(e){} }
  function addToCompare(refStr){
    var arr = loadCompare();
    if (arr.some(function(x){return x.ref===refStr;})) return Promise.resolve(false);
    var pr = parseNaturalRef(refStr); if (!pr) return Promise.resolve(false);
    if (arr.length >= 4) return Promise.resolve(false);
    // Optimistic add — verse text populates async
    arr.push({ ref:refStr, txt:'(loading…)' });
    saveCompare(arr);
    if (currentTab==='compare' && typeof window.__eovCmpRender==='function') window.__eovCmpRender();
    return loadMeta().then(function(){ return loadBookVerses(pr.id); }).then(function(){
      var txt = verseText(pr.id, pr.c, pr.v) || '';
      if (pr.v2 && pr.v2>pr.v){ for (var v=pr.v+1; v<=pr.v2; v++){ var t=verseText(pr.id,pr.c,v); if(t) txt += ' ' + t; } }
      var cur = loadCompare();
      for (var i=0;i<cur.length;i++){ if (cur[i].ref===refStr){ cur[i].txt = txt; break; } }
      saveCompare(cur);
      if (currentTab==='compare' && typeof window.__eovCmpRender==='function') window.__eovCmpRender();
      return true;
    });
  }
  function renderCompareTab(){
    var arr = loadCompare();
    body.innerHTML =
      '<div class="bsh-eov-compare-add">' +
        '<input id="eovCmpIn" placeholder="Add a verse, e.g. John 3:16 or 1 Cor 13:4-7"/>' +
        '<button id="eovCmpAdd">Add</button>' +
      '</div>' +
      '<div class="bsh-eov-status">Compare up to 4 verses side by side. Tap ⇄ Compare on any verse in a topic to add it.</div>' +
      '<div class="bsh-eov-compare" id="eovCmpGrid"></div>';
    var grid = document.getElementById('eovCmpGrid');
    function render(){
      var a = loadCompare();
      if (!a.length){ grid.innerHTML='<div class="bsh-eov-compare-empty">No verses to compare yet. Add one above or hit ⇄ Compare on a verse.</div>'; return; }
      grid.innerHTML = a.map(function(x,i){
        return '<div class="col"><h4><span>'+esc(x.ref)+'</span><button data-r="'+i+'">✕</button></h4><p>'+esc(x.txt || '(loading)')+'</p><div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button class="mini" data-a="bible" data-i="'+i+'" style="background:transparent;border:1px solid var(--border);border-radius:var(--r-sm);padding:4px 8px;font-size:var(--t-xs);cursor:pointer;color:var(--accent)">⌂ Open</button>'+(CTX.canSendTray?'<button data-a="tray" data-i="'+i+'" style="background:transparent;border:1px solid var(--border);border-radius:var(--r-sm);padding:4px 8px;font-size:var(--t-xs);cursor:pointer;color:var(--accent)">▼ To Builder</button>':'')+'</div></div>';
      }).join('');
      grid.querySelectorAll('[data-r]').forEach(function(b){ b.addEventListener('click', function(){ var i=+b.getAttribute('data-r'); var c=loadCompare(); c.splice(i,1); saveCompare(c); render(); }); });
      grid.querySelectorAll('[data-a]').forEach(function(b){ b.addEventListener('click', function(){ var c=loadCompare(); var i=+b.getAttribute('data-i'); var a=b.getAttribute('data-a'); if(a==='bible') sendToBible(c[i].ref); else sendToBuilder(c[i].ref); }); });
    }
    window.__eovCmpRender = render;
    render();
    document.getElementById('eovCmpAdd').addEventListener('click', function(){
      var inp = document.getElementById('eovCmpIn');
      var s = inp.value.trim(); if(!s) return;
      inp.value='';
      addToCompare(s);
    });
    document.getElementById('eovCmpIn').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); document.getElementById('eovCmpAdd').click(); } });
  }

  // ---------- CROSS-REFS ----------
  function renderXrefTab(){
    body.innerHTML =
      '<div class="bsh-eov-xref-in">' +
        '<input id="eovXrIn" placeholder="Enter a reference, e.g. John 3:16"/>' +
        '<button id="eovXrGo">Find</button>' +
      '</div>' +
      '<div class="bsh-eov-status">Discovers verses that appear in the same topical concordance entry as your verse — a hand-built cross-reference chain from the topics library.</div>' +
      '<div id="eovXrOut"></div>';
    document.getElementById('eovXrGo').addEventListener('click', runXref);
    document.getElementById('eovXrIn').addEventListener('keydown', function(e){ if(e.key==='Enter') runXref(); });
  }
  function runXref(){
    var v = document.getElementById('eovXrIn').value.trim(); if(!v) return;
    var out = document.getElementById('eovXrOut');
    out.innerHTML = '<div class="bsh-eov-empty">Loading…</div>';
    Promise.all([loadTopics(), loadMeta(), loadXrefs()]).then(function(){
      var pr = parseNaturalRef(v);
      if (!pr){ out.innerHTML = '<div class="bsh-eov-empty">Could not parse that reference. Try "John 3:16" or "Rom 8:28".</div>'; return; }
      out.innerHTML = '<div class="bsh-eov-empty">Searching topics…</div>';
      _runXrefAfterLoad(pr);
    }).catch(function(e){ console.error('[BshExplorerOverlay] runXref:', e); out.innerHTML = '<div class="bsh-eov-empty">Could not load topic data. Check your connection and try again.</div>'; });
  }
  function _runXrefAfterLoad(pr){
    var out = document.getElementById('eovXrOut');
    Promise.resolve().then(function(){
      // Find topics whose refs contain this book+chapter+verse
      var neigh = {}; // ref -> count
      var topicsHit = [];
      TOPICS.forEach(function(t){
        t.e.forEach(function(sub){
          if (!sub.r) return;
          var hasMatch = false; var subRefs = [];
          sub.r.forEach(function(r){
            var p = parseTopicRef(r); if (!p) return;
            subRefs.push({r:r,p:p});
            if (p.id === pr.id && p.c === pr.c && p.v === pr.v) hasMatch = true;
            else if (p.id === pr.id && p.c === pr.c && p.v2 && p.v>=pr.v && p.v2<=pr.v+5) hasMatch = true;
          });
          if (hasMatch){
            topicsHit.push({name:t.n, sub:sub.t});
            subRefs.forEach(function(x){
              if (x.p.id === pr.id && x.p.c === pr.c && x.p.v === pr.v) return; // skip self
              var key = refString(x.p);
              neigh[key] = (neigh[key]||0) + 1;
            });
          }
        });
      });
      var neighList = Object.keys(neigh).map(function(k){ return {ref:k, count:neigh[k]}; }).sort(function(a,b){ return b.count-a.count; });

      // Also pull curated verse-to-verse cross-references from the Treasury of Scripture
      // Knowledge (loaded as window.XREFS). Key format matches parseTopicRef output:
      //   "BBB|C:V" (e.g. "JHN|3:16"). These are prepended so authoritative,
      //   verse-level xrefs lead, followed by topical-graph neighbors.
      var curated = [];
      if (XREFS){
        var selfKey = pr.id + '|' + pr.c + ':' + pr.v;
        var arr = XREFS[selfKey] || null;
        if (arr && arr.length){
          // Convert BBB|C:V to display refString via parseTopicRef → refString
          var seenCurated = {};
          arr.forEach(function(k){
            var p = parseTopicRef(k); if (!p) return;
            var display = refString(p);
            if (seenCurated[display]) return;
            seenCurated[display] = 1;
            // Skip self
            if (p.id === pr.id && p.c === pr.c && p.v === pr.v) return;
            curated.push({ref: display, count: 999}); // marker count for TSK-sourced
          });
        }
      }
      // Merge: curated first (deduped against topical neighbors), then topical
      var seenMerged = {};
      curated.forEach(function(x){ seenMerged[x.ref] = 1; });
      var merged = curated.slice();
      neighList.forEach(function(x){
        if (seenMerged[x.ref]) return;
        seenMerged[x.ref] = 1;
        merged.push(x);
      });
      // Load verse text for top 25
      var top = merged.slice(0, 25);
      var bookIds = {};
      top.forEach(function(x){ var p=parseNaturalRef(x.ref); if(p) bookIds[p.id]=1; });
      Promise.all(Object.keys(bookIds).map(loadBookVerses)).then(function(){
        var self = refString(pr);
        var selfP = pr;
        // Also load self text
        return loadBookVerses(pr.id).then(function(){
          var selfTxt = verseText(pr.id, pr.c, pr.v);
          if (!top.length){ out.innerHTML = '<div class="bsh-eov-thead"><h1>'+esc(self)+'</h1><div class="tm"><span>No cross-references found for this verse.</span></div></div><div class="bsh-eov-empty">Try a nearby verse or open it in the Study Bible for the classic cross-reference view.</div>'; return; }
          var html = '<div class="bsh-eov-thead"><h1>'+esc(self)+'</h1><div class="tm"><span class="pill">Cross-refs</span><span>'+top.length+' related verses</span><span>from '+topicsHit.length+' topical sub-entries</span></div><div class="act"><button data-copy-all>⧉ Copy all refs</button></div></div>' +
            '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:12px 14px;margin-bottom:12px"><b style="font-family:var(--font-serif);color:var(--accent)">'+esc(self)+':</b> <span style="font-family:var(--font-scripture)">'+esc(selfTxt||'(verse unavailable)')+'</span></div>';
          html += '<div class="bsh-eov-sub"><div class="sh"><div>Related verses</div><div class="c">'+top.length+' refs</div></div><div class="sb">';
          top.forEach(function(x){
            var p = parseNaturalRef(x.ref); if (!p) return;
            var txt = verseText(p.id, p.c, p.v) || '(unavailable)';
            var badgeTxt = (x.count === 999)
              ? 'curated cross-reference'
              : 'shares '+x.count+' topic'+(x.count===1?'':'s');
            html += '<div class="bsh-eov-verse" data-ref="'+esc(x.ref)+'" data-txt="'+esc(txt)+'">' +
              '<div class="vh"><a class="vr" href="'+refUrl(x.ref)+'">'+esc(x.ref)+'</a><span style="font-size:var(--t-xs);color:var(--ink-3)">'+badgeTxt+'</span></div>' +
              '<div class="vt">'+esc(txt)+'</div>' +
              '<div class="va">' +
                (CTX.canSendBibleRef ? '<button class="primary" data-a="bible">⌂ Open</button>' : '<button data-a="bible">⌂ Open Bible</button>') +
                (CTX.canSendTray ? '<button data-a="tray">▼ To Builder</button>' : '') +
                '<button data-a="notebook">＋ Notebook</button>' +
                '<button data-a="copy">⧉ Copy</button>' +
              '</div></div>';
          });
          html += '</div></div>';
          // Topics that connect them
          if (topicsHit.length){
            html += '<div class="bsh-eov-sub" style="margin-top:10px"><div class="sh"><div>Related topics</div><div class="c">'+topicsHit.length+'</div></div><div class="sb" style="padding:10px 10px">' +
              topicsHit.slice(0,20).map(function(x){ return '<span class="bsh-eov-match" style="display:inline-block;margin:3px;padding:5px 10px;border-radius:20px;cursor:pointer;font-size:.78rem" data-t="'+esc(x.name)+'"><b>'+esc(x.name)+'</b>'+(x.sub?' <span style="color:var(--ink-3);font-weight:400">— '+esc(x.sub)+'</span>':'')+'</span>'; }).join('') +
              '</div></div>';
          }
          out.innerHTML = html;
          out.querySelectorAll('.bsh-eov-verse').forEach(function(el){
            var rf = el.getAttribute('data-ref');
            var tx = el.getAttribute('data-txt');
            el.querySelectorAll('.va button').forEach(function(btn){
              btn.addEventListener('click', function(){
                var a = btn.getAttribute('data-a');
                if (a==='bible') sendToBible(rf);
                else if (a==='tray') sendToBuilder(rf);
                else if (a==='notebook') sendToNotebook(rf);
                else if (a==='copy') copyToClipboard(rf + ' — ' + tx + ' (KJV)');
              });
            });
          });
          out.querySelectorAll('[data-t]').forEach(function(el){ el.addEventListener('click', function(){ switchTab('search'); openTopic(el.getAttribute('data-t')); }); });
          var ca = out.querySelector('[data-copy-all]');
          if (ca) ca.addEventListener('click', function(){ copyToClipboard(top.map(function(x){return x.ref;}).join('; ')); });
        });
      });
    });
  }

  // ---------- MEMORIZE ----------
  var MEM_KEY = 'bsh_eov_mem_v1';
  function loadMem(){ try { return JSON.parse((window.safeLS||localStorage).getItem(MEM_KEY)||'[]')||[]; } catch(e){ return []; } }
  function saveMem(a){ try { (window.safeLS||localStorage).setItem(MEM_KEY, JSON.stringify(a.slice(0,100))); } catch(e){} }
  function addToMemorize(refStr){
    var arr = loadMem();
    if (arr.some(function(x){return x.ref===refStr;})) return;
    var pr = parseNaturalRef(refStr); if (!pr) return;
    loadMeta().then(function(){ return loadBookVerses(pr.id); }).then(function(){
      var txt = verseText(pr.id, pr.c, pr.v) || '';
      if (pr.v2 && pr.v2>pr.v){ for (var v=pr.v+1; v<=pr.v2; v++){ var t=verseText(pr.id,pr.c,v); if(t) txt += ' ' + t; } }
      arr.push({ ref:refStr, txt:txt, streak:0, added:Date.now() });
      saveMem(arr);
      if (currentTab==='mem') renderMemTab();
    });
  }
  var memState = { i:0, revealed:false };
  function renderMemTab(){
    var arr = loadMem();
    body.innerHTML =
      '<div class="bsh-eov-mem-add">' +
        '<input id="eovMemIn" placeholder="Add a verse to memorize, e.g. Rom 8:28"/>' +
        '<button id="eovMemAdd">Add</button>' +
      '</div>';
    if (!arr.length){
      body.innerHTML += '<div class="bsh-eov-empty">No verses yet. Add above, or tap ◎ Memorize on a verse in any topic.</div>';
    } else {
      if (memState.i >= arr.length) memState.i = 0;
      var cur = arr[memState.i];
      body.innerHTML +=
        '<div class="bsh-eov-mem-card">' +
          '<div class="ref">'+esc(cur.ref)+' <span style="font-size:var(--t-xs);color:var(--ink-3);font-family:var(--font-sans);font-weight:600;margin-left:6px">'+(memState.i+1)+' / '+arr.length+'</span></div>' +
          '<div class="txt '+(memState.revealed?'':'hidden')+'" id="eovMemTxt">'+esc(cur.txt||'')+'</div>' +
        '</div>' +
        '<div class="bsh-eov-mem-controls">' +
          '<button data-m="prev">← Prev</button>' +
          '<button class="primary" data-m="reveal">'+(memState.revealed?'Hide':'Reveal')+'</button>' +
          '<button data-m="next">Next →</button>' +
          '<button data-m="shuffle">⇄ Shuffle</button>' +
        '</div>' +
        '<div class="bsh-eov-mem-list">' +
          arr.map(function(x,i){ return '<div class="bsh-eov-mem-item"><div class="ref">'+esc(x.ref)+'</div><button data-goto="'+i+'">Study</button><button data-del="'+i+'">✕</button></div>'; }).join('') +
        '</div>';
      body.querySelectorAll('[data-m]').forEach(function(b){ b.addEventListener('click', function(){
        var m = b.getAttribute('data-m');
        if (m==='prev'){ memState.i = (memState.i - 1 + arr.length) % arr.length; memState.revealed=false; renderMemTab(); }
        else if (m==='next'){ memState.i = (memState.i + 1) % arr.length; memState.revealed=false; renderMemTab(); }
        else if (m==='reveal'){ memState.revealed = !memState.revealed; document.getElementById('eovMemTxt').classList.toggle('hidden'); b.textContent = memState.revealed?'Hide':'Reveal'; }
        else if (m==='shuffle'){ memState.i = Math.floor(Math.random()*arr.length); memState.revealed=false; renderMemTab(); }
      }); });
      body.querySelectorAll('[data-goto]').forEach(function(b){ b.addEventListener('click', function(){ memState.i = +b.getAttribute('data-goto'); memState.revealed=false; renderMemTab(); }); });
      body.querySelectorAll('[data-del]').forEach(function(b){ b.addEventListener('click', function(){ var a=loadMem(); a.splice(+b.getAttribute('data-del'),1); saveMem(a); memState.i=0; renderMemTab(); }); });
    }
    document.getElementById('eovMemAdd').addEventListener('click', function(){
      var s = document.getElementById('eovMemIn').value.trim(); if(!s) return;
      addToMemorize(s); document.getElementById('eovMemIn').value='';
    });
    document.getElementById('eovMemIn').addEventListener('keydown', function(e){ if(e.key==='Enter') document.getElementById('eovMemAdd').click(); });
  }

  // ---------- JOURNAL ----------
  var JR_KEY = 'bsh_eov_journal_v1';
  function loadJournal(){ try { return JSON.parse((window.safeLS||localStorage).getItem(JR_KEY)||'[]')||[]; } catch(e){ return []; } }
  function saveJournal(a){ try { (window.safeLS||localStorage).setItem(JR_KEY, JSON.stringify(a.slice(0,500))); } catch(e){} }
  function renderJournalTab(){
    var arr = loadJournal();
    body.innerHTML =
      renderStreak() +
      '<div class="bsh-eov-jr-in">' +
        '<input id="eovJrRef" placeholder="Reference (optional) — e.g. John 3:16"/>' +
        '<textarea id="eovJrTxt" placeholder="Your thoughts, insight, question, or prayer…"></textarea>' +
        '<div class="row"><button id="eovJrSave">Save note</button><button class="ghost" id="eovJrExport">⤓ Export all</button></div>' +
      '</div>' +
      '<div id="eovJrList">'+
        (arr.length ? arr.slice().reverse().map(function(n,idx){
          var i = arr.length - 1 - idx;
          var d = new Date(n.at);
          return '<div class="bsh-eov-jr-note"><h5><span>'+esc(d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})+' · '+d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}))+'</span><button class="del" data-del="'+i+'">✕</button></h5>'+(n.ref?'<div class="rf">'+esc(n.ref)+'</div>':'')+'<p>'+esc(n.text)+'</p></div>';
        }).join('') : '<div class="bsh-eov-empty">No notes yet. Write your first study reflection above.</div>') +
      '</div>';
    document.getElementById('eovJrSave').addEventListener('click', function(){
      var ref = document.getElementById('eovJrRef').value.trim();
      var txt = document.getElementById('eovJrTxt').value.trim();
      if (!txt) { say('Add some note text'); return; }
      var a = loadJournal();
      a.push({ ref:ref, text:txt, at:Date.now() });
      saveJournal(a);
      say('Note saved');
      renderJournalTab();
    });
    document.getElementById('eovJrExport').addEventListener('click', function(){
      var a = loadJournal(); if (!a.length){ say('No notes to export'); return; }
      var md = '# Study Journal\n\n' + a.map(function(n){ var d=new Date(n.at); return '## '+d.toLocaleString()+ (n.ref?' — '+n.ref:'') + '\n\n' + n.text + '\n'; }).join('\n---\n\n');
      var blob = new Blob([md], {type:'text/markdown'});
      var url = URL.createObjectURL(blob);
      var a2 = document.createElement('a'); a2.href = url; a2.download = 'study-journal.md'; a2.click();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    });
    body.querySelectorAll('[data-del]').forEach(function(b){ b.addEventListener('click', function(){ var a=loadJournal(); a.splice(+b.getAttribute('data-del'),1); saveJournal(a); renderJournalTab(); }); });
  }

  // ---------- STREAK ----------
  var STREAK_KEY = 'bsh_eov_streak_v1';
  function loadStreakData(){ try { return JSON.parse((window.safeLS||localStorage).getItem(STREAK_KEY)||'null') || {days:[], streak:0, best:0}; } catch(e){ return {days:[], streak:0, best:0}; } }
  function saveStreakData(d){ try { (window.safeLS||localStorage).setItem(STREAK_KEY, JSON.stringify(d)); } catch(e){} }
  function todayKey(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function logSession(){
    var d = loadStreakData(); var today = todayKey();
    if (d.days.indexOf(today) === -1){
      d.days.push(today); d.days = d.days.slice(-60);
      // Recompute streak: consecutive days ending today
      var s=0, cur=new Date();
      for (var i=0;i<60;i++){
        var k = cur.getFullYear()+'-'+String(cur.getMonth()+1).padStart(2,'0')+'-'+String(cur.getDate()).padStart(2,'0');
        if (d.days.indexOf(k) !== -1) s++; else break;
        cur.setDate(cur.getDate()-1);
      }
      d.streak = s; d.best = Math.max(d.best||0, s);
      saveStreakData(d);
    }
  }
  function renderStreak(){
    var d = loadStreakData();
    return '<div class="bsh-eov-streak"><div><div class="num">'+d.streak+'</div><div class="lbl">Day streak</div></div><div class="g"><div style="font-family:var(--font-serif);font-weight:600;font-size:var(--t-md);margin-bottom:2px">Study streak</div><div style="color:var(--ink-3);font-size:var(--t-sm)">You\'ve opened the Explorer '+d.days.length+' unique days · Best: '+(d.best||0)+' days</div></div></div>';
  }

  // ---------- Public API ----------
  window.BshExplorerOverlay = {
    open: open, close: close, toggle: toggle,
    openTopic: function(name){ open({ topic:name }); },
    sendToBible: sendToBible,
    sendToBuilder: sendToBuilder,
    addToCompare: addToCompare,
    addToMemorize: addToMemorize
  };
})();
