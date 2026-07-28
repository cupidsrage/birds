const CACHE = "weekend-v8";
const ASSETS = ["/", "/index.html", "/app.js", "/styles.css", "/manifest.json", "/icon.svg", "/icon-180.png", "/icon-192.png", "/icon-512.png", "/icon-maskable.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const { request } = e;
  // Network-first for API, cache-first for static shell.
  if (request.url.includes("/api/")) return;
  e.respondWith(
    caches.match(request).then((hit) => hit || fetch(request))
  );
});
