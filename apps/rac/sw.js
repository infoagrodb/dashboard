// Subir CACHE_NAME junto con APP_VERSION de index.html en cada cambio
const CACHE_NAME = 'rac-v2026.11.24-2';
const ARCHIVOS = ['./', 'Recuentos%20Arranque%20y%20Combina.html', 'calc.js', 'pdf.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // el Worker (API) nunca se cachea
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE_NAME).then((ca) => ca.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('Recuentos%20Arranque%20y%20Combina.html'))));
});
