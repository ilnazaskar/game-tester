/* eslint-disable no-restricted-globals */
const FILE_CACHE = new Map();

const BASE_PATH = self.location.pathname.replace(/\/[^\/]*$/, '');
const GAME_PREFIX = BASE_PATH + '/game/';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'CACHE_FILES') return;

  FILE_CACHE.clear();

  const files = Array.isArray(data.files) ? data.files : [];
  for (const file of files) {
    let cleanPath = String(file.path || '').replace(/\\/g, '/');
    if (cleanPath.startsWith('./')) cleanPath = cleanPath.slice(2);
    if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);
    FILE_CACHE.set(cleanPath, file.blob);
  }

  if (event.source && event.source.postMessage) {
    event.source.postMessage({ type: 'CACHE_COMPLETE' });
  }
});

const guessMime = (path, blob) => {
  let type = blob && blob.type;
  if (type && type !== 'application/octet-stream') return type;

  const p = String(path || '').toLowerCase();
  if (p.endsWith('.html')) return 'text/html';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'application/javascript';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.css')) return 'text/css';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.gif')) return 'image/gif';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  if (p.endsWith('.wasm')) return 'application/wasm';
  if (p.endsWith('.mp3')) return 'audio/mpeg';
  if (p.endsWith('.ogg')) return 'audio/ogg';
  if (p.endsWith('.wav')) return 'audio/wav';
  if (p.endsWith('.mp4')) return 'video/mp4';
  return 'application/octet-stream';
};

const findBlob = (requestedPath) => {
  let rp = String(requestedPath || '').replace(/\\/g, '/');
  if (rp.startsWith('/')) rp = rp.slice(1);

  if (rp === '' || rp.endsWith('/')) rp = rp + 'index.html';

  const direct = FILE_CACHE.get(rp);
  if (direct) return { blob: direct, path: rp };

  for (const [cachePath, fileBlob] of FILE_CACHE.entries()) {
    if (cachePath === rp) return { blob: fileBlob, path: cachePath };
    if (cachePath.endsWith('/' + rp) || cachePath.endsWith(rp)) {
      return { blob: fileBlob, path: cachePath };
    }
  }
  return null;
};

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(GAME_PREFIX)) return;

  const rawPath = url.pathname.slice(GAME_PREFIX.length);
  const requestedPath = decodeURIComponent(rawPath || '');

  // block game's internal SW/offline files
  if (
    requestedPath.includes('sw.js') ||
    requestedPath.includes('service-worker') ||
    requestedPath.includes('offline.json')
  ) {
    event.respondWith(
      new Response('console.log("Mock internal system file");', {
        status: 200,
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'no-store',
        },
      })
    );
    return;
  }

  const found = findBlob(requestedPath);
  if (found && found.blob) {
    const type = guessMime(found.path, found.blob);
    event.respondWith(
      new Response(found.blob, {
        status: 200,
        headers: {
          'Content-Type': type,
          'Cache-Control': 'no-store',
        },
      })
    );
    return;
  }

  event.respondWith(
    new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    })
  );
});
