/* medeetomilab service worker — offline-capable app shell.
   The build fills PRECACHE and the cache version with all hashed Vite assets:
   - same-origin navigations: network-first, fall back to the cached shell
   - same-origin assets: stale-while-revalidate
   - cross-origin (PubMed / OpenAI): always network, never cached
*/
const CACHE = 'medeetomilab-dev'
const SHELL = ['/', '/index.html', '/favicon.svg', '/icon.svg', '/icon-180.png', '/icon-512.png', '/manifest.webmanifest']
const PRECACHE = []

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([...new Set([...SHELL, ...PRECACHE])])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => (k.startsWith('medeetomilab-') || k === 'williamslab-v2') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // API calls: straight to network

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r })
        .catch(() => caches.match(req).then((m) => m || caches.match('/index.html'))),
    )
    return
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((r) => { if (r && r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)) } return r })
        .catch(() => cached)
      return cached || net
    }),
  )
})
