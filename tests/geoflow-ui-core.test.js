const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../geologger/geoflow-ui-core.js");

function projectState(overrides = {}) {
  return Object.assign({
    project: { projectNumber: "32917", clientName: "STS Client", siteAddress: "Marsden Park", loggedBy: "JR" },
    boreholes: [{ id: "BH01", plannedDepth: 10, termDepth: "" }],
    logs: {
      BH01: {
        soil: [{ from: 0, to: 1.5, material: "FILL" }, { from: 1.5, to: 3, material: "CLAY" }],
        rock: [], spt: [], dcp: [], samples: [], groundwater: [], gw: { state: "Not observed" }, corebox: {}
      }
    },
    activeBh: "BH01"
  }, overrides);
}

test("keeps untouched SPT and DCP placeholders out of validation", () => {
  const state = projectState();
  state.logs.BH01.spt = [{ depth: "", b1: "", b2: "", b3: "", refusal: false, hb: false }];
  state.logs.BH01.dcp = [{ incrementMm: "", blows: "", refusal: false, remarks: "" }];
  const issues = core.collectValidation(state);
  assert.equal(issues.some(issue => issue.area === "SPT"), false);
  assert.equal(issues.some(issue => issue.area === "DCP"), false);
});

test("validates interval gaps and overlaps with stable navigation metadata", () => {
  const rows = [{ from: 0, to: 1, material: "FILL" }, { from: 1.2, to: 2, material: "CLAY" }, { from: 1.8, to: 3, material: "SAND" }];
  const original = structuredClone(rows);
  const issues = core.intervalIssues(rows, { area: "Soil", nav: "soil", boreholeId: "BH07", keys: ["material"] });
  assert.deepEqual(issues.map(issue => issue.code), ["interval-gap", "interval-overlap"]);
  assert.equal(issues[0].boreholeId, "BH07");
  assert.equal(issues[0].nav, "soil");
  assert.deepEqual(rows, original);
});

test("does not classify point defects as zero-length rock intervals", () => {
  const state = projectState();
  state.logs.BH01.rock = [{ from: 4.2, to: 4.2, defectType: "Joint", defectAngle: 45 }];
  const issues = core.collectValidation(state);
  assert.equal(issues.some(issue => issue.area === "Rock" && issue.code === "interval-order"), false);
});

test("flags SPT N mismatches but accepts derived increments", () => {
  const state = projectState();
  state.logs.BH01.spt = [{ depth: 1.5, b1: 4, b2: 6, b3: 7, n: 12 }];
  let issue = core.collectValidation(state).find(candidate => candidate.code === "spt-n");
  assert.match(issue.message, /calculate N=13/);
  state.logs.BH01.spt[0].n = 13;
  issue = core.collectValidation(state).find(candidate => candidate.code === "spt-n");
  assert.equal(issue, undefined);
});

test("builds a cumulative DCP profile and infers increments from explicit depths", () => {
  const profile = core.dcpProfile([
    { incrementMm: 100, blows: 3 },
    { incrementMm: 150, blows: 7 },
    { from: 0.25, to: 0.45, blows: 12 }
  ]);
  assert.deepEqual(profile.map(point => [point.from, point.to, point.incrementMm]), [
    [0, 0.1, 100], [0.1, 0.25, 150], [0.25, 0.45, 200]
  ]);
  assert.equal(profile.every(point => point.hasData), true);
});

test("blocks approval state for factual errors and recognises Cloudflare report files", () => {
  const state = projectState();
  state.logs.BH01.soil[1].from = 1.4;
  let row = core.reportRows(state, [])[0];
  assert.equal(row.status, "Draft");
  assert.equal(row.blockers.some(issue => issue.code === "interval-overlap"), true);

  state.logs.BH01.soil[1].from = 1.5;
  row = core.reportRows(state, [{ id: "report-BH01", name: "log-BH01.pdf", ts: "2026-07-14T01:00:00Z" }])[0];
  assert.equal(row.status, "Ready");
  assert.equal(row.blockers.length, 0);
  assert.equal(row.generatedDate, "2026-07-14T01:00:00Z");
});

test("detects records below final borehole depth", () => {
  const state = projectState();
  state.boreholes[0].termDepth = 2.5;
  const issue = core.collectValidation(state).find(candidate => candidate.code === "termination-depth");
  assert.equal(issue.boreholeId, "BH01");
  assert.equal(issue.depth, 2.5);
});

test("summarises project operations from real records", () => {
  const state = projectState();
  state.logs.BH01.spt = [{ depth: 1.5, b1: 4, b2: 6, b3: 7 }];
  state.logs.BH01.samples = [{ sid: "BH01-S01", from: 1.5, to: 1.95 }];
  const metrics = core.projectMetrics(state);
  assert.equal(metrics.boreholes, 1);
  assert.equal(metrics.logged, 1);
  assert.equal(metrics.spt, 1);
  assert.equal(metrics.samples, 1);
  assert.equal(metrics.progress, 100);
  assert.equal(metrics.depth, 3);
});

test("separates logged depth from planned depth", () => {
  const state = projectState();
  assert.equal(core.loggedBoreholeDepth(state, "BH01"), 3);
  assert.equal(core.maxBoreholeDepth(state, "BH01"), 10);
});

test("includes cumulative DCP increments in logged borehole depth", () => {
  const state = projectState();
  state.logs.BH01.soil = [];
  state.logs.BH01.dcp = [{ incrementMm: 100, blows: 4 }, { incrementMm: 150, blows: 7 }];
  assert.equal(core.loggedBoreholeDepth(state, "BH01"), 0.25);
  assert.equal(core.boreholeStatus(state, "BH01"), "Field testing");
});

test("formats explicit sync states without claiming a confirmed save", () => {
  assert.equal(core.syncStateFromLabel("synced", true).id, "synced");
  assert.equal(core.syncStateFromLabel("local only", true).id, "failed");
  assert.equal(core.syncStateFromLabel("synced", false).id, "offline");
  assert.equal(core.syncStateFromLabel("", true).id, "unknown");
});

test("search ranks exact borehole identifiers ahead of incidental matches", () => {
  const state = projectState();
  state.boreholes.push({ id: "BH010", plannedDepth: 12 });
  state.logs.BH010 = { soil: [], rock: [], spt: [], samples: [] };
  const items = core.buildSearchItems({ state, projects: [{ pid: "p1", number: "BH01 contract", name: "Marsden Park" }] });
  const result = core.searchItems(items, "BH01", 5);
  assert.equal(result[0].id, "borehole:BH01");
});
