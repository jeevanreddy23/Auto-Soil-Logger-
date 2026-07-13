const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sync = require("../geologger/geoflow-sync.js");

function blankLogs() {
  return { soil: [], rock: [], spt: [], samples: [], corebox: { img: null } };
}

test("replaces stale browser logs with the canonical Cloudflare snapshot", () => {
  const local = {
    project: { projectNumber: "STALE" },
    boreholes: [{ id: "BH01" }],
    logs: { BH01: blankLogs() },
    activeBh: "BH01",
    activeTab: "preview"
  };
  const server = {
    project: { projectNumber: "STS-2401" },
    boreholes: [{ id: "BH01" }],
    logs: {
      BH01: {
        ...blankLogs(),
        soil: [{ from: 0, to: 1.2, material: "CLAY" }],
        rock: [{ from: 1.2, to: 3.4, rockType: "SHALE" }]
      }
    },
    activeBh: "BH02",
    activeTab: "soil"
  };

  const hydrated = sync.hydrateProjectState(local, server, blankLogs);

  assert.equal(hydrated.project.projectNumber, "STS-2401");
  assert.equal(hydrated.logs.BH01.soil.length, 1);
  assert.equal(hydrated.logs.BH01.rock.length, 1);
  assert.equal(hydrated.activeBh, "BH01");
  assert.equal(hydrated.activeTab, "preview");
});

test("uses a valid server selection when the local borehole no longer exists", () => {
  const local = { boreholes: [{ id: "OLD" }], logs: {}, activeBh: "OLD", activeTab: "export" };
  const server = {
    project: {},
    boreholes: [{ id: "BH01" }, { id: "BH02" }],
    logs: { BH01: blankLogs(), BH02: blankLogs() },
    activeBh: "BH02",
    activeTab: "soil"
  };

  const hydrated = sync.hydrateProjectState(local, server, blankLogs);

  assert.equal(hydrated.activeBh, "BH02");
  assert.equal(hydrated.activeTab, "export");
});

test("creates a blank log for every server borehole without mutating either input", () => {
  const local = { boreholes: [{ id: "BH01" }], logs: {}, activeBh: "BH01", activeTab: "soil" };
  const server = {
    project: {},
    boreholes: [{ id: "BH01" }, { id: "BH03" }],
    logs: { BH01: { ...blankLogs(), soil: [{ from: 0, to: 1 }] } }
  };
  const beforeLocal = structuredClone(local);
  const beforeServer = structuredClone(server);

  const hydrated = sync.hydrateProjectState(local, server, blankLogs);

  assert.deepEqual(local, beforeLocal);
  assert.deepEqual(server, beforeServer);
  assert.notEqual(hydrated, server);
  assert.deepEqual(hydrated.logs.BH03, blankLogs());
});

test("the report route hydrates known projects from KV instead of trusting cached logs", () => {
  const html = fs.readFileSync(path.join(__dirname, "../geologger/index.html"), "utf8");

  assert.match(html, /GeoFlowSync\.hydrateProjectState\(S, server, blankLogs\)/);
  assert.doesNotMatch(html, /entry\.rows\[0\]\s*&&\s*!localStorage\.getItem\("autosoil-logger"\)/);
  assert.match(html, /await pullSync\(existing\.syncKey/);
});
