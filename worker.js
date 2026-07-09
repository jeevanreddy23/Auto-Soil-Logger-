/* STS GeoFlow — Cloudflare Worker
   Serves the geologger/ static app and proxies /api/* to the Render backend
   (same-origin API so no CORS issues, mirrors the old vercel.json rewrite). */
const API_ORIGIN = "https://auto-soil-logger-api.onrender.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const target = API_ORIGIN + url.pathname + url.search;
      const init = {
        method: request.method,
        headers: request.headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "follow"
      };
      try {
        return await fetch(target, init);
      } catch (e) {
        return new Response(JSON.stringify({ error: "backend unreachable", detail: String(e) }),
          { status: 502, headers: { "Content-Type": "application/json" } });
      }
    }
    return env.ASSETS.fetch(request);
  }
};
