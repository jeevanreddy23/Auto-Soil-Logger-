const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("changing boreholes re-enables the Cloudflare PDF save action", () => {
  const html = fs.readFileSync(path.join(__dirname, "../geologger/index.html"), "utf8");
  const changeHandler = /document\.getElementById\("reportBh"\)\.onchange\s*=\s*e=>\{([\s\S]*?)\n\s*\};/.exec(html);

  assert.ok(changeHandler, "report borehole change handler should exist");
  assert.match(changeHandler[1], /resetCloudSave\(\)/);
});
