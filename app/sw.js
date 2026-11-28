// Sherr I service worker: app shell offline (network-first), and Sherr I's own texts (push).
const CACHE = "sherr-i-v3";
const INBOX = "sherr-inbox";
const SHELL = ["/", "/index.html", "/styles.css", "/app.js", "/img/tiger.png", "/icons/icon-192.png", "/icons/badge-96.png", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== INBOX).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/index.html"))),
  );
});

// ---- Sherr I texts you ----------------------------------------------------
// Every push is also kept in a small inbox so it shows up in the chat when the app opens.
async function keep(msg) {
  const c = await caches.open(INBOX);
  await c.put(`/inbox/${Date.now()}-${msg.id || "x"}`, new Response(JSON.stringify({ ...msg, received: new Date().toISOString() })));
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  wins.forEach((w) => w.postMessage({ sherr: "inbox" }));
}

self.addEventListener("push", (e) => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch { msg = { body: e.data?.text() }; }
  const body = msg.body || "Sherr I has something for you.";
  const actions = msg.type === "remind"
    ? [{ action: "snooze", title: "10 min baad" }, { action: "done", title: "Ho gaya" }]
    : msg.type === "brief" ? [{ action: "open", title: "Reply" }] : [];
  e.waitUntil(Promise.all([
    keep({ type: msg.type || "note", id: msg.id, text: body, at: msg.at }),
    self.registration.showNotification(msg.title || "Sherr I", {
      body, tag: msg.id || undefined, renotify: true,
      icon: "/icons/icon-192.png", badge: "/icons/badge-96.png",
      vibrate: msg.type === "remind" ? [200, 100, 200, 100, 200] : [80],
      requireInteraction: msg.type === "remind",
      timestamp: msg.at ? Date.parse(msg.at) : Date.now(),
      actions, data: msg,
    }),
  ]));
});

async function openApp(path = "/?from=push") {
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const win = wins.find((w) => new URL(w.url).origin === location.origin);
  if (win) { win.postMessage({ sherr: "inbox" }); return win.focus(); }
  return self.clients.openWindow(path);
}

self.addEventListener("notificationclick", (e) => {
  const msg = e.notification.data || {};
  e.notification.close();
  if (e.action === "done") return;
  if (e.action === "snooze") {
    e.waitUntil((async () => {
      const sub = await self.registration.pushManager.getSubscription();
      if (!sub) return;
      await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "snooze", sub: sub.toJSON(), id: msg.id, text: msg.body, minutes: 10 }) });
    })().catch(() => {}));
    return;
  }
  e.waitUntil(openApp());
});

// The browser rotated our subscription: tell the app so it can re-register pending reminders.
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil(keep({ type: "resubscribe", id: "resubscribe", text: "" }));
});
