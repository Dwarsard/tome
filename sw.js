/* Service worker de Tome — cache l'app pour l'usage hors ligne.
   Incrémenter CACHE à chaque déploiement : déclenche 'updatefound' côté page,
   qui affiche le bandeau « Nouvelle version — Recharger ». */
const CACHE = 'tome-v10';
const CACHE_PREFIX = 'tome-';
// Caches d'AVANT l'éclatement du single-file (index.html contenait tout le CSS/JS).
const PRE_SPLIT = /^tome-v[1-8]$/;
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  // NE PAS skipWaiting en général : le nouveau worker attend que l'utilisateur clique
  // « Recharger » (message SKIP_WAITING ci-dessous) — pas de rechargement surprise en pleine saisie.
  // EXCEPTION, une seule fois : venant d'un cache d'avant l'éclatement, l'ancien worker met en
  // cache le nouvel index.html SANS app.css/app.js (qu'il ne connaît pas) — hors ligne, la page
  // serait alors vide. On prend donc le contrôle tout de suite pour réparer cet état incohérent.
  e.waitUntil((async () => {
    await (await caches.open(CACHE)).addAll(ASSETS);
    const keys = await caches.keys();
    if (keys.some(k => PRE_SPLIT.test(k))) await self.skipWaiting();
  })());
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

/* ---------- Notifications push ----------
   Le message arrive chiffré ; le navigateur le déchiffre et nous donne un JSON. */
self.addEventListener('push', e => {
  let d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(_){ d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'Tome';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || 'Tu as du nouveau sur Tome',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: d.tag || 'tome',            // regroupe : pas d'empilement de notifications identiques
    data: { url: d.url || '/#friends' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const cible = (e.notification.data && e.notification.data.url) || '/#friends';
  // réutiliser un onglet déjà ouvert plutôt que d'en empiler un nouveau
  e.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    for(const c of clientsList){
      if(new URL(c.url).origin === self.location.origin){ await c.focus(); if('navigate' in c) await c.navigate(cible); return; }
    }
    await self.clients.openWindow(cible);
  })());
});
