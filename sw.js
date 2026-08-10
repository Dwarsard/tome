/* Service worker de Tome — cache l'app pour l'usage hors ligne. */
const CACHE = 'tome-v1';
const CACHE_PREFIX = 'tome-';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // ne purger QUE les anciens caches de Tome — CacheStorage est partagé par toute l'origine
      // (sur GitHub Pages, ne pas toucher aux caches de Boussole / Cairn)
      .then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // réseau d'abord (pour récupérer les mises à jour), cache en secours hors ligne
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () =>
        (await caches.match(e.request, { ignoreSearch: true })) ||
        (e.request.mode === 'navigate' ? await caches.match('./index.html') : Response.error())
      )
  );
});
