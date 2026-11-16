const BASE = new URL(self.registration.scope).pathname
const PREFIX = 'cap-test-pro:' + BASE + ':'
const CACHE = PREFIX + 'c1-2026-11-16'
const CORE = [
  BASE,
  `${BASE}index.html`,
  `${BASE}manifest.webmanifest`,
  `${BASE}icon.svg`,
  `${BASE}data/index.json`,
  `${BASE}data/exams/index.json`,
  `${BASE}data/exams/frequency_by_bank.json`
]

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await cache.addAll(CORE)
    try {
      const index = await fetch(BASE + 'data/index.json').then(r => r.json())
      await cache.addAll(index.questionnaires.map(item => BASE + item.path))
      const exams = await fetch(BASE + 'data/exams/index.json').then(r => r.json())
      await cache.addAll(exams.exams.map(item => BASE + item.path))
    } catch (_) {
      // Offline archive prefetch is best effort.
    }
    await self.skipWaiting()
  })())
})
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return
  // Never cache OAuth callback URLs or any authenticated request.
  if (url.searchParams.has('code') || url.searchParams.has('error') || event.request.headers.has('Authorization')) return
  // Only cache known static app assets, never arbitrary endpoints on a root domain.
  const relative = url.pathname.slice(BASE.length)
  const navigation = event.request.mode === 'navigate'
  if (!navigation && !/^(?:index\.html|manifest\.webmanifest|icon\.svg|assets\/|data\/)/.test(relative)) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    if (navigation) {
      try {
        const response = await fetch(event.request)
        if (response.ok && (relative === '' || relative === 'index.html') && !url.search) await cache.put(BASE, response.clone())
        return response
      } catch (error) {
        const cached = await cache.match(BASE)
        if (cached) return cached
        throw error
      }
    }
    const cached = await cache.match(event.request)
    if (cached) return cached
    const response = await fetch(event.request)
    if (response.ok) await cache.put(event.request, response.clone())
    return response
  })())
})
