const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "geologger", "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "geologger", "geoflow-fresh.css"), "utf8");

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map(value => parseInt(value, 16) / 255).map(value =>
    value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

test("loads the fresh visual system after the existing presentation layers", () => {
  const premium = html.indexOf('href="geoflow-premium.css"');
  const scope = html.indexOf('href="geoflow-scope.css"');
  const fresh = html.indexOf('href="geoflow-fresh.css"');
  const motion = html.indexOf('href="geoflow-motion.css"');
  assert.ok(premium > 0 && premium < scope && scope < fresh && fresh < motion);
});

test("uses crisp system typography and the required accessible canvas", () => {
  assert.match(css, /font-family:\s*-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif/);
  assert.match(css, /body\s*\{[^}]*line-height:\s*1\.6/si);
  assert.match(css, /-webkit-font-smoothing:\s*antialiased/);
  assert.match(css, /-moz-osx-font-smoothing:\s*grayscale/);
  assert.match(css, /text-rendering:\s*optimizeLegibility/);
  assert.match(css, /--fresh-ink:\s*#1a2332/);
  assert.match(css, /--fresh-canvas:\s*#f8f9fa/);
  assert.match(css, /html,\s*body\s*\{[^}]*overflow-x:\s*hidden/si);
  assert.doesNotMatch(css, /@import\s+url/i);
});

test("applies the elevated card and data-table system across the application", () => {
  assert.match(css, /--fresh-radius:\s*12px/);
  assert.match(css, /--fresh-shadow:\s*0 1px 3px rgba\(0, 0, 0, 0\.06\)/);
  assert.match(css, /table\.og th,[\s\S]*\.sts-data-table th\s*\{[\s\S]*padding:\s*0\.85rem 1rem;[\s\S]*background:\s*#1a2332;[\s\S]*color:\s*#ffffff;/);
  assert.match(css, /table\.og td,[\s\S]*\.sts-data-table td\s*\{[\s\S]*padding:\s*0\.85rem 1rem;/);
  assert.match(css, /tbody tr:hover td[\s\S]*background:\s*#f1f4f8/);
  assert.match(css, /\.grid-wrap,[\s\S]*border-radius:\s*var\(--fresh-radius\)/);
});

test("keeps every semantic badge palette above WCAG AA text contrast", () => {
  const palettes = [
    ["#166534", "#dcfce7"],
    ["#854d0e", "#fef3c7"],
    ["#991b1b", "#fee2e2"],
    ["#1e40af", "#dbeafe"]
  ];
  for (const [foreground, background] of palettes) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background} must meet WCAG AA`);
  }
  assert.ok(contrast("#1a2332", "#f8f9fa") >= 4.5);
  assert.ok(contrast("#526072", "#f8f9fa") >= 4.5);
  assert.ok(contrast("#5f6c7d", "#f8f9fa") >= 4.5);
  assert.ok(contrast("#ffffff", "#1a2332") >= 4.5);
});

test("renders Rock Logs with real metrics, statuses and accessible grid labels", () => {
  assert.match(html, /class="rock-stat-label">Total Logs</);
  assert.match(html, /class="rock-stat-label">Avg Depth</);
  assert.match(html, /class="rock-stat-label">RQD %</);
  assert.match(html, /class="status-badge success">Logging active/);
  assert.match(html, /class="status-badge warning">\$\{openRows\}/);
  assert.match(html, /class="status-badge danger">\$\{dataIssues\}/);
  assert.match(html, /role="list" aria-label="Rock log summary metrics"/);
  assert.match(html, /rockTable\.setAttribute\("aria-label"/);
  assert.match(html, /header\.setAttribute\("scope","col"\)/);
  assert.match(html, /setAttribute\("aria-invalid","true"\)/);
  assert.match(html, /id="rockSave">Save<\/button>/);
  assert.match(html, /getElementById\("rockSave"\)\.onclick/);
});
