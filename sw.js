// NOMAD-16 : fonctionnement hors ligne.
// L'app et les fichiers JSON : réseau d'abord (pour recevoir les mises à jour), copie locale si pas de réseau.
// Les sons (kits, instruments, extraits de la Bibliothèque du Congrès) et les polices : copie locale d'abord.
const SHELL = "nomad16-shell-v1";
const MEDIA = "nomad16-media-v1";
const PRECACHE = ["./", "index.html", "apple-touch-icon.png", "kits/index.json", "crate/crate.json", "sons/instruments.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== MEDIA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function networkFirst(req, cacheName, timeoutMs) {
  return caches.open(cacheName).then(cache => new Promise(resolve => {
    let done = false;
    const fallback = () => cache.match(req, { ignoreSearch: true }).then(r => r || (req.mode === "navigate" ? cache.match("index.html") : null)).then(r => r || new Response("", { status: 504 }));
    const timer = setTimeout(() => { if (!done) { done = true; resolve(fallback()); } }, timeoutMs);
    fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      if (!done) { done = true; clearTimeout(timer); resolve(res); }
    }).catch(() => { if (!done) { done = true; clearTimeout(timer); resolve(fallback()); } });
  }));
}
function cacheFirst(req, cacheName) {
  return caches.open(cacheName).then(cache => cache.match(req).then(hit => hit || fetch(req).then(res => {
    if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
    return res;
  })));
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (req.mode === "navigate" || (same && (url.pathname.endsWith(".html") || url.pathname.endsWith("/") || url.pathname.endsWith(".json")))) {
    e.respondWith(networkFirst(req, SHELL, req.mode === "navigate" ? 3500 : 2500));
    return;
  }
  const media = same || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || url.hostname === "danigb.github.io" || url.hostname === "s3.amazonaws.com";
  if (media) e.respondWith(cacheFirst(req, MEDIA));
});
