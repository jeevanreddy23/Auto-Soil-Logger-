/* Pure workflow evaluation. No DOM, storage, network, or source-state writes. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./geoflow-domain.js'):root.GeoFlowDomain);if(typeof module==='object'&&module.exports)module.exports=api;root.GeoFlowWorkflow=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Domain){
'use strict';
function labRows(state){
 const rows=((state.scope||{}).plan?.labs||[]).map((r,i)=>({key:'plan-'+i,kind:'plan',test:r.test,qty:r.qty,note:r.note}));
 for(const b of state.boreholes||[])for(const s of state.logs?.[b.id]?.samples||[]){
 const requested=Array.isArray(s.tests)?s.tests.filter(t=>String(t).trim()):typeof s.tests==='string'&&s.tests.trim()?[s.tests.trim()]:[];
 for(const [key,label] of [['mc','Moisture content'],['att','Atterberg limits'],['psd','Particle size'],['cbr','CBR']])if(s[key])requested.push(label);
 if(requested.length){const sid=s.sid||b.id+'_'+s.from;rows.push({key:'smp-'+sid,kind:'sample',bh:b.id,sid,tests:[...new Set(requested)].join(', ')});}
 }
 return rows;
}
const dependencies={master:[],scope:['master'],plan:['scope'],field:['plan'],lab:['plan'],qa:['field'],report:['qa','lab'],issue:['report']};
function sourceKey(state,id){
 const serialized=JSON.stringify([state.project||{},(state.boreholes||[]).find(b=>b.id===id)||{},state.logs?.[id]||{}]);
 // Non-security change detector; not a signature or proof of professional approval.
 let a=2166136261,b=5381;for(let i=0;i<serialized.length;i++){a=Math.imul(a^serialized.charCodeAt(i),16777619);b=Math.imul(b,33)^serialized.charCodeAt(i);}
 return 'v1-'+(a>>>0).toString(16)+'-'+(b>>>0).toString(16)+'-'+serialized.length;
}
function evaluate(S={},services={}){
 const window={__logic22:services.logic,__score22:services.score};
 const validate=services.validate;
const E=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
const N=Domain.numberOrNull;
const pc=(a,b)=>b? Math.max(0,Math.min(100,Math.round(a/b*100))) : 0;
const LG=()=>S.logs||{};
const BH=()=>S.boreholes||[];
const dOf=id=>{ const l=LG()[id]||{}; const b=BH().find(x=>x.id===id)||{};
  return Math.max(...((l.soil||[]).map(r=>N(r.to)||0)), ...((l.rock||[]).map(r=>N(r.to)||0)), N(b.termDepth)||0, 0); };
const anyLog=id=>{ const l=LG()[id]||{}; return (l.soil||[]).some(r=>Domain.classifySoilRow(r)==="geology") || (l.rock||[]).some(r=>Domain.classifyRockRow(r)==="geology"); };
const cnt=k=>Object.values(LG()).reduce((a,l)=>a+((l&&l[k])||[]).length,0);
/* two planned-depth fields exist in this codebase: plannedDepth (borehole grid, manual + field
   imports) and planned (scope-plan generator). Read BOTH or the gate can never be cleared. */
const PLAN=b=>{ const a=N(b.plannedDepth); return a!=null? a : N(b.planned); };
/* mirror renderLaboratory's own row enumeration exactly — same keys, so counts can never disagree.
   Samples with no requested tests are excluded there and here (blank auto-rows must not inflate). */
