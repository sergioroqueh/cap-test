const CACHE = 'cap-test-2026-11-19-network-first-v1'
const BASE = '/cap-test/'
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
      const response = await fetch(`${BASE}data/index.json`, {cache: 'no-cache'})
      const index = await response.json()
      const bankFiles = index.questionnaires.map((item) => `${BASE}${item.path}`)
      await cache.addAll(bankFiles)
      const exams = await fetch(BASE + 'data/exams/index.json', {cache: 'no-cache'}).then(r=>r.json())
      const examFiles = exams.exams.map(item => BASE + item.path)
      await cache.addAll(examFiles)
    } catch (_) {
      // La app sigue siendo instalable aunque falle la precarga completa del banco.
    }
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('cap-test-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  )
})


async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE)
  try {
    // Revalidar la cache HTTP del navegador para obtener datos y codigo actuales.
    const response = await fetch(request, {cache: 'no-cache'})
    if (response.ok) {
      try {
        await cache.put(cacheKey, response.clone())
      } catch (_) {
        // Si falla la escritura offline, mantener operativa la respuesta online.
      }
      return response
    }
    // Ante caidas temporales del servidor, recuperar la ultima copia valida.
    if (response.status >= 500) return (await cache.match(cacheKey)) || response
    return response
  } catch (error) {
    const cached = await cache.match(cacheKey)
    if (cached) return cached
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== location.origin || !url.pathname.startsWith(BASE)) return
  // Evitar cachear respuestas autenticadas y callbacks de acceso.
  if (url.searchParams.has('code') || url.searchParams.has('error') ||
      event.request.headers.has('Authorization')) return
  if (url.pathname === BASE + 'sw.js') return

  const cacheKey = event.request.mode === 'navigate' ? BASE : event.request
  event.respondWith(networkFirst(event.request, cacheKey))
})
