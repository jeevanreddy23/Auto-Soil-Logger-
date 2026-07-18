const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "geologger", "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "geologger", "geoflow-premium.css"), "utf8");

test("assigns a stable high-contrast identity palette to boreholes", () => {
  const palette = html.match(/const DZ_BOREHOLE_TONES = \[([\s\S]*?)\n\];/);
  assert.ok(palette, "borehole palette should be declared");
  const colours = [...palette[1].matchAll(/line:"(#[0-9A-F]{6})"/g)].map((match) => match[1]);
  assert.ok(colours.length >= 8, "palette should distinguish larger investigation programs");
  assert.equal(new Set(colours).size, colours.length, "every borehole colour should be unique");
  assert.match(html, /function dzBhTone\(id\)/);
  assert.match(html, /S\.boreholes\.findIndex/);
});

test("uses borehole identity throughout every comparative tower graphic", () => {
  for (const renderer of ["dzProfileSVG", "dzDepthBarsSVG", "dzSptSVG", "dzIs50SVG", "dzCoverageSVG"]) {
    const start = html.indexOf(`function ${renderer}`);
    const end = html.indexOf("\nfunction ", start + 10);
    const source = html.slice(start, end < 0 ? undefined : end);
    assert.match(source, /dzBhTone\(/, `${renderer} should use the borehole palette`);
    assert.match(source, /data-bh-series/, `${renderer} should expose identifiable plotted series`);
  }
  assert.match(html, /DZ_BOREHOLE_DASHES/);
  assert.match(html, /stroke-dasharray=.*dzBhDash|const tone=dzBhTone\(id\), dash=dzBhDash\(id\)/);
});

test("keeps geological materials and status meaning separate from borehole colours", () => {
  assert.match(html, /strata:\{ FILL:/);
  assert.match(html, /Refusal[\s\S]*#9A5200/);
  assert.match(html, /dz-pill/);
  assert.match(html, /dzBoreholeLegend\(ids\)/);
});

test("renders labelled keys and coloured progress without relying on colour alone", () => {
  assert.match(html, /aria-label="Borehole colour key"/);
  assert.match(html, /class="dz-bh-key"/);
  assert.match(css, /\.dz-bh-legend-item/);
  assert.match(css, /\.dz-bh-key/);
  assert.match(css, /\.dz-progress-value/);
});
