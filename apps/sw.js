const CACHE_NAME = 'recuentos-campo-v15'; // subir este número obliga a refrescar el caché entero
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
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== 'rc-config').map(k => caches.delete(k)))
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

// ─────────────────────────────────────────────────────────────────────────────
// AVISOS "TE TOCA EVALUAR" (Web Push)
// El Worker manda un empuje SIN contenido; aquí, al despertar, preguntamos qué le toca a ESTE
// celular (/pendientes?endpoint=...) y armamos el texto. Así el aviso siempre refleja el estado
// real y no hace falta cifrar nada en el servidor.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_WORKER_BASE = 'https://weathered-recipe-d18c.ignagher.workers.dev';

async function baseDelWorker() {
  try {
    const c = await caches.open('rc-config');
    const r = await c.match('/config.json');
    if (r) { const j = await r.json(); if (j && j.base) return j.base; }
  } catch (e) { /* usa el valor por defecto */ }
  return DEFAULT_WORKER_BASE;
}

function textoAviso(items) {
  const nombre = (it) => `${it.finca} · ${it.lote}`;
  const cuando = (it) => it.estado === 'Vencido' ? 'ya venció' : (it.dias === 0 ? 'vence hoy' : it.dias === 1 ? 'vence mañana' : `vence en ${it.dias} días`);
  if (items.length === 1) return { title: 'Te toca evaluar', body: `${nombre(items[0])}: recuento (${cuando(items[0])})` };
  const resto = items.slice(0, 3).map(nombre).join(', ');
  return { title: `Te toca evaluar ${items.length} lotes`, body: resto + (items.length > 3 ? ` y ${items.length - 3} más` : '') };
}

async function armarNotificacion() {
  const generica = { title: 'Te toca evaluar', body: 'Hay recuentos pendientes en tus lotes. Abre la app para verlos.' };
  try {
    const reg = self.registration;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return generica;
    const base = await baseDelWorker();
    const resp = await fetch(`${base}/pendientes?endpoint=${encodeURIComponent(sub.endpoint)}`);
    if (!resp.ok) return generica;
    const datos = await resp.json();
    if (!datos.items || !datos.items.length) return null; // ya no hay nada pendiente: no molestar
    return textoAviso(datos.items);
  } catch (e) {
    return generica;
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const msg = await armarNotificacion();
    // Algunos navegadores exigen mostrar SIEMPRE una notificación tras un push; si ya no hay
    // pendientes, mostramos un texto neutro y la cerramos enseguida.
    const m = msg || { title: 'Recuentos de campo', body: 'Sin recuentos pendientes por ahora.' };
    await self.registration.showNotification(m.title, {
      body: m.body, tag: 'rc-pendientes', renotify: true,
      data: { url: self.registration.scope },
    });
    if (!msg) {
      const abiertas = await self.registration.getNotifications({ tag: 'rc-pendientes' });
      setTimeout(() => abiertas.forEach(n => n.close()), 3000);
    }
    const clientes = await self.clients.matchAll({ type: 'window' });
    clientes.forEach(c => c.postMessage({ tipo: 'pendientes' }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const destino = (event.notification.data && event.notification.data.url) || self.registration.scope;
    const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clientes) {
      if ('focus' in c) { c.postMessage({ tipo: 'pendientes' }); return c.focus(); }
    }
    return self.clients.openWindow(destino);
  })());
});
