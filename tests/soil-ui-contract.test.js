const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.resolve(__dirname, "..", "geologger", "index.html"), "utf8");
const premium = fs.readFileSync(path.resolve(__dirname, "..", "geologger", "geoflow-premium.js"), "utf8");
const soilColumns = html.match(/const SOIL_COLS = \[([\s\S]*?)\n\];/)[1];

test("keeps auxiliary testing columns out of the Soil Logs grid", () => {
  for (const key of ["samples", "sptN", "dcp", "envNotes", "remarks"]) {
    assert.doesNotMatch(soilColumns, new RegExp(`key:\"${key}\"`));
  }
  assert.match(soilColumns, /key:"description",label:"AS 1726 description/);
});

test("preserves existing values and the dedicated testing modules", () => {
  assert.match(html, /function blankSoil\([^)]*\).*samples:"", sptN:"", dcp:"", envNotes:"", remarks:""/);
  assert.match(html, /function renderSPT\(/);
  assert.match(html, /function renderSamples\(/);
  assert.match(premium, /function renderDcp\(/i);
});

test("uses the requested primary material vocabulary", () => {
  const materials = html.match(/const SOIL_MATERIALS = \[([^\]]+)\];/)[1];
  for (const material of ["CONCRETE", "SHALE", "SANDSTONE", "SILTSTONE"]) {
    assert.match(materials, new RegExp(`"${material}"`));
  }
  for (const removed of ["FILL", "TOPSOIL", "Residual soil"]) {
    assert.doesNotMatch(materials, new RegExp(`"${removed}"`));
  }
  assert.match(soilColumns, /key:"material",label:"Primary"/);
});
