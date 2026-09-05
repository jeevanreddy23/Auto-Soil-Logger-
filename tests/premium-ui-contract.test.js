const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const premium = fs.readFileSync(path.join(root, "geologger", "geoflow-premium.js"), "utf8");
const reports = fs.readFileSync(path.join(root, "geologger", "geoflow-reports.js"), "utf8");
const css = fs.readFileSync(path.join(root, "geologger", "geoflow-premium.css"), "utf8");
const html = fs.readFileSync(path.join(root, "geologger", "index.html"), "utf8");

test("loads the premium UI modules after the existing application shell", () => {
  const coreIndex = html.lastIndexOf('<script src="geoflow-ui-core.js"></script>');
  const premiumIndex = html.lastIndexOf('<script src="geoflow-premium.js');
  const reportsIndex = html.lastIndexOf('<script src="geoflow-reports.js');
  assert.ok(coreIndex > 0);
  assert.ok(coreIndex < premiumIndex);
  assert.ok(premiumIndex < reportsIndex);
});

test("keeps heavy report generation behind an explicit preview or generate action", () => {
  const renderBody = reports.slice(reports.indexOf("function renderReports"), reports.indexOf("function ensureGenerated"));
  assert.doesNotMatch(renderBody, /buildPdf\s*\(/);
  assert.match(reports, /function ensureGenerated[\s\S]*buildPdf\(row\.boreholeId\)/);
});

test("registers all premium routes and renders the corrected borehole depth profile", () => {
  for (const route of ["bh-overview", "dcp", "groundwater", "site-map", "documents", "team", "validation"]) {
    assert.match(premium, new RegExp(`(?:^|[\\s\"'])${route.replace("-", "\\-")}(?:[\\s\"',]|$)`));
  }
  assert.match(premium, /const profileDepth = Math\.max\(1, Core\.maxBoreholeDepth/);
  assert.match(premium, /Math\.ceil\(profileDepth\)/);
  assert.doesNotMatch(premium, /Math\.ceil\(maxDepth\)/);
});

test("uses local pinned PDF, spreadsheet, document, font and icon dependencies", () => {
  for (const asset of ["xlsx.full.min.js", "jspdf.umd.min.js", "jspdf.plugin.autotable.min.js", "pdf.min.js", "pdf.worker.min.js", "mammoth.browser.min.js", "lucide.min.js", "Carlito-Regular.ttf", "Carlito-Bold.ttf"]) {
    assert.ok(fs.existsSync(path.join(root, "geologger", "vendor", asset)), asset);
  }
  assert.doesNotMatch(html, /cdnjs\.cloudflare\.com/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net/);
});

test("removes closed validation dialogs from keyboard and assistive-technology navigation", () => {
  assert.match(premium, /drawer\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(premium, /drawer\.inert = true/);
  assert.match(premium, /validationReturnFocus\.focus\(\)/);
});

test("keeps the report toolbar in view and provides responsive report layouts", () => {
  assert.match(css, /\.sts-report-preview \{ height: calc\(100dvh/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.sts-pdf-stage \{ grid-template-columns: 1fr; \}/);
  assert.doesNotMatch(css, /font-size\s*:[^;{}]*vw/);
});

test("shows honest Microsoft 365 configuration without client-side connection claims", () => {
  assert.match(premium, /Microsoft 365/);
  assert.match(premium, /Cloudflare remains the active project file service/);
  assert.match(premium, /Microsoft credentials are not stored in this client/);
  assert.match(premium, /Requires a server-side Microsoft 365 connector/);
});
