const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Domain = require('../../geologger/geoflow-domain.js');
const Core = require('../../geologger/geoflow-ui-core.js');
const { jsPDF } = require('../../geologger/vendor/jspdf.umd.min.js');
const html = fs.readFileSync(path.join(__dirname, '../../geologger/index.html'), 'utf8');

function fixture(kind='soil') {
  const rock = kind === 'rock';
  const id = rock ? 'BH-R01' : 'BH-S01';
  return {
    project: { projectNumber:'DEMONSTRATION', clientName:'GeoFlow sample output - fictional data', siteAddress:'Design verification only', loggedBy:'Demo', dateInvestigation:'5 September 2026', drillingContractor:'Example drilling contractor', drillRig:'Example rig', drillBit:rock?'NMLC':'Auger', drillingMethod:rock?'NMLC coring':'Auger', holeDia:100, inclination:90, datum:'AHD', groundRL:42.5 },
    boreholes:[{id,termDepth:rock?20:10,termReason:'Target depth reached',coreReq:rock}],
    logs:{[id]:{
      soil:rock?[]:[
        {from:0,to:0.25,material:'TOPSOIL',description:'TOPSOIL: Silty CLAY: low plasticity, dark brown, trace rootlets and fine gravel. Moist, with an irregular lower boundary. This thin interval retains its complete description in the detail register.',moisture:'moist'},
        {from:0.25,to:3,material:'Silty CLAY',description:'Silty CLAY: medium plasticity, brown mottled grey, trace fine gravel.',uscs:'CI',consistency:'stiff',moisture:'moist'},
        {from:3,to:10,material:'Clayey SAND',description:'Clayey SAND: fine to medium grained, pale grey, with low plasticity clay.',uscs:'SC',consistency:'dense',moisture:'wet'}],
      rock:rock?[
        {from:0,to:12,rockType:'SANDSTONE',description:'SANDSTONE: fine to medium grained, pale grey, slightly weathered, medium strength; bedding dips at 15 degrees.',weathering:'SW',strength:'M',tcr:98,rqd:75},
        {from:12,to:20,rockType:'SHALE',description:'SHALE: dark grey, thinly laminated, fresh, high strength.',weathering:'FR',strength:'H',tcr:100,rqd:88},
        {from:2.4,to:2.4,defectType:'Joint',defectAngle:35,defectRough:'rough',defectInfill:'clean'},
        {from:2.7,to:2.7,defectType:'Mechanical break'},
        {from:12.4,to:12.4,defectType:'Bedding parting',defectAngle:15,defectRough:'smooth',defectInfill:'clay veneer'}]:[],
      samples:[{sid:`${id}-D-01`,from:rock?1:0.5,to:rock?1.2:0.7,type:'D'}],
      spt:rock?[]:[{depth:1.5,b1:4,b2:6,b3:7,n:'13'},{depth:6,b1:20,b2:35,p1:150,p2:70,refusal:true,n:'R'}],
      dcp:[],corebox:{},gw:{state:'Observed',depth:rock?0:2.2}
    }}
  };
}

function build(state) {
  let drawn=[];
  const context={S:state, GeoFlowDomain:Domain, GeoFlowUICore:Core, window:{jspdf:{jsPDF:function(options){
    const doc=new jsPDF(options), original=doc.text.bind(doc);
    doc.text=(text,x,y,...args)=>{drawn.push({text:Array.isArray(text)?text.join('\n'):String(text),x,y,page:doc.getCurrentPageInfo().pageNumber,size:doc.getFontSize()});return original(text,x,y,...args);};
    return doc;
  }}}, num:Domain.numberOrNull, soilDescription:Domain.soilDescription,rockDescription:r=>r.description||r.rockType||'', setStatus:()=>{},calcN:r=>Domain.deriveSpt(r).n, console, localStorage:{getItem:()=>null}, validate:()=>({errs:[],warns:[]})};
  vm.createContext(context);
  vm.runInContext(/var STS_LOGO = "[^"]*";/.exec(html)[0],context);
  const constants=html.slice(html.indexOf('const CONS_ABBR'),html.indexOf('function buildPdf',html.indexOf('const CONS_ABBR')));
  vm.runInContext(constants,context);
  vm.runInContext(/<script id="pdf-v3">([\s\S]*?)<\/script>/.exec(html)[1],context);
  context.sptLine2=Domain.formatSptLine;
  const before=JSON.stringify(state);
  const doc=context.buildPdf(state.boreholes[0].id);
  if (JSON.stringify(state)!==before) throw Error('PDF generation changed source observations');
  return {doc,drawn,text:drawn.map(t=>t.text).join('\n')};
}
module.exports={fixture,build};
