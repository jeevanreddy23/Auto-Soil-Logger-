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

test("keeps material-only descriptions grammatical", () => {
  assert.equal(domain.soilDescription({ material: "CLAY" }), "CLAY");
  assert.equal(domain.soilDescription({ material: "Sandy CLAY", fillNatural: "FILL" }), "FILL: Sandy CLAY");
});

test("keeps a completely blank soil record in a not-started state", () => {
  const row = { from: "", to: "", material: "", description: "", descTouched: false };
  assert.equal(domain.classifySoilRow(row), "empty");
  assert.deepEqual(domain.soilDescriptionState(row), {
    kind: "empty",
    label: "Not started",
    generated: "",
    basis: domain.soilDescriptionBasis(row)
  });
  assert.equal(domain.classifySoilRow({ from: 0, material: "CLAY" }), "draft");
  assert.equal(domain.classifySoilRow({ from: 0, to: 1, material: "CLAY" }), "geology");
});

test("separates rock geology, core recovery and discontinuity records", () => {
  assert.equal(domain.classifyRockRow({}), "empty");
  assert.equal(domain.classifyRockRow({ from: 2, to: 11, tcr: 100, rqd: 99 }), "core-run");
  assert.equal(domain.classifyRockRow({ from: 2, to: 11, rockType: "SHALE" }), "geology");
  assert.equal(domain.classifyRockRow({ from: 2.09, to: 2.09, defectType: "Bedding parting" }), "defect");
  assert.equal(domain.classifyRockRow({ rockType: "SHALE" }), "draft");
});

test("counts only entered records in report summaries", () => {
  const counts = domain.reportCounts({
    soil: [{}, { from: 0, to: 1, material: "CLAY" }],
    rock: [
      {},
      { from: 1, to: 2, rockType: "SHALE" },
      { from: 2, to: 3, tcr: 100, rqd: 80 },
      { from: 2.2, to: 2.2, defectType: "Joint" }
    ]
  });
  assert.deepEqual(counts, { soil: 1, rock: 1, coreRuns: 1, defects: 1, drafts: 0 });
});

test("maps observed OpenGround lithologies without inventing an unknown pattern", () => {
  assert.equal(domain.lithologyPattern(""), "blank");
  assert.equal(domain.lithologyPattern("FILL: Silty SAND"), "crosshatch");
  assert.equal(domain.lithologyPattern("Silty CLAY"), "cohesive");
  assert.equal(domain.lithologyPattern("Clayey SAND"), "sand");
  assert.equal(domain.lithologyPattern("CLAYSTONE"), "claystone");
  assert.equal(domain.lithologyPattern("SHALE"), "shale");
  assert.equal(domain.lithologyPattern("SILTSTONE"), "siltstone");
  assert.equal(domain.lithologyPattern("Hawkesbury Sandstone"), "sandstone");
  assert.equal(domain.lithologyPattern("MYSTERY ROCK"), "blank");
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

test("keeps non-cored rock on the material log", () => {
  const rock = [{ from: 2.4, to: 6, rockType: "SHALE", weathering: "MW", strength: "M" }];
  const partition = domain.partitionRockForReport({ rock });
  assert.equal(partition.coreStart, null);
  assert.deepEqual(partition.material, rock);
  assert.deepEqual(partition.cored, []);
});

test("starts the cored template only where coring evidence begins", () => {
  const weatheredRock = { from: 1.8, to: 2, rockType: "CLAYSTONE" };
  const coreUnit = { from: 2, to: 11, rockType: "SHALE", tcr: 100, rqd: 99 };
  const partition = domain.partitionRockForReport({
    rock: [weatheredRock, coreUnit],
    corebox: { rows: [{ start: 2, end: 3 }, { start: 3, end: 4 }] }
  });
  assert.equal(partition.coreStart, 2);
  assert.deepEqual(partition.material, [weatheredRock]);
  assert.deepEqual(partition.cored, [coreUnit]);
});

test("uses an explicit coring requirement when legacy records have no metrics", () => {
  const rock = [{ from: 7.5, to: 10, rockType: "SHALE" }];
  assert.equal(domain.coringStartDepth({ borehole: { coreReq: true }, rock }), 7.5);
  assert.equal(domain.coringStartDepth({ project: { drillingMethod: "NMLC coring" }, rock }), 7.5);
});

test("splits a material interval that crosses the coring start without mutating source data", () => {
  const rock = [{ from: 1.8, to: 3, rockType: "SHALE" }];
  const partition = domain.partitionRockForReport({
    rock,
    corebox: { rows: [{ start: 2, end: 3 }] }
  });
  assert.deepEqual(partition.material, [{ from: 1.8, to: 2, rockType: "SHALE" }]);
  assert.deepEqual(partition.cored, [{ from: 2, to: 3, rockType: "SHALE" }]);
  assert.deepEqual(rock, [{ from: 1.8, to: 3, rockType: "SHALE" }]);
});
