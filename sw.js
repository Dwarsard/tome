/* Service worker de Tome — cache l'app pour l'usage hors ligne.
   Incrémenter CACHE à chaque déploiement : déclenche 'updatefound' côté page,
   qui affiche le bandeau « Nouvelle version — Recharger ». */
const CACHE = 'tome-v23';
const CACHE_PREFIX = 'tome-';
// Cache SÉPARÉ des couvertures : il doit SURVIVRE aux déploiements (voir le filtre d'activate),
// sinon la grille repart grise à chaque nouvelle version.
const COVERS = 'tome-covers-v1';
// Hôtes de couverture mis en cache. À garder aligné sur SHAREABLE_COVER (app.js) :
//   covers.openlibrary.org, books.google.com / googleusercontent.com, et couvertures openapi.bnf.fr
// c'est la seule constante qui pose crossorigin="anonymous" sur l'image, donc la seule qui garantit
// des réponses CORS. Une réponse opaque (sans CORS) serait illisible ET comptée ~7 Mo au quota :
// on ne stocke que du 'cors' (contrôlé plus bas), mais si les deux listes divergent, tout ce qui
// vient d'ici sans crossorigin repartira au réseau au lieu d'être mis en cache.
const COVER_HOSTS = /^(?:covers\.openlibrary\.org|books\.google\.com|books\.googleusercontent\.com|openapi\.bnf\.fr)$/;
// ~400 couvertures ≈ 10 Mo (25 Ko l'unité en moyenne) : largement au-dessus d'une bibliothèque
// courante, largement sous le quota d'origine. Au-delà on purge les plus anciennes.
const COVER_MAX = 400;
// Open Library répond parfois 200 avec une image VIDE quand la couverture n'existe pas ; la mettre
// en cache figerait une vignette blanche pour toujours. En dessous de ce poids, on ne stocke pas.
const COVER_MIN_BYTES = 1500;
// Caches d'AVANT l'éclatement du single-file (index.html contenait tout le CSS/JS).
const PRE_SPLIT = /^tome-v[1-8]$/;
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './qr.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];
// Chemins absolus des ASSETS, calculés une fois : le handler fetch les compare à chaque requête.
const ASSET_PATHS = new Set(ASSETS.map(a => new URL(a, self.location.href).pathname));
// Chemins de NAVIGATION qui doivent afficher l'app elle-même (et donc la coquille index.html) :
// la racine, les profils publics /@pseudo et les pages livre /livre/<slug>, que l'app lit au
// démarrage. Volontairement PAS /confidentialite ni /cgu, qui sont de vraies pages autonomes.
const APP_PAGES = /^\/(?:$|index\.html$|@|livre\/)/;

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
      // (sur GitHub Pages, ne pas toucher aux caches de Boussole / Cairn).
      // COVERS est exclu : il est versionné à part et ne contient que des images immuables, le
      // vider à chaque déploiement recracherait 15 à 40 requêtes au lancement suivant.
      .then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE && k !== COVERS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// Borne le cache des couvertures : cache.keys() rend les clés dans leur ordre d'insertion, les
