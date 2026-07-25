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

/* CORS: the Capacitor Android shell runs the same field app from https://localhost —
   reflect the Origin so the packaged app can reach the data + file APIs. Additive only. */
function corsHeaders(request) {
  const o = request.headers.get("Origin");
  return o ? {
    "Access-Control-Allow-Origin": o,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Autosoil-Api-Key",
    "Access-Control-Max-Age": "86400"
  } : {};
}
function withCors(res, request) {
  const h = corsHeaders(request);
  if (!Object.keys(h).length) return res;
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(h)) r.headers.set(k, v);
  return r;
}

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

/* ---- client share links: KV "share:{token}" → {project, ts}; public read-only view ---- */
async function handleShare(request, env) {
  if (!authorised(request, env)) return json({ error: "invalid api key" }, 401);
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body; try { body = await request.json(); } catch (e) { return json({ error: "invalid json" }, 400); }
  if (body && body.action === "revoke" && body.token) {
    await env.GEOFLOW.delete("share:" + String(body.token).slice(0, 64));
    return json({ ok: true, revoked: true });
  }
  const project = body && body.project;
  if (!project || typeof project !== "string" || !project.startsWith("__")) return json({ error: "project required" }, 400);
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  await env.GEOFLOW.put("share:" + token, JSON.stringify({ project, ts: new Date().toISOString() }));
  return json({ ok: true, token });
}
const eshx = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
async function handleShareView(token, env) {
  const raw = await env.GEOFLOW.get("share:" + String(token).slice(0, 64));
  if (!raw) return new Response("<!DOCTYPE html><h1 style='font-family:sans-serif'>Link expired or revoked</h1>",
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  let project;
  try { project = JSON.parse(raw).project; } catch (e) { project = null; }
  if (!project) return new Response("<!DOCTYPE html><h1 style='font-family:sans-serif'>Link expired or revoked</h1>",
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  const rowsRaw = await env.GEOFLOW.get("log:" + project);
  let stateRow = {};
  try { stateRow = rowsRaw ? ((JSON.parse(rowsRaw) || [])[0] || {}) : {}; } catch (e) { stateRow = {}; }
  const P = stateRow.project || {}; const bhs = stateRow.boreholes || []; const logs = stateRow.logs || {};
  const dep = id => { const l = logs[id] || {}; const b = bhs.find(x => x.id === id) || {};
    return Math.max(...(l.soil || []).map(r => parseFloat(r.to) || 0), ...(l.rock || []).map(r => parseFloat(r.to) || 0), parseFloat(b.termDepth) || 0, 0); };
  const mSum = bhs.reduce((a, b) => a + dep(b.id), 0);
  const cnt = k => Object.values(logs).reduce((a, l) => a + ((l && l[k]) || []).length, 0);
  const rows = bhs.map(b => `<tr><td>${eshx(b.id)}</td><td>${dep(b.id).toFixed(2)} m${b.planned ? " / " + (parseFloat(b.planned) || 0).toFixed(1) + " m" : ""}</td><td>${eshx(b.termDepth ? "Terminated at " + b.termDepth + " m" : (b.status || "In progress"))}</td></tr>`).join("");
  const dn = stateRow.dailyNotes || {};
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${eshx(P.projectNumber || "Project")} — STS Geotechnics progress</title>
<style>body{font-family:Inter,"Segoe UI",system-ui,sans-serif;background:#f4f6f9;color:#0f172a;margin:0}header{background:#0b1220;color:#fff;padding:18px 22px}header b{font-size:16px;letter-spacing:.4px}header small{display:block;color:#93a4bd;font-size:11px;letter-spacing:1.2px;margin-top:2px}main{max-width:860px;margin:0 auto;padding:20px 16px}h1{font-size:20px;margin:6px 0 2px}.sub{color:#64748b;font-size:13px;margin-bottom:16px}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px}.k{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px}.k b{font-size:20px}.k span{display:block;color:#64748b;font-size:11.5px;margin-top:2px}.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:12px}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:#64748b;font-weight:600;font-size:11.5px;letter-spacing:.4px;padding:6px 8px;border-bottom:1px solid #e2e8f0}td{padding:8px;border-bottom:1px solid #f1f5f9}footer{color:#94a3b8;font-size:11px;text-align:center;padding:18px}</style></head><body>
<header><b>STS GEOTECHNICS</b><small>LIVE PROJECT PROGRESS</small></header>
<main><h1>${eshx(P.projectNumber || "Project")}${P.projectName ? " — " + eshx(P.projectName) : ""}</h1>
<div class="sub">${eshx(P.siteAddress || "")}</div>
<div class="kpis"><div class="k"><b>${bhs.length}</b><span>Boreholes</span></div><div class="k"><b>${mSum.toFixed(1)} m</b><span>Drilled</span></div><div class="k"><b>${cnt("samples")}</b><span>Samples</span></div><div class="k"><b>${cnt("spt")}</b><span>SPT tests</span></div></div>
<div class="card"><table><tr><th>Location</th><th>Depth</th><th>Status</th></tr>${rows || "<tr><td colspan=3>Field work not started yet.</td></tr>"}</table></div>
${dn.date ? `<div class="card"><b style="font-size:13px">Site note — ${eshx(dn.date)}</b><div style="font-size:13px;color:#334155;margin-top:6px">${eshx(dn.issues || "")}${dn.tomorrow ? "<br>Next: " + eshx(dn.tomorrow) : ""}</div></div>` : ""}
<footer>Live view · updates as field data syncs · STS GeoFlow</footer></main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/v1/share") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
      return withCors(await handleShare(request, env), request);
    }
    if (url.pathname.startsWith("/share/")) return handleShareView(url.pathname.slice(7), env);

    if (url.pathname === "/api/v1/geologger/logs" || url.pathname === "/api/v1/files") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
      const res = url.pathname === "/api/v1/geologger/logs"
        ? await handleLogs(request, env) : await handleFiles(request, env);
      return withCors(res, request);
    }

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
