const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const sync = require(path.resolve(__dirname, "..", "geologger", "geoflow-scope-boreholes.js"));

function blankBorehole(id) {
  return {
    id, plannedDepth: "", planned: "", termDepth: "", termReason: "",
    startDate: "", endDate: "", rl: "", easting: "", northing: "",
    surface: "", locationDesc: "", samplesReq: true, sptReq: true,
    dcpReq: false, gwReq: false, coreReq: false, standpipeReq: false, photoReq: false
  };
}

function blankLogs() {
  return { soil: [], rock: [], spt: [], samples: [], dcp: [], corebox: { img: null, defects: [] } };
}

function plan() {
  const bhs = [1, 2, 3].map(number => ({ id: `BH0${number}`, depth: 6, refusal: true }));
  return {
    bhs,
    spt: [],
    dcp: { qty: 3, perBorehole: true },
    samples: [{ type: "Aggressivity samples", qty: 3, note: "One per borehole" }],
    labs: [{ test: "Aggressivity testing", qty: 3 }],
    gw: bhs.map(row => ({ bh: row.id, task: "Record groundwater strike / standing level" })),
    core: null
  };
}

test("approval creates every scoped borehole with compatible depth and requirements", () => {
  const state = { boreholes: [blankBorehole("BH01")], logs: { BH01: blankLogs() }, activeBh: "BH01" };
  const result = sync.materialise(state, plan(), {
    blankBorehole,
    blankLogs,
    source: "proposal.pdf",
    approvedAt: "2026-08-24T00:00:00.000Z",
    version: 1
  });

  assert.deepEqual(result, { added: 2, updated: 1, total: 3, ids: ["BH01", "BH02", "BH03"] });
  assert.equal(state.boreholes.length, 3);
  for (const borehole of state.boreholes) {
    assert.equal(borehole.plannedDepth, 6);
    assert.equal(borehole.planned, 6);
    assert.equal(borehole.refusalAllowed, true);
    assert.equal(borehole.samplesReq, true);
    assert.equal(borehole.sptReq, false);
    assert.equal(borehole.dcpReq, true);
    assert.equal(borehole.gwReq, true);
    assert.equal(borehole.scopeSource, "proposal.pdf");
    assert.match(borehole.scopeDetails, /Target 6 m or refusal/);
    assert.match(borehole.scopeDetails, /DCP required/);
    assert.ok(state.logs[borehole.id]);
  }

  const repeated = sync.materialise(state, plan(), {
    blankBorehole,
    blankLogs,
    source: "proposal.pdf",
    approvedAt: "2026-08-24T00:00:00.000Z",
    version: 1
  });
  assert.equal(repeated.added, 0);
  assert.equal(repeated.updated, 0);
  assert.equal(state.boreholes.length, 3);
});

test("scope sync preserves factual borehole data and never deletes extra records", () => {
  const existing = Object.assign(blankBorehole("BH01"), {
    plannedDepth: 8,
    planned: 8,
    startDate: "2026-09-01",
    endDate: "2026-09-02",
    locationDesc: "Light pole LP-01",
    sptReq: true
  });
  const extra = Object.assign(blankBorehole("BH99"), { locationDesc: "Existing investigation" });
  const state = { boreholes: [existing, extra], logs: { BH01: blankLogs(), BH99: { ...blankLogs(), soil: [{ from: 0, to: 1 }] } }, activeBh: "BH99" };
  const oneHolePlan = Object.assign(plan(), { bhs: [{ id: "BH01", depth: 6, refusal: true }], gw: [{ bh: "BH01", task: "Record groundwater" }] });

  sync.materialise(state, oneHolePlan, { blankBorehole, blankLogs, source: "revised.pdf", approvedAt: "2026-08-25T00:00:00.000Z" });

  assert.equal(state.boreholes.length, 2);
  assert.equal(existing.plannedDepth, 8);
  assert.equal(existing.startDate, "2026-09-01");
  assert.equal(existing.endDate, "2026-09-02");
  assert.equal(existing.locationDesc, "Light pole LP-01");
  assert.equal(existing.sptReq, true);
  assert.ok(state.boreholes.includes(extra));
  assert.equal(state.activeBh, "BH99");
});
