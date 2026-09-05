const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const W=require('../geologger/geoflow-workflow');
function harness(fetch){
 const source={project:{loggedBy:'Demo'},boreholes:[{id:'BH1'}],logs:{BH1:{}}};
 const context={S:source,document:{readyState:'loading',getElementById:()=>null,addEventListener(){}},URL:{createObjectURL:()=>'',revokeObjectURL(){}},AbortController,fetch,location:{hash:''},buildPdf:()=>({output:()=> 'mock-pdf',getNumberOfPages:()=>1}),pjSyncKey:()=>context.S===source?'original':'other',save(){},window:{GeoFlowUICore:{},GeoFlowWorkflow:W,GeoFlowPremium:{toast(){}}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('geologger/geoflow-reports.js','utf8'),context);return {context,source,api:context.window.GeoFlowReports};
}
const row={id:'report-BH1',boreholeId:'BH1',name:'BH1'};
test('failed cloud save leaves report metadata unchanged',async()=>{const {api,source}=harness(async()=>({ok:false,status:500}));const before=JSON.stringify(source);await assert.rejects(api.generateAndSave(row),/500/);assert.equal(JSON.stringify(source),before);});
test('successful save records the source used to generate the PDF',async()=>{const {api,source}=harness(async()=>({ok:true,json:async()=>({files:[]})}));const expected=W.sourceKey(source,'BH1');await api.generateAndSave(row);assert.equal(source.reportMeta.BH1.sourceKey,expected);assert.ok(source.reportMeta.BH1.generatedDate);});
test('project switch while saving cannot mark the destination project complete',async()=>{let finish;let sent;const {api,context,source}=harness((url,options)=>{sent=JSON.parse(options.body);return new Promise(resolve=>{finish=resolve;});});const pending=api.generateAndSave(row);context.S={project:{},boreholes:[],logs:{}};finish({ok:true});await pending;assert.equal(sent.project,'original');assert.equal(context.S.reportMeta,undefined);assert.equal(source.reportMeta,undefined);});
