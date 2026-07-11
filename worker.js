/* STS GeoFlow — Cloudflare Worker
   Serves the geologger/ static app and stores all project data in Workers KV
   (namespace binding: GEOFLOW). The Worker IS the backend — no third-party API.

   Data model (mirrors the original API exactly, so web + field apps are untouched):
     GET  /api/v1/geologger/logs            → { boreholes: { <location>: { rows:[...] } } }
     POST /api/v1/geologger/logs {location, rows} → upsert one location

   KV keys: "log:<location>" → JSON rows array.
   First GET on an empty namespace lazily migrates every location from the old
   Render backend, then serves from KV forever after.

   Optional auth: set a Worker secret AUTOSOIL_API_KEY to require the
   X-Autosoil-Api-Key header on both endpoints. Unset = open (current behaviour). */

const LEGACY_API = "https://auto-soil-logger-api.onrender.com";
const PREFIX = "log:";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

function authorised(request, env) {
  if (!env.AUTOSOIL_API_KEY) return true;
  return request.headers.get("X-Autosoil-Api-Key") === env.AUTOSOIL_API_KEY;
}

async function listAll(env) {
  const out = {};
  let cursor;
  do {
    const page = await env.GEOFLOW.list({ prefix: PREFIX, cursor });
    for (const k of page.keys) {
      const raw = await env.GEOFLOW.get(k.name);
      if (raw) { try { out[k.name.slice(PREFIX.length)] = { rows: JSON.parse(raw) }; } catch (e) {} }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}

async function migrateFromLegacy(env) {
  /* one-time seed: copy everything the old Render backend holds into KV */
  try {
    const res = await fetch(LEGACY_API + "/api/v1/geologger/logs", { signal: AbortSignal.timeout(60000) });
    if (!res.ok) return false;
    const data = await res.json();
    const all = data.boreholes || {};
    for (const [loc, v] of Object.entries(all)) {
      if (v && Array.isArray(v.rows)) await env.GEOFLOW.put(PREFIX + loc, JSON.stringify(v.rows));
    }
    await env.GEOFLOW.put("meta:migrated", new Date().toISOString());
    return true;
  } catch (e) { return false; }
}

async function handleLogs(request, env) {
  if (!authorised(request, env)) return json({ error: "invalid api key" }, 401);

  if (request.method === "GET") {
    let all = await listAll(env);
    if (Object.keys(all).length === 0 && !(await env.GEOFLOW.get("meta:migrated"))) {
      await migrateFromLegacy(env);           /* lazy migration, first call only */
      all = await listAll(env);
    }
    return json({ boreholes: all });
  }

  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "invalid json" }, 400); }
    const loc = body && body.location;
    if (!loc || typeof loc !== "string" || loc.length > 200) return json({ error: "location required" }, 400);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    await env.GEOFLOW.put(PREFIX + loc, JSON.stringify(rows));
    return json({ ok: true, location: loc, rows: rows.length });
  }

  return json({ error: "method not allowed" }, 405);
}

/* ---- file store: all project documents live in Cloudflare KV ----
   POST /api/v1/files              {project, id?, name, kind, data(dataURL)} → {ok,id}
   GET  /api/v1/files?project=X    → {files:[{id,name,kind,ts,size}]}  (metadata only)
   GET  /api/v1/files?project=X&id=Y → {id,name,kind,ts,data}                     */
const FPREFIX = "file:";
async function handleFiles(request, env) {
  if (!authorised(request, env)) return json({ error: "invalid api key" }, 401);
  const url = new URL(request.url);
  if (request.method === "GET") {
    const project = url.searchParams.get("project") || "";
    if (!project) return json({ error: "project required" }, 400);
    const id = url.searchParams.get("id");
    if (id) {
      const raw = await env.GEOFLOW.get(FPREFIX + project + ":" + id);
      return raw ? json(JSON.parse(raw)) : json({ error: "not found" }, 404);
    }
    const out = []; let cursor;
    do {
      const page = await env.GEOFLOW.list({ prefix: FPREFIX + project + ":", cursor });
      for (const k of page.keys) {
        const raw = await env.GEOFLOW.get(k.name);
        if (raw) { try { const f = JSON.parse(raw);
          out.push({ id: f.id, name: f.name, kind: f.kind, ts: f.ts, size: (f.data||"").length }); } catch (e) {} }
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    return json({ files: out });
  }
  if (request.method === "POST") {
    let body; try { body = await request.json(); } catch (e) { return json({ error: "invalid json" }, 400); }
    const project = body && body.project, data = body && body.data;
    if (!project || typeof project !== "string") return json({ error: "project required" }, 400);
    if (!data || typeof data !== "string" || data.length > 20_000_000) return json({ error: "data missing or >20MB" }, 400);
    const id = (body.id && String(body.id).slice(0, 80)) || crypto.randomUUID();
    await env.GEOFLOW.put(FPREFIX + project + ":" + id,
      JSON.stringify({ id, name: String(body.name||id).slice(0,180), kind: String(body.kind||"file").slice(0,40),
        ts: new Date().toISOString(), data }));
    return json({ ok: true, id });
  }
  return json({ error: "method not allowed" }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/v1/geologger/logs") return handleLogs(request, env);
    if (url.pathname === "/api/v1/files") return handleFiles(request, env);

    /* any other legacy /api path still proxies to the old backend (vision pipeline etc.) */
    if (url.pathname.startsWith("/api/")) {
      const init = {
        method: request.method,
        headers: request.headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "follow"
      };
      try { return await fetch(LEGACY_API + url.pathname + url.search, init); }
      catch (e) {
        return json({ error: "backend unreachable", detail: String(e) }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
