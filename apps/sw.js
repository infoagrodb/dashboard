const CACHE_NAME = 'recuentos-campo-v3'; // subir este número obliga a refrescar el caché entero
const APP_SHELL = [
  './recuentosEf.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first para el app shell: siempre intenta traer la versión más nueva primero.
// Solo cae al caché (para poder abrir la app sin internet) si la red falla o tarda demasiado.
// Así cualquier actualización que subas se ve de inmediato la próxima vez que haya señal,
// en vez de quedar "una versión atrás" como pasaba con cache-first.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isAppShell = APP_SHELL.some(p => url.pathname.endsWith(p.replace('./', '')));

  if (event.request.method !== 'GET') return; // no interceptar POST de sincronización

  if (isAppShell) {
    event.respondWith(
      Promise.race([
        fetch(event.request).then((networkResp) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResp.clone()));
          return networkResp;
        }),
        new Promise((_, reject) => setTimeout(reject, 3000)), // si la red tarda mucho, no esperar de más
      ]).catch(() => caches.match(event.request))
    );
  }
});
