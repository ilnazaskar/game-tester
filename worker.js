/* eslint-disable no-restricted-globals */
const self = this;
const FILE_CACHE = new Map();

// Базовый путь — папка, где лежит worker.js
const BASE_PATH = self.location.pathname.replace(/\/[^\/]*$/, ''); // '/game-tester' на GitHub Pages или '' локально
const GAME_PREFIX = BASE_PATH + '/game/';

self.addEventListener('install', (event) => self.skipWaiting());
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CACHE_FILES') {
    FILE_CACHE.clear();
    console.log(`[SW] --- START CACHING ---`);
    
    for (const file of event.data.files) {
      // 1. Приводим слеши к одному виду
      let cleanPath = file.path.replace(/\\/g, '/');
      // 2. Убираем ./ в начале
      if (cleanPath.startsWith('./')) cleanPath = cleanPath.substring(2);
      if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
      
      FILE_CACHE.set(cleanPath, file.blob);
      // Лог, чтобы видеть структуру (скрой, если мешает)
      // console.log(`[SW] Cached: "${cleanPath}"`);
    }
    console.log(`[SW] Cached total: ${FILE_CACHE.size} files.`);
    event.source.postMessage({ type: 'CACHE_COMPLETE' });
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith(GAME_PREFIX)) {
    // Получаем "чистое" имя файла, который просит браузер
    let rawPath = url.pathname.replace(GAME_PREFIX, '');
    let requestedPath = decodeURIComponent(rawPath);
    if (requestedPath.startsWith('/')) requestedPath = requestedPath.substring(1);

    // --- ЛОГИКА ПОИСКА ---
    
    // 1. Точное совпадение
    let blob = FILE_CACHE.get(requestedPath);

    // 2. Поиск "хвоста" (если игра лежит в папке внутри ZIP)
    if (!blob) {
        for (const [cachePath, fileBlob] of FILE_CACHE.entries()) {
            // Если путь в кэше заканчивается на то, что мы ищем
            // Пример: кэш "folder/images/sprite.png", ищем "images/sprite.png"
            if (cachePath.endsWith(requestedPath)) {
                blob = fileBlob;
                break;
            }
            // Или наоборот (иногда бывает)
            if (requestedPath.endsWith(cachePath)) {
                blob = fileBlob;
                break;
            }
        }
    }

    if (blob) {
      // Определяем MIME тип, чтобы браузер не ругался
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
    
    // 3. БЛОКИРОВКА ВНУТРЕННЕГО ВОРКЕРА ИГРЫ
    // Если игра просит sw.js, мы отдаем пустой JS файл с кодом 200.
    // Это уберет красные ошибки в консоли.
    if (requestedPath.includes('sw.js') || requestedPath.includes('offline.json')) {
        console.log(`[SW] Mocking internal system file: ${requestedPath}`);
        event.respondWith(new Response('console.log("Mock SW loaded");', { 
            status: 200, 
            headers: { 'Content-Type': 'application/javascript' }
        }));
        return;
    }

    console.warn(`[SW] Missing: ${requestedPath}`);
    // Отдаем пустой ответ 200, чтобы не крашить игру
    event.respondWith(new Response('', { status: 200 }));
    return;
  }
});
