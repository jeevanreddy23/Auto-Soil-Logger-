const test=require('node:test');
const assert=require('node:assert/strict');
const Domain=require('../geologger/geoflow-domain.js');
const Core=require('../geologger/geoflow-ui-core.js');
const {fixture,build}=require('./helpers/pdf-harness');

test('blank and boolean values are never interpreted as zero depth',()=>{
  for(const value of [' ', '\t', false, true]) assert.equal(Domain.numberOrNull(value),null);
  assert.equal(Domain.numberOrNull('0'),0);
  assert.equal(Domain.classifySoilRow({from:-1,to:1,material:'CLAY'}),'draft');
});
test('SPT rejects nonnumeric increments, missing seating and negative depths',()=>{
  assert.equal(Domain.deriveSpt({depth:1,b1:'bad',b2:2,b3:3}).status,'invalid');
  assert.equal(Domain.deriveSpt({depth:1,b1:1,b2:2,b3:3,p2:'bad'}).status,'invalid');
  assert.equal(Domain.deriveSpt({depth:1,b2:2,b3:3}).status,'incomplete');
  assert.ok(Domain.sptIssues({depth:-1,b1:1,b2:2,b3:3}).some(i=>i.severity==='error'));
});
test('zero penetration at refusal is preserved without inventing 150 mm',()=>{
  const result=Domain.deriveSpt({depth:2,b1:50,p1:0,refusal:true});
  assert.equal(result.n,'R'); assert.equal(result.totalPenetration,0);
  assert.equal(Domain.formatSptLine({depth:2,b1:50,p1:0,refusal:true}),'50/0 N=R');
});
test('review validation includes SPT penetration endpoints and recovery consistency',()=>{
  const state=fixture(); const id=state.boreholes[0].id;
  state.logs[id].spt=[{depth:9.8,b1:1,b2:2,b3:3}];
  assert.ok(Core.collectValidation(state).some(i=>i.code==='termination-depth'));
  state.logs[id].rock=[{from:10,to:11,tcr:40,rqd:90}];
  assert.ok(Core.collectValidation(state).some(i=>i.code==='recovery-order'));
});
test('recovery runs and defect zones do not falsely overlap geology',()=>{
  const state=fixture('rock'),id=state.boreholes[0].id;
  state.logs[id].rock.push({from:1,to:2,tcr:100,rqd:80},{from:2,to:2.1,defectType:'Clay seam'});
  assert.equal(Core.collectValidation(state).filter(i=>i.code==='interval-overlap').length,0);
});
test('coring fallback uses the earliest interval in unsorted input',()=>{
  assert.equal(Domain.coringStartDepth({borehole:{coreReq:true},rock:[{from:8,to:9,rockType:'SHALE'},{from:2,to:8,rockType:'SHALE'}]}),2);
});
test('10 m termination is present without a phantom material sheet',()=>{
  const {doc,text}=build(fixture());
  assert.equal(doc.__qa.materialSheets,1);
  assert.match(text,/Terminated at 10.00m/);
  assert.match(text,/Target depth reached/);
});
test('thin-layer descriptions survive in full on linked detail pages',()=>{
  const state=fixture(); const {doc,text}=build(state);
  assert.ok(doc.__details.some(n=>n.text===state.logs['BH-S01'].soil[0].description));
  assert.match(text,/\[D1\]/); assert.match(text,/detail register/);
});
test('rock lithology continues across sheets and preserves defect attributes',()=>{
  const {drawn,text,doc}=build(fixture('rock'));
  assert.ok(drawn.some(t=>t.page===2&&t.text.includes('(continued) SANDSTONE')));
  assert.match(text,/35 deg rough clean/);
  assert.match(text,/Terminated at 20.00m/);
  assert.equal(doc.__qa.coreSheets,2);
});
test('groundwater at zero and per-hole observations override project text',()=>{
  // Use a soil sheet to inspect the water column.
  const soil=fixture();soil.project.groundwater='GWNE';soil.logs['BH-S01'].gw={state:'Observed',depth:0};
  assert.ok(build(soil).drawn.some(t=>t.text==='WT'&&t.y===81));
  soil.logs['BH-S01'].gw={state:'GWNE',depth:''};soil.project.groundwater='Observed at 5 m';
  assert.match(build(soil).text,/GWNE/);
});

