/* GeoFlow Timeline: an independent PDF composition engine, not an issued-log replica. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./geoflow-domain.js'):root.GeoFlowDomain);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.GeoFlowLogPDF=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Domain){
  'use strict';
  const layout=Object.freeze({left:14,right:196,top:101,bottom:251,metres:5,scale:30,axis:29,materialX:39,materialW:87,evidenceX:136,evidenceW:60});
  const palette={ink:[29,48,53],teal:[17,104,105],muted:[87,105,110],line:[201,215,215],wash:[240,246,245],rock:[121,95,65]};
  const value=v=>v===null||v===undefined||String(v).trim()===''?'-':String(v);
  const number=Domain.numberOrNull;
  const depth=v=>number(v)===null?'-':Number(v).toFixed(2);

  function build(state,id,options){
    const B=state.boreholes.find(b=>b.id===id),P=state.project||{},L=state.logs[id];
    if(!B||!L)throw Error(`Borehole ${id} has no logging record.`);
    const doc=new options.jsPDF({unit:'mm',format:'a4'});
    const validation=options.validation||{errors:[],warnings:[]};
    const draft=validation.errors.length>0||!(P.reviewBy||P.checkedBy);
    const status=draft?'DRAFT - REVIEW REQUIRED':'REVIEWED';
    const revision=value(state.reportMeta?.[id]?.revision||'P01');
    const soil=(L.soil||[]).filter(r=>Domain.classifySoilRow(r)==='geology');
    const rock=(L.rock||[]).filter(r=>Domain.classifyRockRow(r)==='geology');
    const runs=(L.rock||[]).filter(r=>!r.defectType&&['tcr','scr','rqd','is50'].some(k=>number(r[k])!==null));
    const defs=options.defects||(L.rock||[]).filter(r=>r.defectType&&number(r.from)!==null).map(r=>({from:number(r.from),to:number(r.to),code:[r.defectType,r.defectAngle,r.defectRough,r.defectInfill,r.remarks].filter(v=>v!==null&&v!==undefined&&v!=='').join(' / ')}));
    const term=number(B.termDepth)??number(B.finalDepth);
    const geology=[...soil.map(r=>({...r,kind:'soil'})),...rock.map(r=>({...r,kind:'rock'}))].sort((a,b)=>number(a.from)-number(b.from));
    const tests=(L.spt||[]).filter(r=>number(r.depth)!==null);
    const samples=(L.samples||[]).filter(r=>number(r.from)!==null);
    const maxDepth=Math.max(term||0,...geology.map(r=>number(r.to)||0),...runs.map(r=>number(r.to)||0),...defs.map(r=>r.to??r.from),...samples.map(r=>number(r.to)??number(r.from)),...tests.map(r=>Domain.deriveSpt(r).endDepth??number(r.depth)),1);
    const count=Math.max(1,Math.ceil((maxDepth-1e-9)/layout.metres));
    const notes=[];
    let materialSheets=0,coreSheets=0;
    function note(label,text){
      const previous=notes.find(n=>n.label===label&&n.text===String(text));
      if(previous)return previous.id;
      const nid=`D${notes.length+1}`;notes.push({id:nid,label,text:String(text)});return nid;
    }
    function text(str,x,y,size=8,bold=false,color=palette.ink,opts){
      doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);
      doc.text(String(str),x,y,opts);
    }
    function rule(x,y,x2,y2,color=palette.line,width=.2){doc.setDrawColor(...color);doc.setLineWidth(width);doc.line(x,y,x2,y2);}
    function fill(x,y,w,h,color){doc.setFillColor(...color);doc.rect(x,y,w,h,'F');}
    function fit(str,x,y,width,size=8,bold=false,label){
      const raw=value(str);doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);
      if(doc.getTextWidth(raw)<=width){text(raw,x,y,size,bold);return;}
      const nid=note(label||'Full value',raw),suffix=` [${nid}]`;
      let short=raw;while(short.length&&doc.getTextWidth(short+'...'+suffix)>width)short=short.slice(0,-1);
      text(short+'...'+suffix,x,y,size,bold);
    }
    function metadata(label,raw,x,y,width){
      text(label.toUpperCase(),x,y,6.2,true,palette.muted);fit(raw,x,y+4.5,width,8,false,label);
    }
    function masthead(title,subtitle){
      fill(14,13,2,15,palette.teal);text('GeoFlow',20,22,22,true);text('STS GEOTECHNICS / FIELD RECORDS',20,28,6.5,true,palette.muted);
      fit(id,139,22,57,18,true,'Borehole identifier');text(title.toUpperCase(),139,28,7,true,palette.teal);
      rule(14,34,196,34);
      metadata('Project',P.projectNumber,14,41,50);metadata('Client',P.clientName,70,41,126);
      metadata('Site',[P.siteAddress,P.suburb].filter(Boolean).join(', '),14,53,126);
      metadata('Investigation',P.dateInvestigation||P.dateLogged,146,53,50);
      fit(subtitle,14,69,182,7,false,'Log authors');
    }
    function pageHeader(kind,d0){
      masthead(kind==='rock'?'Rock profile':kind==='mixed'?'Soil + rock profile':'Soil profile',`LOGGED BY ${value(P.loggedBy)}    /    REVIEWED BY ${value(P.reviewBy||P.checkedBy)}`);
      fill(14,76,182,12,palette.ink);text(kind==='rock'?'ROCK PROFILE':kind==='mixed'?'SOIL + ROCK PROFILE':'SOIL PROFILE',18,83.5,9,true,[255,255,255]);
      text(`${depth(d0)} - ${depth(d0+5)} m`,192,83.5,10,true,[255,255,255],{align:'right'});
      text('DEPTH / m',14,96,6.4,true,palette.muted);text('MATERIAL RECORD',39,96,7,true,palette.muted);
      text('TESTS & OBSERVATIONS',136,96,7,true,palette.muted);
      rule(39,98,126,98);rule(136,98,196,98);
      // A single scale rail links narrative and evidence; no full-height column grid.
      rule(layout.axis,layout.top,layout.axis,layout.bottom,palette.line,.5);
      for(let n=0;n<=10;n++){
        const y=layout.top+n*15,d=d0+n*.5;
        rule(26,y,29,y,palette.muted,.2);text(d.toFixed(1),23,y+.9,7,false,palette.muted,{align:'right'});
      }
      const gw=L.gw||{};
      const water=number(gw.depth)??number(B.gwDepth);
      const waterLabel=gw.state?`${gw.state}${water!==null?` at ${depth(water)} m`:''}`:water!==null?`Observed at ${depth(water)} m`:value(P.groundwater);
      metadata('Groundwater',waterLabel,14,260,83);
      metadata('Termination',term===null?'Not recorded':`${depth(term)} m / ${value(B.termReason)}`,107,260,89);
      if(term!==null&&term>d0&&term<=d0+5){
        const y=layout.top+(term-d0)*layout.scale;rule(27,y,34,y,palette.teal,.7);
      }
      if(term===0&&d0===0)rule(27,layout.top,34,layout.top,palette.teal,.7);
    }
    function cards(records,x,width,d0,kind){
      let cursor=layout.top;
      records.forEach(record=>{
        const actualY=layout.top+(Math.max(record.from,d0)-d0)*layout.scale;
        const y=Math.max(actualY,cursor);
        const label=record.label;
        const heading=record.heading;
        const body=String(record.text||'');
        doc.setFont('helvetica','normal');doc.setFontSize(8);
        const lines=doc.splitTextToSize(body,width-6);
        const nextBoundary=record.to>record.from?layout.top+(Math.min(record.to,d0+5)-d0)*layout.scale:actualY+24;
        const available=Math.min(layout.bottom-y,Math.max(kind==='material'?15:19,nextBoundary-y-2),kind==='material'?56:36);
        if(available<13){note(label,[heading,body,record.attributes].filter(Boolean).join('\n'));return;}
        const capacity=Math.max(0,Math.floor((available-14)/3.6));
        const overflow=lines.length>capacity;
        const nid=overflow?note(label,body):null;
        const shown=overflow?lines.slice(0,Math.max(0,capacity-1)):lines;
        const height=14+Math.max(1,shown.length+(overflow?1:0))*3.6;
        if(y+height>layout.bottom){note(label,[heading,body,record.attributes].filter(Boolean).join('\n'));return;}
        fill(x,y,width,height,palette.wash);
        fill(x,y,1,height,kind==='material'?palette.teal:palette.rock);
        if(y>actualY+1)rule(x-3,actualY,x,y+2,palette.line,.2);
        text(label,x+3,y+4,6.4,true,palette.muted);
        fit(heading,x+3,y+8.5,width-6,8.5,true,label+' / material');
        shown.forEach((line,i)=>text(line,x+3,y+13+i*3.6,8));
        if(overflow)text(`[${nid}] Full description in detail register`,x+3,y+13+shown.length*3.6,6.5,true,palette.teal);
        // Attribute rows are independent records so none are lost to a short layer.
        if(record.attributes){
          const ay=y+height+3.5;
          if(ay<layout.bottom-2){fit(record.attributes,x+3,ay,width-6,7,false,label+' / properties');cursor=ay+5;}
          else{note(label+' / properties',record.attributes);cursor=y+height+4;}
        }else cursor=y+height+4;
      });
    }
    function materialRecord(r,d0){
      const description=r.description||(r.kind==='soil'?Domain.soilDescription(r):options.rockDescription?.(r))||r.rockType||r.material||'';
      const attrs=r.kind==='soil'?[r.uscs,r.consistency,r.moisture]:[r.weathering,r.strength?`Strength ${r.strength}`:'',r.rockClass];
      return {from:number(r.from),to:number(r.to),label:`${depth(r.from)} - ${depth(r.to)} m${number(r.from)<d0?' / continued':''}`,heading:(number(r.from)<d0?'(continued) ':'')+(r.material||r.rockType||'Material'),text:description,attributes:attrs.filter(v=>v!==''&&v!==null&&v!==undefined).join(' / ')};
    }
    for(let page=0;page<count;page++){
      if(page)doc.addPage();
      const d0=page*5,d1=d0+5;
      const owns=d=>d>=d0&&(d<d1||(page===count-1&&d===d1));
      const rows=geology.filter(r=>number(r.to)>d0&&number(r.from)<d1);
      const hasRock=rows.some(r=>r.kind==='rock')||runs.some(r=>number(r.to)>d0&&number(r.from)<d1);
      const hasSoil=rows.some(r=>r.kind==='soil');
      if(hasRock)coreSheets++;else materialSheets++;
      pageHeader(hasRock?(hasSoil?'mixed':'rock'):'soil',d0);
      for(const r of rows){
        const y=layout.top+(Math.max(number(r.from),d0)-d0)*30,h=(Math.min(number(r.to),d1)-Math.max(number(r.from),d0))*30;
        fill(31,y,3,Math.max(.2,h),r.kind==='soil'?palette.teal:palette.rock);
        rule(31,y,35,y,[255,255,255],.4);
      }
      cards(rows.map(r=>materialRecord(r,d0)),39,87,d0,'material');
      const evidence=[];
      samples.filter(r=>owns(number(r.from))).forEach(r=>evidence.push({from:number(r.from),label:`${depth(r.from)} - ${depth(r.to??r.from)} m`,heading:'SAMPLE',text:[r.sid||r.sampleId,r.type,r.remarks].filter(Boolean).join(' / ')}));
      tests.filter(r=>owns(number(r.depth))).forEach(r=>evidence.push({from:number(r.depth),label:Domain.formatSptDepthLine(r),heading:'PENETRATION TEST',text:Domain.formatSptLine(r),attributes:r.remarks}));
      runs.filter(r=>number(r.to)>d0&&number(r.from)<d1).forEach(r=>evidence.push({from:Math.max(number(r.from),d0),label:`CORE ${depth(r.from)} - ${depth(r.to)} m`,heading:'CORE RECOVERY',text:['tcr','scr','rqd'].filter(k=>number(r[k])!==null).map(k=>`${k.toUpperCase()} ${r[k]}%`).join(' / '),attributes:number(r.is50)!==null?`Is(50) ${r.is50} MPa / orientation not recorded`:''}));
      defs.filter(r=>owns(r.from)||(r.from<d0&&r.to>d0)).forEach(r=>evidence.push({from:Math.max(r.from,d0),label:`DEFECT ${depth(r.from)}${r.to!==null&&r.to!==undefined?' - '+depth(r.to):''} m`,heading:'DISCONTINUITY',text:r.code}));
      cards(evidence.sort((a,b)=>a.from-b.from),136,60,d0,'evidence');
    }
    // Equipment and coordinate metadata live in a readable register, not tiny header cells.
    const equipment=[['Contractor',P.drillingContractor],['Plant',P.drillRig],['Method',P.drillingMethod],['Bit',P.drillBit],['Hole diameter (mm)',P.holeDia],['Inclination (deg)',P.inclination],['Surface RL',number(B.rl)??number(P.groundRL)],['Datum',P.datum],['Location',P.locationNo],['Easting',B.easting],['Northing',B.northing]];
    note('Setup and location',equipment.map(([k,v])=>`${k}: ${value(v)}`).join('\n'));
    (L.observations||[]).forEach(r=>note(r.label||'Observation',r.text||''));
    geology.forEach(r=>{
      const extras=['structure','origin','inclusions','bedding','defectSpacing','remarks','envNotes'].filter(k=>value(r[k])!=='-').map(k=>`${k}: ${r[k]}`);
      if(extras.length)note(`Additional observations ${depth(r.from)} - ${depth(r.to)} m`,extras.join('\n'));
    });
    if(term!==null)note('Termination',`Terminated at ${term.toFixed(2)}m. ${value(B.termReason)}`);
    let y=999,detailPages=0;
    function detailPage(){doc.addPage();detailPages++;masthead('Detail register','SUPPORTING OBSERVATIONS / depths in metres');rule(14,76,196,76,palette.teal,.7);y=86;}
    notes.forEach(n=>{
      if(y>246)detailPage();
      doc.setFont('helvetica','bold');doc.setFontSize(9);
      for(const line of doc.splitTextToSize(`[${n.id}] ${n.label}`,182)){
        if(y>265)detailPage();text(line,14,y,9,true);y+=4.5;
      }
      y+=1.5;
      doc.setFont('helvetica','normal');doc.setFontSize(8.5);
      const lines=doc.splitTextToSize(n.text,178);
      for(const line of lines){if(y>265){detailPage();text(`[${n.id}] continued`,14,y,7,true);y+=6;}text(line,14,y,8.5);y+=4.1;}
      y+=6;
    });
    if(B.photoReq&&L.corebox?.img){
      doc.addPage();masthead('Core photograph','SOURCE IMAGE / not a calibrated depth drawing');
      const ratio=L.corebox.natH/L.corebox.natW;
      try{const w=Math.min(182,180/ratio),h=w*ratio;doc.addImage(L.corebox.img,'JPEG',14,80,w,h);}
      catch(error){text('Photograph could not be embedded. Refer to the source image.',14,90,9);validation.warnings.push('Core photograph could not be embedded.');}
    }
    const pages=doc.getNumberOfPages();
    for(let p=1;p<=pages;p++){
      doc.setPage(p);rule(14,277,196,277);
      text(status,14,283,6.8,true,draft?palette.rock:palette.teal);
      text(`REV ${revision} / GEOFLOW TIMELINE`,196,283,6.8,true,palette.muted,{align:'right'});
      text(p<=count?'Depth rail: 30 mm/m. Cards may move for readability; written depths govern.':'Detail register: full observations retained from the source log.',14,288,6.3,false,palette.muted);
      text(`${id} | Page ${p} of ${pages}`,196,293,6.5,false,palette.muted,{align:'right'});
    }
    doc.__validation={...validation,repaired:[]};doc.__details=notes;
    doc.__qa={logo:true,design:'geoflow-timeline-v1',sheets:count,materialSheets,coreSheets,coreStart:Domain.coringStartDepth({borehole:B,project:P,rock:L.rock||[],corebox:L.corebox||{}}),documentPages:pages,detailRecords:notes.length,detailPages};
    return doc;
  }
  return {build,layout};
});
