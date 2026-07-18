const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const tower = require("../geologger/geoflow-tower.js");
const root = path.resolve(__dirname, "..");

function stateFixture() {
  return {
    project: {
      projectNumber: "32917/9295D-G",
      projectName: "Tower T17 investigation",
      clientName: "STS Client",
      siteAddress: "Marsden Park, NSW",
      groundRL: 42.5,
      competentRockRule: { maxWeathering: "SW", minimumStrength: "M", minimumRqd: 50 }
    },
    boreholes: [
      {
        id: "BH01", plannedDepth: 12, termDepth: 9, rl: 42.5, easting: 312000, northing: 6251000,
        samplesReq: false, sptReq: true, coreReq: true, standpipeReq: true, checked: true
      },
      { id: "BH02", plannedDepth: 10, termDepth: 8, rl: 41.8, easting: 312020, samplesReq: true, sptReq: false, coreReq: false, standpipeReq: false }
    ],
    logs: {
      BH01: {
        soil: [
          { from: 0, to: 1.2, material: "FILL", description: "FILL: sandy clay" },
          { from: 1.2, to: 3.0, material: "CLAY", origin: "residual", description: "Residual clay" }
        ],
        rock: [
          { from: 3.0, to: 4.0, rockType: "SHALE", weathering: "HW", strength: "L", tcr: 80, scr: 50, rqd: 20 },
          { from: 4.0, to: 5.5, rockType: "SHALE", weathering: "SW", strength: "H", tcr: 97, scr: 88, rqd: 72, is50: 1.4 },
          { from: 6.0, to: 7.2, rockType: "SHALE", weathering: "FR", strength: "H", tcr: 100, scr: 95, rqd: 86 }
        ],
        spt: [], dcp: [], samples: [],
        groundwater: [{ state: "Not encountered", depth: 5.5, date: "2026-07-14" }],
        gw: {}, corebox: { defects: [] }
      },
      BH02: {
        soil: [{ from: 0, to: 2, material: "FILL", status: "Field entered" }],
        rock: [], spt: [], dcp: [], samples: [], groundwater: [], gw: {}, corebox: { defects: [] }
      }
    }
  };
}

test("converts depth to RL without manufacturing values", () => {
  assert.equal(tower.depthToRl(3.25, 42.5), 39.25);
  assert.equal(tower.depthToRl("", 42.5), null);
  assert.equal(tower.depthToRl(3.25, ""), null);
});

test("classifies explicit fill and residual soil independently", () => {
  assert.equal(tower.classifySoil({ fillNatural: "FILL", material: "Sandy CLAY" }), "FILL");
  assert.equal(tower.classifySoil({ origin: "residual", material: "CLAY" }), "RESIDUAL");
  assert.equal(tower.classifySoil({ material: "TOPSOIL" }), "TOPSOIL");
  assert.equal(tower.classifySoil({ material: "SAND" }), "NATURAL");
});

test("derives rockhead from factual rock and competent rock only from a configured rule", () => {
  const state = stateFixture();
  const depths = tower.extractCriticalDepths(state, "BH01");
  assert.equal(depths.fillBase, 1.2);
  assert.equal(depths.residualBase, 3);
  assert.equal(depths.rockhead, 3);
  assert.equal(depths.competentRock, 4);
  assert.equal(depths.termination, 9);

  delete state.project.competentRockRule;
  const withoutRule = tower.extractCriticalDepths(state, "BH01");
  assert.equal(withoutRule.rockhead, 3);
  assert.equal(withoutRule.competentRock, null);
  assert.equal(withoutRule.competentRule.configured, false);
});

test("coverage distinguishes complete, missing, not-required and no-data states", () => {
  const state = stateFixture();
  const rows = tower.coverageRows(state, [{ id: "report-BH01", name: "log-BH01.pdf" }]);
  const bh01 = rows.find((row) => row.id === "BH01");
  const bh02 = rows.find((row) => row.id === "BH02");
  assert.equal(bh01.cells.actual.status, "complete");
  assert.equal(bh01.cells.spt.status, "missing");
  assert.equal(bh01.cells.samples.status, "not-required");
  assert.equal(bh01.cells.core.status, "complete");
  assert.equal(bh01.cells.groundwater.status, "complete");
  assert.equal(bh01.cells.reviewed.status, "complete");
  assert.equal(bh01.cells.pdf.status, "complete");
  assert.equal(bh02.cells.location.status, "missing");
  assert.equal(bh02.cells.spt.status, "not-required");
  assert.equal(bh02.cells.groundwater.status, "not-required");
  assert.equal(bh02.cells.reviewed.status, "missing");
});

test("keeps refusal and hammer-bounce states separate from numerical SPT values", () => {
  const state = stateFixture();
  state.logs.BH01.spt = [
    { depth: 1.5, b1: 4, b2: 6, b3: 7 },
    { depth: 3.0, refusal: true, remarks: "50/40 mm" },
    { depth: 4.5, hammerBounce: true }
  ];
  const points = tower.sptPoints(state, "BH01");
  assert.equal(points[0].n, 13);
  assert.equal(points[0].result.status, "Complete");
  assert.equal(points[1].n, null);
  assert.equal(points[1].result.status, "Refusal");
  assert.equal(points[2].result.status, "Hammer bounce");
});

test("does not turn dry or not-encountered groundwater states into a water level", () => {
  const negative = tower.groundwaterState({ groundwater: [{ state: "Not encountered", depth: 5.5 }], gw: {} });
  assert.equal(negative.category, "not-encountered");
  assert.equal(negative.depth, null);
  const missing = tower.groundwaterState({ groundwater: [], gw: {} });
  assert.equal(missing.category, "no-data");
  assert.equal(missing.state, "Not recorded");
});

test("keeps core runs discrete and preserves unlogged gaps", () => {
  const state = stateFixture();
  const runs = tower.coreRuns(state, "BH01");
  assert.deepEqual(runs.map((run) => [run.from, run.to]), [[3, 4], [4, 5.5], [6, 7.2]]);
  assert.equal(runs[1].rqd, 72);
  assert.equal(runs[2].from - runs[1].to, 0.5);
});

test("defaults engineering plots to reviewed records and exposes draft records only explicitly", () => {
  const state = stateFixture();
  const reviewedOnly = tower.aggregateTower(state, { includeDraft: false }, []);
  assert.equal(reviewedOnly.intervals.BH01.length, 5);
  assert.equal(reviewedOnly.intervals.BH02.length, 0);
  const withDraft = tower.aggregateTower(state, { includeDraft: true }, []);
  assert.equal(withDraft.intervals.BH02.length, 1);
});

test("loads the Tower module after the premium shell and keeps the route scoped", () => {
  const html = fs.readFileSync(path.join(root, "geologger", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "geologger", "geoflow-tower.css"), "utf8");
  const source = fs.readFileSync(path.join(root, "geologger", "geoflow-tower.js"), "utf8");
  assert.ok(html.indexOf('src="geoflow-tower.js"') > html.indexOf('src="geoflow-premium.js"'));
  assert.match(source, /data-tower-route="tower"/);
  assert.match(source, /Exact logged intervals only/);
  assert.match(source, /Rule not configured/);
  assert.match(source, /No groundwater surface has been inferred/);
  assert.match(css, /#page-dashboard \.tower-workspace/);
  assert.doesNotMatch(css, /font-size\s*:[^;{}]*vw/);
});
