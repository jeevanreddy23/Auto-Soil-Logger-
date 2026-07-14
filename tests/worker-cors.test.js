const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let worker;

test.before(async () => {
  const source = fs.readFileSync(path.join(__dirname, "../worker.js"), "utf8");
  const encoded = Buffer.from(source).toString("base64");
  worker = (await import(`data:text/javascript;base64,${encoded}`)).default;
});

test("allows Capacitor preflight requests to the Cloudflare API", async () => {
  const request = new Request("https://example.workers.dev/api/v1/geologger/logs", {
    method: "OPTIONS",
    headers: {
      Origin: "https://localhost",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-autosoil-api-key"
    }
  });

  const response = await worker.fetch(request, {});

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://localhost");
  assert.match(response.headers.get("Access-Control-Allow-Methods"), /POST/);
  assert.match(response.headers.get("Access-Control-Allow-Headers"), /X-Autosoil-Api-Key/i);
});

test("rejects unlisted cross-origin preflight requests", async () => {
  const request = new Request("https://example.workers.dev/api/v1/geologger/logs", {
    method: "OPTIONS",
    headers: { Origin: "https://untrusted.example" }
  });

  const response = await worker.fetch(request, {});

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("adds the native origin to successful API responses", async () => {
  const env = {
    GEOFLOW: {
      list: async () => ({ keys: [{ name: "log:BH01" }], list_complete: true }),
      get: async key => key === "log:BH01" ? JSON.stringify([{ location: "BH01" }]) : null
    }
  };
  const request = new Request("https://example.workers.dev/api/v1/geologger/logs", {
    headers: { Origin: "https://localhost" }
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://localhost");
  assert.equal(body.boreholes.BH01.rows.length, 1);
});