test('a cached PDF is regenerated after source observations change',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const script=fs.readFileSync(require.resolve('../geologger/geoflow-reports.js'),'utf8');
  const start=script.indexOf('  function ensureGenerated('),end=script.indexOf('  async function generateAndSave',start);
  const source=fixture();let calls=0,revoked=0;
  const context={state:()=>source,generated:new Map(),URL:{createObjectURL:()=>`blob:${calls}`,revokeObjectURL:()=>revoked++},buildPdf:()=>{calls++;return {output:()=>({}),getNumberOfPages:()=>1};}};
  vm.createContext(context);vm.runInContext(script.slice(start,end),context);
  const row={id:'report-BH-S01',boreholeId:'BH-S01'};
  context.ensureGenerated(row,false);context.ensureGenerated(row,false);assert.equal(calls,1);
  source.logs['BH-S01'].soil[0].description='Revised observation';
  context.ensureGenerated(row,false);assert.equal(calls,2);assert.equal(revoked,1);
});

test('long header values are retained in the detail register',()=>{
  const state=fixture();state.project.clientName='A very long client legal entity name '.repeat(8);
  const {doc}=build(state);assert.ok(doc.__details.some(n=>n.text===state.project.clientName));
});

test('crowded defects and sample labels remain inside the frame or move to details',()=>{
  const state=fixture('rock');const log=state.logs['BH-R01'];
  for(let i=0;i<90;i++)log.rock.push({from:9+i/1000,to:9+i/1000,defectType:`Special defect ${i}`});
  const {doc,drawn}=build(state);
  assert.ok(doc.__details.length>20);
  const pageDefects=drawn.filter(t=>t.page<=2&&t.x===142);
  assert.ok(pageDefects.every(t=>t.y>=78&&t.y<=269.8));
  for(let i=0;i<90;i++)assert.ok(drawn.some(t=>t.text.includes(`Special defect ${i}`)));
});

test('mixed soil and cored rock retain the engineering template transition',()=>{
  const state=fixture('rock');const log=state.logs['BH-R01'];
  log.soil=[{from:0,to:2,material:'CLAY',description:'CLAY: brown'}];log.rock[0].from=2;
  const {doc,drawn}=build(state);
  assert.equal(doc.__qa.materialSheets,1);assert.equal(doc.__qa.coreSheets,2);
  assert.ok(drawn.some(t=>t.page===1&&t.text==='SOIL / MATERIAL LOG'));
  assert.ok(drawn.some(t=>t.page===2&&t.text==='CORED ROCK LOG'));
});
test('reviewer name cannot clear a draft with factual validation errors',()=>{
  const state=fixture();state.project.reviewBy='Reviewer';state.logs['BH-S01'].spt=[{depth:-1,b1:1,b2:2,b3:3}];
  assert.match(build(state).text,/DRAFT - REVIEW REQUIRED/);
});
test('every page identifies its borehole and correct document page count',()=>{
  const {doc,drawn}=build(fixture('rock'));
  const count=doc.getNumberOfPages();
  for(let page=1;page<=count;page++)assert.ok(drawn.some(t=>t.page===page&&t.text.includes(`BH-R01 | Page ${page} of ${count}`)));
  assert.ok(drawn.every(t=>t.y<297&&t.y>=0),'no text anchors off the page');
});

test('field recovery inputs can be cleared and the draft is saved',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const html=fs.readFileSync(require.resolve('../geologger/field.html'),'utf8');
  const start=html.indexOf('["dDefSp","dTcr","dRqd"].forEach');
  const end=html.indexOf('m.querySelectorAll("[data-ex]")',start);
  const controls=Object.fromEntries(['dDefSp','dTcr','dRqd'].map(id=>[id,{value:'',addEventListener(event,callback){this.input=callback;}}]));
  const draft={defSpacing:'100',tcr:'90',rqd:'80'};let saves=0;
  vm.runInNewContext(html.slice(start,end),{m:{querySelector:selector=>controls[selector.slice(1)]},d:draft,debSave:()=>saves++});
  controls.dTcr.input();
  assert.deepEqual(draft,{defSpacing:'',tcr:'',rqd:''});assert.equal(saves,1);
});

test('all inline app scripts parse after logging changes',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  for(const file of ['index.html','field.html']){
    const html=fs.readFileSync(require.resolve('../geologger/'+file),'utf8');
    for(const [,attributes,code] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
      if(!/src=|application\/json|application\/ld\+json/.test(attributes))assert.doesNotThrow(()=>new vm.Script(code));
    }
  }
});