/* ---------- stage definitions: id · gate · blockers with their fix route ---------- */
const ST=[
 { id:"master", ic:"◆", label:"Project record", why:"Extract once, reuse everywhere — every log, email and report reads these fields.",
   check(){ const P=S.project||{};
     const req=[["projectNumber","Project number"],["clientName","Client name"],["siteAddress","Site address"],["projectName","Project name"]];
     const miss=req.filter(([k])=>!String(P[k]||"").trim());
     return { pct:pc(req.length-miss.length,req.length),
       blk:miss.map(([k,l])=>({msg:l+" is not set", act:{tab:"project"}, fix:"Open Project Setup"})) }; } },

 { id:"scope", ic:"⛭", label:"Scope agreed", why:"The proposal defines what must be delivered — everything downstream is checked against it.",
   check(){ const sc=S.scope||{}; const it=sc.items||[]; const docs=sc.docs||[];
     if (!docs.length && !it.length) return { pct:0, blk:[{msg:"No proposal uploaded", act:{tab:"scope",step:1}, fix:"Upload proposal"}] };
     if (!it.length) return { pct:25, blk:[{msg:"Proposal uploaded but scope not extracted", act:{tab:"scope",step:2}, fix:"Extract scope"}] };
     const open=it.filter(i=>!i.status||i.status==="new");
     const acc=it.filter(i=>i.status==="acc").length;
     return { pct: open.length? 25+pc(it.length-open.length,it.length)*0.5 : (acc? 100:75),
       blk: open.length? [{msg:`${open.length} scope item${open.length>1?"s":""} awaiting review`, act:{tab:"scope",step:3}, fix:"Review scope"}]
            : (acc? [] : [{msg:"No scope items accepted", act:{tab:"scope",step:3}, fix:"Accept items"}]) }; } },

 { id:"plan", ic:"▤", label:"Field plan", why:"Turns the agreed scope into boreholes, depths and test intervals the crew can execute.",
   check(){ const p=S.scope&&S.scope.plan; const t=p&&p.totals;
     if (!t || !(t.bh>0)) return { pct:0, blk:[{msg:"Field plan not generated from scope", act:{tab:"scope",step:4}, fix:"Generate plan"}] };
     if (!BH().length) return { pct:50, blk:[{msg:"Plan exists but no boreholes created", act:{tab:"boreholes"}, fix:"Create boreholes"}] };
     const unplanned=BH().filter(b=>PLAN(b)==null || PLAN(b)<=0).length;
     return { pct: unplanned? 75:100,
       blk: unplanned? [{msg:`${unplanned} borehole${unplanned>1?"s":""} without a planned depth`, act:{tab:"boreholes"}, fix:"Set depths"}]:[] }; } },

 { id:"field", ic:"⛏", label:"Fieldwork", why:"Crews log on the phone app; this stage closes when every hole is logged and terminated.",
   check(){ const bs=BH(); if (!bs.length) return { pct:0, blk:[{msg:"No boreholes to log", act:{tab:"boreholes"}, fix:"Create boreholes"}] };
     const done=bs.filter(b=>N(b.termDepth)!==null && N(b.termDepth)>=0 && anyLog(b.id));
     const started=bs.filter(b=>anyLog(b.id));
     const blk=[];
     const notStarted=bs.filter(b=>!anyLog(b.id));
     if (notStarted.length) blk.push({msg:`${notStarted.length} not started: ${notStarted.slice(0,4).map(b=>b.id).join(", ")}${notStarted.length>4?"…":""}`, act:{tab:"fieldwork"}, fix:"Fieldwork"});
     const openHoles=started.filter(b=>N(b.termDepth)===null || N(b.termDepth)<0);
     if (openHoles.length) blk.push({msg:`${openHoles.length} logged but not terminated: ${openHoles.slice(0,4).map(b=>b.id).join(", ")}`, act:{tab:"boreholes"}, fix:"Set termination"});
     const shortHoles=bs.filter(b=>PLAN(b)!=null && N(b.termDepth)!==null && N(b.termDepth) < PLAN(b)-0.05 && !String(b.termReason||"").trim());
     if (shortHoles.length) blk.push({msg:`${shortHoles.length} terminated short of plan without a reason: ${shortHoles.slice(0,3).map(b=>b.id).join(", ")}`, act:{tab:"boreholes"}, fix:"Add reason"});
     return { pct:pc(done.length,bs.length), blk }; } },

 { id:"lab", ic:"⚗", label:"Laboratory", why:"Every planned lab test and every sample carrying a test request must come back before sign-off.",
   check(){ const plan=S.scope&&S.scope.plan;
     /* no approved plan → the lab requirement is UNKNOWN, never assume satisfied */
     if (!plan) return { pct:0, blk:[{msg:"Lab requirement unknown until the field plan is approved", act:{tab:"scope",step:4}, fix:"Generate plan"}] };
     const keys=labRows(S).map(r=>r.key);
     if (!keys.length) return { pct:100, blk:[] };            /* plan approved and requires no lab work */
     const ls=S.labStatus||{}; const stt=k=>ls[k]||"Pending";
     const ret=keys.filter(k=>stt(k)==="Returned").length;
     const sub=keys.filter(k=>["Submitted","Returned"].includes(stt(k))).length;
     const blk=[];
     if (sub<keys.length) blk.push({msg:`${keys.length-sub} lab item${keys.length-sub>1?"s":""} not submitted`, act:{tab:"laboratory"}, fix:"Laboratory"});
     else if (ret<keys.length) blk.push({msg:`${keys.length-ret} lab result${keys.length-ret>1?"s":""} outstanding`, act:{tab:"laboratory"}, fix:"Laboratory"});
     return { pct:pc(ret,keys.length), blk }; } },

 { id:"qa", ic:"⚠", label:"QA clean", why:"Blocking validation errors and AS 1726 logic conflicts must be zero before logs are issued.",
   check(){ const blk=[];
     /* validate() returns {errs,warns} — NOT an array. Reading the wrong key made this gate blind. */
     let v=null, vOk=true; try{ v=(typeof validate==="function")? validate() : null; }catch(e){ vOk=false; }
     const eArr = Array.isArray(v)? v : ((v && (v.errs||v.errors)) || []);
     if (!vOk || v==null) blk.push({msg:"Validation engine unavailable — cannot certify QA", act:{tab:"export"}, fix:"Data Export"});
     /* an unavailable engine is UNKNOWN, never silently clean */
     let logic=null; try{ logic=(window.__logic22? window.__logic22() : null); }catch(e){ logic=null; }
     const hard=Array.isArray(logic)? logic.filter(x=>x&&x.sev==="err") : [];
     if (!Array.isArray(logic)) blk.push({msg:"Logic engine unavailable — AS 1726 conflicts unchecked", act:{tab:"qa"}, fix:"QA Alerts"});
     let low=0, scoreOk=true;
     for (const b of BH()){ let s2=null; try{ s2=window.__score22? window.__score22(b.id) : null; }catch(e){ s2=null; }
       if (!Number.isFinite(s2)){ scoreOk=false; break; } if (s2<85) low++; }
     if((S.conflicts||[]).length)blk.push({msg:'Unresolved field/office sync conflicts',act:{tab:'export'},fix:'Review conflicts'});
     if (!scoreOk) blk.push({msg:"Completeness scoring unavailable", act:{tab:"qa"}, fix:"QA Alerts"});
     if (eArr.length) blk.push({msg:`${eArr.length} blocking validation error${eArr.length>1?"s":""}`, act:{tab:"export"}, fix:"Data Export"});
     if (hard.length) blk.push({msg:`${hard.length} logic conflict${hard.length>1?"s":""} (RQD/overlap)`, act:{tab:"qa"}, fix:"QA Alerts"});
     if (low) blk.push({msg:`${low} borehole${low>1?"s":""} below 85% completeness`, act:{tab:"qa"}, fix:"QA Alerts"});
     return { pct: blk.length? Math.max(10,100-blk.length*15) : 100, blk }; } },

 { id:"report", ic:"▥", label:"Sign-off", why:"Logs carry a DRAFT watermark until a reviewer is recorded.",
   check(){ const P=S.project||{}; const blk=[];
     if (!String(P.reportNumber||"").trim()) blk.push({msg:"Report number not set", act:{tab:"project"}, fix:"Project Setup"});
     if (!String(P.loggedBy||"").trim()) blk.push({msg:"Logged By not recorded", act:{tab:"project"}, fix:"Project Setup"});
     if (!String(P.reviewBy||P.checkedBy||"").trim()) blk.push({msg:"Review By not recorded — logs print DRAFT", act:{tab:"project"}, fix:"Project Setup"});
     return { pct:pc(3-blk.length,3), blk }; } },

 { id:"issue", ic:"⇧", label:"Handover preparation", why:"Check that current report files are saved and reviewed. A shared link alone is not proof of issue.",
 check(){ const bs=BH(), meta=S.reportMeta||{}, approvals=S.reportApprovals||{}; const blk=[];
 if(!bs.length)blk.push({msg:"No borehole reports to prepare",act:{tab:"boreholes"},fix:"Create boreholes"});
 for(const b of bs){ const m=meta[b.id]||{},a=approvals[b.id];
 if(!m.generatedDate||m.archived||m.sourceKey!==sourceKey(S,b.id))blk.push({msg:b.id+": save a current report",act:{tab:"preview",boreholeId:b.id},fix:"Open Reports"});
 else if(!a||a.revision!==(m.revision||"P01")||Date.parse(a.at)<Date.parse(m.generatedDate)||!Number.isFinite(Date.parse(a.at)))blk.push({msg:b.id+": review the saved report revision",act:{tab:"preview",boreholeId:b.id},fix:"Review report"});
 }
 return {pct:pc(bs.length-blk.length,bs.length),blk}; } }
];

 const stages=ST.map(s=>{let r;try{r=s.check();}catch(error){r={pct:0,blk:[{msg:'Stage check unavailable',act:null,fix:''}]};}
 const blockers=r.blk||[];let pct=Math.round(r.pct||0);if(blockers.length)pct=Math.min(99,pct);
 return {id:s.id,ic:s.ic,label:s.label,why:s.why,pct,blk:blockers,dependsOn:dependencies[s.id]};});
 for(const stage of stages){stage.waitingOn=stage.dependsOn.filter(id=>stages.find(s=>s.id===id).status!=='complete');
 stage.status=stage.waitingOn.length?'waiting':stage.blk.length?'action-needed':'complete';
 if(stage.status!=='complete')stage.pct=Math.min(99,stage.pct);
 }
 const next=stages.find(s=>s.status==='action-needed')||stages.find(s=>s.status!=='complete')||null;
 return {stages,next:next?.id||null,complete:stages.every(s=>s.status==='complete'),completed:stages.filter(s=>s.status==='complete').length,progress:Math.round(stages.reduce((n,s)=>n+s.pct,0)/stages.length)};
}
return {evaluate,labRows,dependencies,sourceKey};
});
