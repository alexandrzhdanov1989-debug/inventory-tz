// Реестр ТЗ: офлайн-оболочка только для инвентаризации.
// Данные техники хранятся отдельно в IndexedDB и не удаляются при обновлении.
const CACHE = 'inventory-tz-clean-v7';
const FILES = ['./', './index.html', './app.js', './style.css', './manifest.webmanifest', './icon.svg'];
const PREFIXES = ['inventory-tz-', 'inventory-tz-clean-'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name !== CACHE && PREFIXES.some(p => name.startsWith(p)))
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Не обслуживаем диагностические страницы, даже если они остались на GitHub.
  if (/^yandex(?:-|\.)/.test(url.pathname.split('/').pop())) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // При наличии интернета берём свежую версию, офлайн — кэшированную.
    try {
      const response = await fetch(req);
      if (response.ok && response.type === 'basic') {
        const copy = response.clone(); // клонировать ДО возврата ответа браузеру
        event.waitUntil(cache.put(req, copy).catch(() => {}));
      }
      return response;
    } catch (error) {
      const saved = await cache.match(req, {ignoreSearch: true});
      if (saved) return saved;
      if (req.mode === 'navigate') {
        const home = await cache.match('./index.html');
        if (home) return home;
      }
      throw error;
    }
  })());
});
