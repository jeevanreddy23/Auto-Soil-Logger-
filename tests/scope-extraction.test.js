const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const extractor = require(path.resolve(__dirname, "..", "geologger", "geoflow-scope-extractor.js"));

function proposalFixture() {
  return [{
    id: "proposal-example",
    name: "proposal-example.pdf",
    pages: [
      {
        n: 1,
        text: "We propose drilling twenty-nine (29) boreholes. The boreholes will be drilled to a depth of six (6) metres or auger refusal using one of our utility mounted drilling rigs. Each borehole location will be electronically scanned for the presence of services and set out using a handheld GPS unit. The consistency of the soils will be assessed by undertaking Dynamic Cone Penetrometer (DCP) tests adjacent to each borehole location. Soil samples will be collected from each borehole location for aggressivity testing. After completion of the fieldwork, a report will be prepared giving subsurface conditions including groundwater levels."
      },
      {
        n: 2,
        text: "Site Classification to AS2870 for each location. Classification to AS4676 for each location. Foundation design parameters including foundation options. Soil aggressiveness AS2159 for each location. Comment on any construction problems that may be anticipated. Laboratory Testing 29 pH, SO4, CL & EC. 6 Shrink swell. Terms and Conditions."
      },
      {
        n: 3,
        text: "The fieldwork may commence within ten working days. The fieldwork will take about 2.5 extra days more than the environmental sampling to complete. The report should be ready for submission about fifteen working days from completion of all fieldwork."
      },
      {
        n: 5,
        text: "TERMS OF AGREEMENT FOR PROFESSIONAL SERVICES. The Consultant may change the scope. Laboratory testing will be carried out to standards. Investigation report and environmental sampling are mentioned as general contractual terms."
      },
      {
        n: 7,
        text: "CLIENT ACCEPTANCE FORM. Concrete coring may be selected for an additional fee."
      }
    ]
  }];
}

test("extracts the actual investigation scope and quantities", () => {
  let id = 0;
  const items = extractor.extract(proposalFixture(), { idFactory: () => `item-${++id}` });
  const byName = new Map(items.map(item => [item.name, item]));

  assert.equal(byName.get("Boreholes").qty, 29);
  assert.equal(byName.get("Boreholes").extra.depth, 6);
  assert.equal(byName.get("Boreholes").extra.refusal, true);
  assert.equal(byName.get("DCP tests").qty, 29);
  assert.equal(byName.get("Aggressivity samples").qty, 29);
  assert.equal(byName.get("Aggressivity testing").qty, 29);
  assert.equal(byName.get("Shrink-swell").qty, 6);
  assert.equal(byName.get("Fieldwork mobilisation").qty, 10);
  assert.equal(byName.get("Report turnaround").qty, 15);
});

test("does not turn cross-references or contractual appendices into scope", () => {
  const items = extractor.extract(proposalFixture(), { idFactory: () => "item" });
  const names = items.map(item => item.name);

  assert.equal(names.filter(name => name === "Site classification").length, 1);
  assert.ok(!names.includes("Environmental samples"));
  assert.ok(items.every(item => item.page < 5));
  assert.ok(!items.some(item => /contractual terms|additional fee/i.test(item.snippet)));
});

test("stops at a legal appendix even when it begins mid-page", () => {
  const pages = extractor.scopedPages([{
    n: 1,
    text: "Two (2) boreholes. TERMS OF AGREEMENT FOR PROFESSIONAL SERVICES. Twenty (20) test pits."
  }, {
    n: 2,
    text: "CLIENT ACCEPTANCE FORM. Thirty (30) hand augers."
  }]);

  assert.deepEqual(pages, [{ n: 1, text: "Two (2) boreholes." }]);
});
