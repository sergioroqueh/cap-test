const CACHE = 'cap-test-2026-10-06'
const BASE = '/cap-test/'
const CORE = [
  BASE,
  `${BASE}index.html`,
  `${BASE}manifest.webmanifest`,
  `${BASE}icon.svg`,
  `${BASE}data/index.json`
]

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await cache.addAll(CORE)
    try {
      const response = await fetch(`${BASE}data/index.json`)
      const index = await response.json()
      const bankFiles = index.questionnaires.map((item) => `${BASE}${item.path}`)
      await cache.addAll(bankFiles)
    } catch (_) {
      // La app sigue siendo instalable aunque falle la precarga completa del banco.
    }
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== location.origin || !url.pathname.startsWith(BASE)) return

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone()
      caches.open(CACHE).then((cache) => cache.put(BASE, copy))
      return response
    }).catch(() => caches.match(BASE)))
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(event.request, copy))
      }
      return response
    }))
  )
})