// premières sont donc les plus anciennes.
async function trimCovers(cache) {
  const keys = await cache.keys();
  if (keys.length <= COVER_MAX) return;
  for (const k of keys.slice(0, keys.length - COVER_MAX)) await cache.delete(k);
}
// Couvertures du catalogue : cache d'abord, sans expiration. Une couverture est identifiée par son
// ISBN (ou l'id du volume), elle ne change jamais. Sans ça le navigateur revalide CHAQUE vignette à
// CHAQUE ouverture — covers.openlibrary.org répond « Cache-Control: public » sans max-age et avec un
// Expires déjà dépassé (mesuré ~25 Ko et ~0,77 s par image) : 15 à 40 allers-retours simultanés,
// grille grise plusieurs secondes et autant de données mobiles à chaque lancement.
async function coverFirst(e) {
  const cache = await caches.open(COVERS);
  const hit = await cache.match(e.request);
  if (hit) return hit;
  let res;
  try {
    res = await fetch(e.request);
  } catch (_) {
    // hors ligne et pas encore en cache : on rend une erreur réseau, l'écouteur 'error' de la page
    // remplace l'image par le repli phHTML — le rendu n'est pas cassé.
    return Response.error();
  }
  // 'opaque' = requête no-cors (couverture hors SHAREABLE_COVER) : corps illisible et ~7 Mo comptés
  // au quota par entrée. On la sert, on ne la stocke pas.
  if (res && res.ok && res.type !== 'opaque') {
    const copy = res.clone();
    e.waitUntil((async () => {
      try {
        const blob = await copy.blob();
        if (blob.size < COVER_MIN_BYTES) return;   // image vide d'Open Library : ne pas figer un blanc
        await cache.put(e.request, new Response(blob, { headers: { 'content-type': blob.type || 'image/jpeg' } }));
        await trimCovers(cache);
      } catch (_) { }
    })());
  }
  return res;
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // AVANT la sortie sur l'origine différente : les couvertures sont servies par un autre domaine et
  // ne passent donc jamais par le réseau-d'abord ci-dessous.
  if (e.request.method === 'GET' && COVER_HOSTS.test(url.hostname)) {
    e.respondWith(coverFirst(e));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // l'API (même origine en prod) ne doit JAMAIS passer par le cache : données privées et volatiles
  if (url.pathname.startsWith('/api/')) return;
  const fromCache = async () =>
    (await caches.match(e.request, { ignoreSearch: true })) ||
    (e.request.mode === 'navigate' ? await caches.match('./index.html') : Response.error());

  // ---- Coquille de l'app : cache d'abord, rafraîchie en arrière-plan (stale-while-revalidate).
  // En réseau-d'abord, chaque lancement attendait le réseau (jusqu'à 4 s d'écran blanc sur une
  // mauvaise 3G) alors que la coquille était déjà en cache et n'avait pas changé. On la sert donc
  // tout de suite et on va chercher la version fraîche pendant ce temps : elle servira au
  // lancement suivant. Une vraie mise à jour reste signalée par le bandeau « Nouvelle version »
  // (updatefound côté page) : le navigateur récupère sw.js LUI-MÊME, sans passer par ce cache
  // (le Worker le sert en « public, max-age=0, must-revalidate », donc revalidé à chaque fois),
  // puis l'install du nouveau worker repeuple un cache neuf (CACHE incrémenté).
  const nav = e.request.mode === 'navigate';
  if (ASSET_PATHS.has(url.pathname) || (nav && APP_PAGES.test(url.pathname))) {
    // Toute navigation de l'app retombe sur la même entrée : la coquille.
    const key = nav ? './index.html' : e.request;
    // On ne RÉÉCRIT la coquille que depuis la racine : /@pseudo et /livre/<slug> sont rendus au
    // bord avec les métadonnées du profil ou du livre (titre, OG) — les enregistrer comme coquille
    // collerait ces métadonnées à toutes les ouvertures suivantes de l'app.
    const mayStore = !nav || url.pathname === '/' || url.pathname === '/index.html';
    e.respondWith((async () => {
      const cached = await caches.match(key, { ignoreSearch: true });
      const refresh = fetch(e.request).then(async r => {
        if (r && r.ok && mayStore) {
          try { const c = await caches.open(CACHE); await c.put(key, r.clone()); } catch (_) { }
        }
        return r;
      }).catch(() => null);
      // rattaché à waitUntil : le worker ne peut pas être tué avant la fin du rafraîchissement
      if (cached) { e.waitUntil(refresh); return cached; }
      return (await refresh) || fromCache();
    })());
    return;
  }

  // ---- Tout le reste de l'origine (polices, images de la landing, /confidentialite…) :
  // réseau d'abord (pour les mises à jour), cache en secours. Timeout de 4 s : sur un réseau
  // très mauvais on bascule vite sur le cache au lieu d'attendre indéfiniment.
  e.respondWith((async () => {
    let res;
    try {
      res = await Promise.race([
        fetch(e.request),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
      ]);
    } catch (_) {
      return fromCache();
    }
    if (res && res.ok) {
      const copy = res.clone();
      // rattaché à waitUntil : le worker ne peut pas être tué avant la fin de l'écriture du cache
      e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}));
    }
    return res;
  })());
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
  let cible = (e.notification.data && e.notification.data.url) || '/#friends';
  // N'accepter qu'une cible same-origin : le serveur n'envoie que '/#friends', mais un payload push
  // compromis (fuite de clé VAPID) ne doit pas pouvoir naviguer l'onglet Tome vers un site tiers.
  try{ if(new URL(cible, self.location.origin).origin !== self.location.origin) cible = '/#friends'; }
  catch(_){ cible = '/#friends'; }
  // réutiliser un onglet déjà ouvert plutôt que d'en empiler un nouveau
  e.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    for(const c of clientsList){
      if(new URL(c.url).origin === self.location.origin){ await c.focus(); if('navigate' in c) await c.navigate(cible); return; }
    }
    await self.clients.openWindow(cible);
  })());
});
