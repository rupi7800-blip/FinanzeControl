/* FinanzeControl — service worker
   L'app resta sulla versione installata (funziona anche offline) finché
   non premi "Aggiorna": il tasto compare quando version.json annuncia
   una versione nuova. Non serve cambiare questo file a ogni rilascio. */
const CACHE = 'finanzecontrol-app';
const ASSETS = [
  './', './index.html', './css/style.css', './js/app.js', './js/db.js', './js/immagine.js', './js/ocr.js', './js/grafici.js', './js/aggiornamenti.js',
  './manifest.webmanifest', './icons/logo.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-32.png', './icons/icon-180.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  // solo le copie vecchie di QUESTA app: le altre app sullo stesso indirizzo hanno le loro
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k.split('-')[0] === CACHE.split('-')[0]).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromNetwork(req, key) {
  return fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(key || req, copy));
    }
    return res;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.endsWith('version.json')) return; // controllo aggiornamenti: sempre dalla rete

  // Pagina: la versione installata; se manca, dalla rete
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(hit => hit || caches.match(req, { ignoreSearch: true }))
        .then(hit => hit || fromNetwork(req, './index.html'))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // File dell'app e font: prima la copia installata
  const font = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com') || url.hostname === 'cdn.jsdelivr.net';
  if (url.origin === self.location.origin || font) {
    e.respondWith(
      caches.match(req, { ignoreSearch: url.origin === self.location.origin })
        .then(hit => hit || fromNetwork(req))
        .catch(() => caches.match(req))
    );
  }
});

// Tasto "Aggiorna": attiva subito un eventuale service worker nuovo
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length) return list[0].focus();
      return self.clients.openWindow('./');
    })
  );
});
