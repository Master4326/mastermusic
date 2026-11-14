/* ==========================================================
   Service Worker — MASTER MUSIC PWA
   Cachea el "app shell" para que el reproductor abra offline
   y se pueda instalar en celular y PC.
   Sube el número de CACHE cuando cambies archivos del shell.
   ========================================================== */
const CACHE = 'mastermusic-v135';

// Archivos locales que forman la app. Las pistas de música del
// usuario NO se cachean aquí: viven en IndexedDB (ver js/db.js).
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  // la base, hoja a hoja y en su orden (ver el comentario de index.html)
  './css/base.css',
  // el catálogo del modo edit
  './css/edit.css',
  // los aspectos modernos: solo se USAN si eliges uno (al abrir se pide la
  // base y, en los cinco «mundos», su hoja propia), pero se guardan aquí
  // para que también abran sin conexión
  './css/aspectos.css',
  './css/aspecto-hifi.css',
  './css/aspecto-vinilo.css',
  './css/aspecto-aero.css',
  './css/aspecto-manga.css',
  './css/aspecto-revista.css',
  // la vista palabra ◉: igual que los aspectos, solo se USA si se elige
  // (js/letra/ la pide entonces), pero se guarda para que abra sin conexión
  './css/palabra.css',
  './js/palabra.js',
  './css/fuentes/DSEG7ClassicMini-Italic.woff2',
  './js/perf.js',
  './js/teclas.js',
  './js/dialogo.js',
  './js/movil.js',
  './js/caratula.js',
  './js/db.js',
  './js/letra.js',
  './js/traductor.js',
  './js/similares.js',
  './js/spotify.js',
  './js/biblioteca.js',
  './js/historial.js',
  './js/stats.js',
  './js/buscador.js',
  './js/temporizador.js',
  './js/entradas.js',
  './js/app.js',
  './js/espectro.js',
  './js/seven.js',
  './js/aspecto.js',
  './js/settings.js',
  './js/ajustes-ui.js',
  './js/compartir.js',
  './js/fuentes.js',
  './js/fonts.js',
  './js/ambient.js',
  './js/luz.js',
  './js/beat.js',
  './js/cine.js',
  './js/colors.js',
  './js/ncs.js',
  './js/fondo.js',
  './js/mediasession.js',
  './js/vendor/jsmediatags.min.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll falla si un solo recurso falla; cacheamos uno a uno
      // para ser tolerantes (p.ej. si falta algún asset opcional).
      .then((cache) => Promise.all(
        SHELL.map((url) => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nunca interceptamos llamadas a APIs externas (Spotify, LRClib, el
  // traductor, ListenBrainz): siempre van a la red para datos en vivo.
  // Cachear una traducción aquí además sería tirar el dinero dos veces —
  // js/traductor.js ya guarda lo suyo en localStorage, por canción y sin
  // repetir versos; y js/similares.js guarda sus MBID por su cuenta.
  // (raw.githubusercontent.com: la letra palabra a palabra de AMLL, que
  // js/letra/ ya guarda en localStorage — aquí sería guardarla dos veces)
  const isApi = /spotify\.com|lrclib\.net|scdn\.co|listenbrainz\.org|translate\.googleapis\.com|mymemory\.translated\.net|raw\.githubusercontent\.com/.test(url.hostname);
  if (isApi) return;

  // App shell propio -> network-first (siempre lo último cuando hay red,
  // y caché como respaldo cuando estás offline).
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // Recursos externos (fuentes Google, CDNs) -> stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
