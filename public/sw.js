const CACHE = "weekend-v21";
const ASSETS = ["/", "/index.html", "/app.js", "/fx.js", "/styles.css", "/manifest.json", "/icon.svg", "/icon-180.png", "/icon-192.png", "/icon-512.png", "/icon-maskable.png"];

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

// ---- Push ----
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {}
  const title = data.title || "Weekend";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: data.vibrate || [80, 40, 80],
    data: { url: data.url || "/", attentionId: (data.data && data.data.attentionId) || null },
  };
  // A tag collapses repeat pings into one notification instead of a stack.
  if (data.tag) { options.tag = data.tag; options.renotify = true; }
  // Reply buttons. Android/desktop render them; iOS ignores them and just shows
  // the notification, so tapping through to the app is the fallback there.
  if (Array.isArray(data.actions) && data.actions.length) options.actions = data.actions.slice(0, 3);
  e.waitUntil(self.registration.showNotification(title, options));
});

// Tapping a notification focuses the app (or opens it). Tapping one of the
// reply buttons answers the ping without opening anything.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  const url = d.url || "/";

  if (e.action && e.action.indexOf("ack:") === 0 && d.attentionId) {
    e.waitUntil(
      fetch(`/api/attention/${d.attentionId}/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ reply: e.action.slice(4) }),
      }).catch(() => {})
    );
    return;
  }

  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
