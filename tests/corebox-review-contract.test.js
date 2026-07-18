const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "geologger", "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "geologger", "geoflow-premium.css"), "utf8");

test("turns defect review into a selectable list and editable detail workspace", () => {
  assert.match(html, /cb3-review-workspace/);
  assert.match(html, /cb3-review-list-pane/);
  assert.match(html, /cb3-review-editor-pane/);
  assert.match(html, /role="listbox"/);
  assert.match(html, /aria-selected/);
  assert.match(html, /id="drSearch"/);
});

test("allows factual defect attributes to be typed or selected", () => {
  for (const key of [
    "orientation",
    "persistence",
    "aperture",
    "apertureThk",
    "roughness",
    "shape",
    "infill",
    "infillHard",
    "weatherZone",
    "strengthZone",
    "spacing",
    "comments"
  ]) assert.match(html, new RegExp(`data-dr-key=\\"${key}\\"|data-dr-key=\\"\\$\\{key\\}\\"`));
  assert.match(html, /datalist id="dr-\$\{key\}-options"/);
  assert.match(html, /type="number" min="0" max="90" step="1"/);
  assert.match(html, /Type factual observations/);
});

test("tracks incomplete review details without blocking draft saves", () => {
  assert.match(html, /function cb3RequiredReviewFields/);
  assert.match(html, /function cb3MissingReviewFields/);
  assert.match(html, /Save draft/);
  assert.match(html, /Save &amp; mark reviewed/);
  assert.match(html, /missing\.length===0/);
  assert.match(html, /Approve complete/);
});

test("preserves custom typed values when defects sync to the rock log", () => {
  assert.match(html, /function cb3AttributeText/);
  assert.match(html, /row\.defectRough = cb3AttributeText/);
  assert.match(html, /row\.defectAperture = cb3AttributeText/);
  assert.match(html, /row\.defectPersist = cb3AttributeText/);
});

test("keeps the review editor usable on tablets and phones", () => {
  assert.match(css, /\.cb3-drawer[\s\S]*width: min\(1120px, 68vw\)/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.cb3-drawer[\s\S]*width: 100vw/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.cb3-review-workspace[\s\S]*grid-template-columns: 1fr/);
  assert.match(css, /\.cb3-review-form-body[\s\S]*overflow-y: auto/);
});
