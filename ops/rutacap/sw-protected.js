// R94: network only. No precache, no offline fallback, no question storage.
const BASE=new URL(self.registration.scope).pathname
const VERSION='rutacap-protected-network-only-v1'
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()))
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys()
 await Promise.all(keys.filter(key=>key.startsWith('cap-test-pro:'+BASE+':')||key.startsWith('rutacap-protected:'+BASE+':')).map(key=>caches.delete(key)))
 await self.clients.claim()
})()))
self.addEventListener('message',event=>{
 if(event.data==='R94_WORKER_VERSION'&&event.ports[0])event.ports[0].postMessage(VERSION)
})
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url)
 if(url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return
 if(event.request.method!=='GET')return
 const relative=url.pathname.slice(BASE.length)
 if(/^(?:data|data-src|private|artifacts)(?:\/|$)/i.test(relative)){
  event.respondWith(new Response('Contenido no disponible en esta ruta.',{status:410,headers:{'Cache-Control':'no-store'}}))
  return
 }
 event.respondWith(fetch(event.request,{cache:'no-store'}))
})
