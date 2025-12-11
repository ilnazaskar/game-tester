/* eslint-disable no-restricted-globals */
const self = this;
const FILE_CACHE = new Map();

self.addEventListener('install', (event) => self.skipWaiting());
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CACHE_FILES') {
    FILE_CACHE.clear();
    console.log(`[SW] --- START CACHING ---`);
    
    for (const file of event.data.files) {
      let cleanPath = file.path.replace(/\\/g, '/');
      if (cleanPath.startsWith('./')) cleanPath = cleanPath.substring(2);
      if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
      FILE_CACHE.set(cleanPath, file.blob);
    }
    console.log(`[SW] Cached total: ${FILE_CACHE.size} files.`);
    event.source.postMessage({ type: 'CACHE_COMPLETE' });
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ИЗМЕНЕНИЕ: Ищем /game/ в любой части пути, а не только в начале
  // Это нужно для работы внутри папки на GitHub Pages
  if (url.pathname.includes('/game/')) {
    
    // Берем всё, что идет ПОСЛЕ /game/
    // Было: /repo-name/game/index.html -> index.html
    let rawPath = url.pathname.split('/game/')[1];
    
    let requestedPath = decodeURIComponent(rawPath);
    if (requestedPath.startsWith('/')) requestedPath = requestedPath.substring(1);

    // 1. Точное совпадение
    let blob = FILE_CACHE.get(requestedPath);

    // 2. Поиск "хвоста"
    if (!blob) {
        for (const [cachePath, fileBlob] of FILE_CACHE.entries()) {
            if (cachePath.endsWith(requestedPath) || requestedPath.endsWith(cachePath)) {
                blob = fileBlob;
                break;
            }
        }
    }

    if (blob) {
      let type = blob.type;
      if (!type || type === 'application/octet-stream') {
          if (requestedPath.endsWith('.html')) type = 'text/html';
          else if (requestedPath.endsWith('.js')) type = 'application/javascript';
          else if (requestedPath.endsWith('.mjs')) type = 'application/javascript';
          else if (requestedPath.endsWith('.json')) type = 'application/json';
          else if (requestedPath.endsWith('.css')) type = 'text/css';
          else if (requestedPath.endsWith('.png')) type = 'image/png';
          else if (requestedPath.endsWith('.jpg')) type = 'image/jpeg';
          else if (requestedPath.endsWith('.wasm')) type = 'application/wasm';
      }

      event.respondWith(new Response(blob, {
        status: 200,
        headers: { 'Content-Type': type }
      }));
      return;
    } 
    
    // 3. Блокировка внутреннего SW
    if (requestedPath.includes('sw.js') || requestedPath.includes('offline.json')) {
        event.respondWith(new Response('console.log("Mock SW loaded");', { 
            status: 200, 
            headers: { 'Content-Type': 'application/javascript' }
        }));
        return;
    }

    // Пустой ответ вместо 404
    event.respondWith(new Response('', { status: 200 }));
    return;
  }
});
