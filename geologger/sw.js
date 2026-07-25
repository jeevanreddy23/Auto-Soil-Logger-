/* STS GeoFlow service worker — offline-first app shell */
const CACHE = "geoflow-v6";
const SHELL = ["./field.html", "./manifest.webmanifest"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.pathname.includes("/api/")) return; // network for API (sync layer handles offline)
  // network-first so app updates arrive; cache is the offline fallback
  e.respondWith(
    fetch(e.request).then(res => {
      if (e.request.method === "GET" && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match("./field.html")))
  );
});
