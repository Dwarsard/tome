/* Service worker de Tome — cache l'app pour l'usage hors ligne.
   Incrémenter CACHE à chaque déploiement : déclenche 'updatefound' côté page,
   qui affiche le bandeau « Nouvelle version — Recharger ». */
const CACHE = 'tome-v3';
const CACHE_PREFIX = 'tome-';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => {
  // NE PAS skipWaiting ici : le nouveau worker reste en attente jusqu'à ce que
  // l'utilisateur clique « Recharger » (message SKIP_WAITING ci-dessous).
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
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
  // l'API (même origine en prod) ne doit JAMAIS passer par le cache : données privées et volatiles
  if (url.pathname.startsWith('/api/')) return;
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
