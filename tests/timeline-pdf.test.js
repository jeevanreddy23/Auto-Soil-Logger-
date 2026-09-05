const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,build}=require('./helpers/pdf-harness');
const renderer=require('../geologger/geoflow-log-pdf');

test('the active renderer uses the standalone GeoFlow layout contract',()=>{
  assert.equal(renderer.layout.metres,5);assert.equal(renderer.layout.scale,30);
  const {doc,text}=build(fixture());
  assert.equal(doc.__qa.design,'geoflow-timeline-v1');
  assert.match(text,/MATERIAL RECORD/);assert.match(text,/TESTS & OBSERVATIONS/);
  assert.doesNotMatch(text,/BOREHOLE LOG|CLASSIFICATION SYMBOL|See explanation sheets/);
});
test('a sample at the final profile boundary remains in the detail register',()=>{
  const state=fixture(),log=state.logs['BH-S01'];
  log.samples.push({from:10,to:10,sid:'END-SAMPLE',type:'D'});
  assert.match(build(state).text,/END-SAMPLE/);
});
test('recovery zeroes and additional geological observations are preserved',()=>{
  const state=fixture('rock');const row=state.logs['BH-R01'].rock[0];
  row.tcr=0;row.rqd=0;row.remarks='Retain this field observation';
  const {text}=build(state);assert.match(text,/TCR 0% \/ RQD 0%/);assert.match(text,/Retain this field observation/);
});
