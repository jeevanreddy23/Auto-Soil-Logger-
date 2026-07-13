const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../geologger/index.html"), "utf8");
const pdfScript = /<script id="pdf-v3">([\s\S]*?)<\/script>/.exec(html)?.[1] || "";

test("PDF fields remain blank until factual values are entered", () => {
  assert.doesNotMatch(pdfScript, /String\(v\|\|"-"\)/);
  assert.doesNotMatch(pdfScript, /P\.inclination\?P\.inclination\+" deg":"90 deg"/);
  assert.doesNotMatch(pdfScript, /coreMethod \? coreMethod\.split\(" "\)\[0\] : "CORE"/);
  assert.doesNotMatch(pdfScript, /r\.rockType\|\|"(?:BEDROCK|SILTSTONE)"/);
  assert.doesNotMatch(pdfScript, /RQD clamped|reversed interval .* corrected/);
});

test("PDF graphics use the shared observed lithology catalogue", () => {
  assert.match(pdfScript, /GeoFlowDomain\.lithologyPattern\(m\)/);
  assert.match(pdfScript, /r\.fillNatural==="FILL"\?"FILL":r\.material/);
  assert.doesNotMatch(pdfScript, /generic diagonal/);
});

test("cored recovery and crowded defects stay inside their report columns", () => {
  assert.match(pdfScript, /Recovery values are bounded and vertical/);
  assert.match(pdfScript, /labelYs\.at\(-1\)>bodyB-1\.2/);
});

test("opening soil and rock pages does not create placeholder rows", () => {
  assert.doesNotMatch(html, /if \(!L\.soil\.length\) L\.soil\.push\(blankSoil\(\)\)/);
  assert.doesNotMatch(html, /if \(!L\.rock\.length\) L\.rock\.push\(blankRock\(\)\)/);
});

test("changing the report borehole refreshes its side-panel summary", () => {
  assert.match(
    html,
    /document\.getElementById\("reportBh"\)\.onchange[\s\S]*?previewCurrent\(\); refreshLeftPanel\(\); refreshValidation\(\);/
  );
  assert.doesNotMatch(html, /auto-corrected on PDF/);
});
