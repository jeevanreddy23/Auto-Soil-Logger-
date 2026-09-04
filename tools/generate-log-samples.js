// Reproducible fictional samples generated with the application's actual PDF engine.
const fs=require('node:fs');
const path=require('node:path');
const {fixture,build}=require('../tests/helpers/pdf-harness');
const output=path.join(__dirname,'../output/pdf');
fs.mkdirSync(output,{recursive:true});
for(const kind of ['soil','rock']){
  const {doc}=build(fixture(kind));
  const target=path.join(output,`geoflow-${kind}-log.pdf`);
  fs.writeFileSync(target,Buffer.from(doc.output('arraybuffer')));
  console.log(JSON.stringify({file:target,...doc.__qa}));
}
