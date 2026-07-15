const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "geologger", "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "geologger", "geoflow-motion.css"), "utf8");
const motion = fs.readFileSync(path.join(root, "geologger", "geoflow-motion.js"), "utf8");
const premium = fs.readFileSync(path.join(root, "geologger", "geoflow-premium.js"), "utf8");

test("loads the removable motion layer after the premium application", () => {
  assert.match(index, /geoflow-premium\.css[\s\S]*geoflow-motion\.css/);
  assert.match(index, /geoflow-premium\.js[\s\S]*geoflow-reports\.js[\s\S]*geoflow-motion\.js/);
});

test("uses the restrained 100 to 260 millisecond timing system", () => {
  assert.match(css, /--gf-motion-immediate:\s*100ms/);
  assert.match(css, /--gf-motion-small:\s*160ms/);
  assert.match(css, /--gf-motion-panel:\s*220ms/);
  assert.match(css, /--gf-motion-page:\s*260ms/);
  const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(declarations, /bounce|elastic|parallax|animated-gradient/i);
});

test("keeps technical entry workspaces free from page animation", () => {
  for (const id of ["page-soil", "page-rock", "page-corebox", "page-spt", "page-dcp"]) {
    assert.match(motion, new RegExp(`"${id}"`));
  }
  assert.doesNotMatch(css, /#(?:soilGrid|rockGrid|sptGrid|cbCanvas)[^{]*\{[^}]*animation/i);
  assert.doesNotMatch(motion, /setInterval/);
});

test("ties PDF loading feedback to the real iframe and never alters jsPDF", () => {
  assert.match(motion, /frame\.addEventListener\("load", complete/);
  assert.match(motion, /aria-busy/);
  assert.match(css, /\.sts-pdf-stage\.gf-pdf-loading::before/);
  assert.doesNotMatch(motion, /jsPDF|autoTable|generatePDF/);
});

test("supports reduced motion and validation record focus", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(motion, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(premium, /GeoFlowMotion\.revealRecord\(target\)/);
  assert.match(css, /tr\.gf-record-focus td/);
});
