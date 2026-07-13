const test = require("node:test");
const assert = require("node:assert/strict");
const ags = require("../geologger/ags41-export.js");
const domain = require("../geologger/geoflow-domain.js");

function fixture() {
  return {
    project: { projectNumber: "33529", projectName: "Example GI", clientName: "Example Client", datum: "AHD" },
    boreholes: [{ id: "BH3", termDepth: 6, termReason: "Target depth reached" }],
    logs: {
      BH3: {
        soil: [{ from: 0, to: 2.4, material: "Silty CLAY", description: "Silty CLAY: brown, stiff", moisture: "moist" }],
        rock: [
          { from: 2.4, to: 6, rockType: "SHALE", description: "SHALE: dark grey, MW, M", defectSpacing: "40-60 mm" },
          { from: 4.2, to: 4.2, defectType: "Joint", defectAngle: 35, defectRough: "rough", remarks: "clean" }
        ],
        samples: [{ sid: "BH3-U50-01", from: 0.5, to: 1, stype: "U50", tests: "Shrink-swell" }],
        spt: [{ depth: 1.5, b1: 5, b2: 8, b3: 9, n: 17 }],
        corebox: { rows: [] }
      }
    }
  };
}

test("exports factual groups separately from the visual PDF", () => {
  const output = ags.build(fixture(), { date: "2026-07-13", domain });
  for (const name of ["PROJ", "TRAN", "UNIT", "TYPE", "ABBR", "LOCA", "GEOL", "SAMP", "ISPT", "DISC", "FRAC"]) {
    assert.match(output, new RegExp(`"GROUP","${name}"`));
  }
  assert.doesNotMatch(output, /"GROUP","CORE"/);
  assert.match(output, /"DATA","BH3","1\.50","5","17","450","17","5,8,9 N=17"/);
  assert.match(output, /"DATA","BH3","0\.50","BH3-U50-01","U","BH3-U50-01"/);
  assert.match(output, /"DATA","SAMP_TYPE","U","Undisturbed sample - open drive"/);
  assert.ok(output.endsWith("\r\n"));
});

test("includes the mandatory AGS lookup groups with official 4.1.1 values", () => {
  const output = ags.build(fixture(), { date: "2026-07-13", domain });
  assert.match(output, /"GROUP","UNIT"[\s\S]*"DATA","m","metre",""/);
  assert.match(output, /"GROUP","TYPE"[\s\S]*"DATA","PA","Text listed in ABBR Group"/);
  assert.match(output, /"GROUP","ABBR"[\s\S]*"DATA","LOCA_TYPE","RC","Rotary cored"/);
});

test("retains a non-standard project grid as a remark instead of an invalid PA value", () => {
  const state = fixture();
  state.project.coordSystem = "MGA2020 / Zone 56";
  const output = ags.build(state, { date: "2026-07-13", domain });
  assert.match(output, /"Grid reference system=MGA2020 \/ Zone 56"/);
  assert.doesNotMatch(output, /,"MGA2020 \/ Zone 56",/);
});

test("does not invent an AGS sample code for an unknown source sample type", () => {
  const state = fixture();
  state.logs.BH3.samples = [{ sid: "BH3-X01", from: 0.8, to: 1, stype: "CUSTOM" }];
  const output = ags.build(state, { date: "2026-07-13", domain });
  assert.match(output, /"DATA","BH3","0\.80","BH3-X01","","BH3-X01"/);
  assert.match(output, /"Source type=CUSTOM"/);
});

test("preserves zero-valued location coordinates, level and SPT seating blows", () => {
  const state = fixture();
  Object.assign(state.boreholes[0], { easting: 0, northing: 0, rl: 0 });
  state.logs.BH3.spt[0].seat = 0;
  const output = ags.build(state, { date: "2026-07-13", domain });
  assert.match(output, /"DATA","BH3","EH","DRAFT","0\.00","0\.00","","0\.00"/);
  assert.match(output, /"DATA","BH3","1\.50","0","17"/);
});

test("uses official AGS heading, unit and type row structure", () => {
  const output = ags.build(fixture(), { date: "2026-07-13", domain });
  const blocks = output.trim().split(/\r\n\r\n/);
  for (const block of blocks) {
    const rows = block.split("\r\n");
    assert.match(rows[0], /^"GROUP",/);
    assert.match(rows[1], /^"HEADING",/);
    assert.match(rows[2], /^"UNIT",/);
    assert.match(rows[3], /^"TYPE",/);
    const width = rows[1].split('","').length;
    rows.slice(2).forEach(row => assert.equal(row.split('","').length, width));
  }
});

test("marks incomplete metadata as draft without borrowing reference data", () => {
  const output = ags.build({ project: {}, boreholes: [{ id: "BH1" }], logs: { BH1: {} } }, { date: "2026-07-13", domain });
  assert.match(output, /"DATA","UNASSIGNED"/);
  assert.match(output, /"DRAFT"/);
  assert.match(output, /"NOT SUPPLIED"/);
});

test("escapes quotes and removes record-breaking newlines", () => {
  assert.equal(ags.csvCell('a "quoted"\nvalue'), '"a ""quoted"" value"');
});

test("exports recovery-only rows as CORE without inventing GEOL lithology", () => {
  const state = fixture();
  state.logs.BH3.soil = [{}];
  state.logs.BH3.rock = [{ from: 2, to: 3.5, rockType: "", description: "", tcr: 100, rqd: 85 }];
  state.logs.BH3.samples = [];
  state.logs.BH3.spt = [];
  const output = ags.build(state, { date: "2026-07-14", domain });

  assert.doesNotMatch(output, /"GROUP","GEOL"/);
  assert.match(output, /"GROUP","CORE"[\s\S]*"DATA","BH3","2\.00","3\.50","100","","85",""/);
});
