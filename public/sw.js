// Service Worker do JARVIS.
// - Interface disponível offline (cache dos arquivos estáticos).
// - Dados (/api/) NUNCA vêm do cache: nada antigo é mostrado como atual.
// - Nova versão: fica "esperando" até o usuário tocar em "Atualizar".
const VERSION = '2.0.0';
const CACHE = `jarvis-${VERSION}`;
const ASSETS = ['/', '/index.html', '/css/jarvis.css', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png',
  '/js/app.js', '/js/core/bus.js', '/js/core/api.js', '/js/core/state.js', '/js/core/settings.js', '/js/core/logger.js', '/js/core/offline-brain.js',
  '/js/modules/hearing.js', '/js/modules/voice.js', '/js/modules/clap.js', '/js/modules/clap-detector.js', '/js/modules/clap-worklet.js', '/js/modules/sounds.js', '/js/modules/device.js',
  '/js/modules/wake/index.js', '/js/modules/wake/wake-detector.js', '/js/modules/wake/browser-wake-detector.js', '/js/modules/wake/android-native-wake-detector.js',
  '/js/ui/core-viz.js', '/js/ui/dom.js', '/js/ui/sheet.js', '/js/ui/bible-reader.js', '/js/ui/news-panel.js', '/js/ui/panels.js', '/js/ui/diagnostics.js',
  '/shared/math.js', '/shared/units.js'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))); });
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Rede primeiro (até 4 s), cache se offline/lento.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([fetch(e.request), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      return (await cache.match(e.request, { ignoreSearch: true })) || (await cache.match('/index.html'));
    }
  })());
});

// Toque na notificação de lembrete: abre/foca o JARVIS.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow('/'))));
});
