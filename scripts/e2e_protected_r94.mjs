// Browser integration against the dedicated local artifact only. No Supabase.
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFileSync,lstatSync} from 'node:fs'
import {resolve,extname} from 'node:path'
import {chromium} from 'playwright'
const root=resolve('dist-protected')
const allowed=/^\/(?:index\.html|manifest\.webmanifest|icon\.svg|sw\.js|catalog\.json|assets\/[A-Za-z0-9_-]+\.(?:js|css))$/
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'}
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname
 res.setHeader('Cache-Control','no-store')
 if(path==='/seed'){res.setHeader('Content-Type','text/html');res.end('<html lang="es"><body>synthetic seed</body></html>');return}
 const file=path==='/'?'/index.html':path
 if(!allowed.test(file)){res.writeHead(404);res.end();return}
 try{
  const target=resolve(root,'.'+file)
  if(!target.startsWith(root+'/')||!lstatSync(target).isFile())throw Error('denied')
  res.setHeader('Content-Type',mime[extname(target)]||'application/octet-stream')
  res.end(readFileSync(target))
 }catch{res.writeHead(404);res.end()}
})
await new Promise(resolve=>server.listen(4189,'127.0.0.1',resolve))
let browser
try{
 browser=await chromium.launch({headless:true})
 const context=await browser.newContext()
 await context.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:4189/')?route.continue():route.abort())
 const page=await context.newPage()
 const origin='http://127.0.0.1:4189'
 await page.goto(origin+'/seed')
 await page.evaluate(async()=>{
  await (await caches.open('cap-test-pro:/:legacy')).put('/data/questions/synthetic.json',new Response('SYNTHETIC OLD DATA'))
  await caches.open('unrelated-app-cache')
 })
 await page.goto(origin+'/')
 await page.getByRole('button',{name:'Continuar como invitado'}).waitFor({timeout:25000})
 await page.getByRole('button',{name:'Continuar como invitado'}).click()
 await page.getByText('No hay unidades autorizadas para esta modalidad.').waitFor()
 const state=await page.evaluate(async()=>({
  keys:await caches.keys(),
  old:(await fetch('/data/questions/synthetic.json')).status,
  catalog:await (await fetch('/catalog.json')).json(),
  controlled:!!navigator.serviceWorker.controller
 }))
 assert.equal(state.controlled,true)
 assert.ok(!state.keys.includes('cap-test-pro:/:legacy'))
 assert.ok(state.keys.includes('unrelated-app-cache'))
 assert.equal(state.old,410)
 assert.deepEqual(state.catalog,{schemaVersion:1,items:[]})
 await context.setOffline(true)
 await assert.rejects(()=>page.evaluate(()=>fetch('/catalog.json')))
 console.log('PASS R94 protected build, legacy-cache purge, no static corpus and no offline fallback')
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
