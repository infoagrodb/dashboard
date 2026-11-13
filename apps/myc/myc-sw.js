const CACHE_NAME='madurez-campo-v14';
const ARCHIVOS=['./mycv1.html','./myc-manifest.json','./myc-icon-192.png','./myc-icon-512.png','./myc-icon-maskable-512.png','./myc-apple-touch-icon.png'];
// Cada archivo se guarda por separado: si uno falta, el service worker igual se instala (antes uno faltante lo tumbaba todo).
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>Promise.all(ARCHIVOS.map(u=>c.add(u).catch(()=>null)))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('madurez-campo-')&&x!==CACHE_NAME).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET')return; const u=new URL(r.url);
  if(u.origin!==location.origin)return;                       // Worker/Odoo: nunca desde caché
  e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(CACHE_NAME).then(c=>c.put(r,cp))}return res}).catch(()=>caches.match(r).then(m=>m||caches.match('./mycv1.html'))));
});
