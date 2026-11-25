// Service Worker: interface disponível offline (as APIs continuam no servidor).
const CACHE = 'jarvis-v1';
const ASSETS = ['/', '/index.html', '/css/jarvis.css', '/js/app.js', '/js/core/bus.js', '/js/core/api.js', '/js/core/state.js', '/js/core/settings.js', '/js/core/logger.js',
  '/js/modules/hearing.js', '/js/modules/voice.js', '/js/modules/clap.js', '/js/modules/clap-detector.js', '/js/modules/clap-worklet.js', '/js/modules/sounds.js',
  '/js/ui/core-viz.js', '/js/ui/dom.js', '/js/ui/sheet.js', '/js/ui/bible-reader.js', '/js/ui/news-panel.js', '/js/ui/panels.js', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return; // dados nunca vêm do cache
  // Rede primeiro (sempre a versão mais nova); cache se estiver offline.
  e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html'))));
});
