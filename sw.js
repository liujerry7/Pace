// Pace service worker: lets the installed app open with no connection or a bad one.
// It only stores Pace's own files (the page, manifest, icons). It never touches requests
// to other sites (Anthropic, GitHub, Lifeline), and never stores keys, tokens or chats:
// those live in the page's own storage, as before.
// Bump VERSION when the list below changes.
const VERSION = 'pace-shell-v1';
const APP_SHELL = [
  './',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];
const NETWORK_WAIT_MS = 4000;   // on a slow connection, open the saved copy after this long

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page: try the network first so a new version shows up right away; fall back to the
// saved copy when offline or when the network is too slow. A late network answer still
// refreshes the saved copy for next time.
function openPage(req) {
  const fromNetwork = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put('./', copy));
    }
    return res;
  });
  const fromCache = () => caches.match('./');
  const slow = new Promise((resolve) => setTimeout(resolve, NETWORK_WAIT_MS)).then(fromCache);
  return Promise.race([fromNetwork.catch(fromCache), slow.then((hit) => hit || fromNetwork)])
    .then((res) => res || fromNetwork);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') { event.respondWith(openPage(req)); return; }
  // Icons and manifest: saved copy first. Anything else (like setup-link.json) goes to the network.
  const path = new URL(req.url).pathname;
  if (/\/(manifest\.webmanifest|icons\/[^/]+\.png)$/.test(path)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});
