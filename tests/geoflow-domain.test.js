const test = require("node:test");
const assert = require("node:assert/strict");
const domain = require("../geologger/geoflow-domain.js");

test("derives a normal SPT N-value and end depth", () => {
  const result = domain.deriveSpt({ depth: 1.5, b1: 4, b2: 6, b3: 7 });
  assert.equal(result.n, "13");
  assert.equal(result.status, "valid");
  assert.equal(result.endDepth, 1.95);
  assert.equal(domain.formatSptLine({ depth: 1.5, b1: 4, b2: 6, b3: 7 }), "4,6,7 N=13");
});

test("preserves legacy full-penetration rows without new penetration fields", () => {
  const result = domain.deriveSpt({ depth: "3", b1: "5", b2: "8", b3: "9", n: "17" });
  assert.deepEqual(result.penetrations, [150, 150, 150]);
  assert.equal(result.n, "17");
  assert.deepEqual(domain.sptIssues({ depth: "3", b1: "5", b2: "8", b3: "9", n: "17" }), []);
});

test("reports partial penetration as refusal instead of an ordinary N-value", () => {
  const row = { depth: 4.5, b1: 18, b2: 35, b3: 12, p1: 150, p2: 150, p3: 65, hb: true };
  const result = domain.deriveSpt(row);
  assert.equal(result.n, "R");
  assert.equal(result.status, "hammer-bounce");
  assert.equal(domain.formatSptLine(row), "18,35,12/65 HB N=R");
});

test("keeps a complete hammer-bounce observation with its derived N-value", () => {
  const row = { depth: 6, b1: 20, b2: 31, b3: 17, hb: true };
  const result = domain.deriveSpt(row);
  assert.equal(result.n, "48");
  assert.equal(result.status, "hammer-bounce");
  assert.equal(domain.formatSptLine(row), "20,31,17 HB N=48");
});

test("rejects invalid and incomplete SPT increments", () => {
  assert.equal(domain.deriveSpt({ depth: 1, b2: -1, b3: 4 }).status, "invalid");
  assert.equal(domain.deriveSpt({ depth: 1, b2: 5 }).status, "incomplete");
  assert.equal(domain.sptIssues({ depth: 1, b2: 5 })[0].severity, "error");
});

test("tracks structured, manual and out-of-sync soil descriptions", () => {
  const row = { material: "Silty CLAY", plasticity: "medium plasticity", colour: "grey" };
  assert.equal(domain.soilDescriptionState(row).kind, "structured");
  row.description = "Operator wording";
  row.descTouched = true;
  row.descBasis = domain.soilDescriptionBasis(row);
  assert.equal(domain.soilDescriptionState(row).kind, "manual");
  row.colour = "brown";
  assert.equal(domain.soilDescriptionState(row).kind, "out-of-sync");
});

test("uses the primary soil fraction for cohesive versus granular behavior", () => {
  assert.equal(domain.isGranular("Sandy CLAY"), false);
  assert.equal(domain.isGranular("Clayey SAND"), true);
  assert.equal(domain.isGranular("Silty GRAVEL"), true);
  assert.equal(domain.isGranular("Sandy SILT"), false);
});

test("finds interval gaps and overlaps without changing the rows", () => {
  const rows = [{ from: 0, to: 1 }, { from: 1.2, to: 2 }, { from: 1.8, to: 3 }];
  const issues = domain.intervalIssues(rows);
  assert.deepEqual(issues.map(issue => issue.severity), ["warning", "error"]);
  assert.deepEqual(rows, [{ from: 0, to: 1 }, { from: 1.2, to: 2 }, { from: 1.8, to: 3 }]);
});
