// Service worker: hace que la app se pueda instalar, funcione sin conexión
// (muestra un aviso) y reciba notificaciones. Siempre pide primero la versión
// nueva a la nube, así cada actualización llega sola a todos los celulares.
const CACHE = 'huerto-v2';
const BASE = ['/', '/app.css', '/app.js', '/cerebro.js', '/logo.svg', '/icon-192.png', '/offline.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(r).then(res => {
      if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(r, copia)); }
      return res;
    }).catch(async () => (await caches.match(r)) || (r.mode === 'navigate' ? caches.match('/offline.html') : Response.error()))
  );
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('/#alertas')));
});
