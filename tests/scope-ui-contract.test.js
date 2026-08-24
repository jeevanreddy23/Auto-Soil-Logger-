const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "geologger", "index.html"), "utf8");
const scope = fs.readFileSync(path.join(root, "geologger", "geoflow-scope.js"), "utf8");
const css = fs.readFileSync(path.join(root, "geologger", "geoflow-scope.css"), "utf8");
const extractor = fs.readFileSync(path.join(root, "geologger", "geoflow-scope-extractor.js"), "utf8");

test("loads the scope presentation layer after premium and before optional motion", () => {
  const premiumCss = html.lastIndexOf('href="geoflow-premium.css"');
  const scopeCss = html.lastIndexOf('href="geoflow-scope.css"');
  const motionCss = html.lastIndexOf('href="geoflow-motion.css"');
  const reportsJs = html.lastIndexOf('src="geoflow-reports.js"');
  const scopeJs = html.lastIndexOf('src="geoflow-scope.js"');
  const motionJs = html.lastIndexOf('src="geoflow-motion.js"');
  assert.ok(premiumCss > 0 && premiumCss < scopeCss && scopeCss < motionCss);
  assert.ok(reportsJs > 0 && reportsJs < scopeJs && scopeJs < motionJs);
});

test("loads the proposal extractor before the inline scope workflow", () => {
  const extractorJs = html.indexOf('src="geoflow-scope-extractor.js"');
  const inlineScope = html.indexOf('<script id="v13-scope">');
  assert.ok(extractorJs > 0 && extractorJs < inlineScope);
  assert.match(html, /GeoFlowScopeExtractor\.extract\(SC\(\)\.docs\)/);
  assert.match(extractor, /terms\\s\+of\\s\+agreement/);
});

test("uses DeepSeek only as an explicit, privacy-disclosed review layer", () => {
  assert.match(html, /Review the extracted candidates with DeepSeek/);
  assert.match(html, /The PDF file itself is not sent/);
  assert.match(html, /reviewScopeWithDeepSeek\(localItems\)/);
  assert.match(html, /local extraction has been kept/);
});

test("preserves the exact five-stage STS workflow", () => {
  for (const label of [
    "Upload Proposal",
    "Extract Scope",
    "Review & Confirm",
    "Generate Field Plan",
    "Send to Control Tower"
  ]) assert.match(scope, new RegExp(label.replace(/[&]/g, "&")));
  assert.match(scope, /STEP_LABELS/);
  assert.match(scope, /role", "tablist"/);
  assert.match(scope, /aria-selected/);
});

test("enhances the legacy renderer without replacing scope data contracts", () => {
  assert.match(scope, /const legacyRenderScope = root\.renderScope/);
  assert.match(scope, /legacyRenderScope\(\)/);
  assert.match(scope, /new MutationObserver/);
  assert.doesNotMatch(scope, /S\.scope\s*=/);
  assert.doesNotMatch(scope, /localStorage\.setItem/);
});

test("keeps the default UI honest and free from fabricated project data", () => {
  assert.match(scope, /No scope item selected/);
  assert.match(scope, /Evidence is empty until scope items exist/);
  assert.doesNotMatch(scope, /BH-?0?1|32917|42 Items|150\.0|Estimated Yield|Report Readiness/);
});

test("uses structural responsive layouts instead of shrinking desktop tables", () => {
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /\.sts-scope-register table,[\s\S]*display: block/);
  assert.match(css, /flex-wrap: nowrap/);
  assert.match(css, /min-height: 44px/);
  assert.doesNotMatch(css, /font-size\s*:[^;{}]*vw/);
});

test("keeps visual styling restrained and accessible", () => {
  assert.match(css, /var\(--gf-green-action\)/);
  assert.match(css, /var\(--gf-border\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|glassmorphism|backdrop-filter/i);
});
