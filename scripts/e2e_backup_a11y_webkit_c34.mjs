// C34 real-browser accessibility/keyboard + WebKit engine smoke.
// Synthetic local guest only. WebKit on Linux is NOT physical iOS Safari.
import assert from 'node:assert/strict'
import {chromium,webkit} from 'playwright'
const URL='http://127.0.0.1:5173/'
const A='11111111-1111-4111-8111-111111111111'
const mockFile=(data,name='rutacap-test.json')=>({
 name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))
})
const outgoing=[]
async function openProfile(browser,options){
 const context=await browser.newContext({...options,acceptDownloads:true})
 const page=await context.newPage()
 page.on('request',r=>{
  if(/\.supabase\.co|\/rest\/v1\/|\/auth\/v1\//.test(r.url()))outgoing.push(r.url())
 })
 await page.goto(URL)
 await page.getByRole('button',{name:/Continuar como invitado/}).click()
 await page.goto(URL+'#/settings')
 await page.getByRole('heading',{name:'Copia de seguridad'}).waitFor()
 return {context,page}
}
const chromiumBrowser=await chromium.launch()
const chromiumCase=await openProfile(chromiumBrowser,{viewport:{width:360,height:740}})
try{
 const page=chromiumCase.page
 const backup=await page.evaluate(async()=>{
  const db=await import('/src/db.ts')
  await db.clearAllData()
  await (await import('/src/localJournal.ts')).recordStudyAnswer({
   eventId:'c34-study',questionId:'c34-q',questionnaireId:'cap',
   answer:'A',correct:true
  })
  return db.exportDatabase()
 })
 await page.evaluate(async()=>{
  await (await import('/src/db.ts')).clearAllData()
 })
 const select=page.getByRole('button',{name:/Seleccionar copia/})
 await select.focus()
 // Keyboard Enter must activate the real file chooser, not a hidden Tab stop.
 const [chooser]=await Promise.all([
  page.waitForEvent('filechooser',{timeout:12000}),
  page.keyboard.press('Enter')
 ])
 await chooser.setFiles(mockFile(backup))
 await page.getByRole('heading',{name:'Antes de restaurar'}).waitFor()
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'backup-preview-title')
 assert.equal(await page.locator('.backup-file-input').getAttribute('tabindex'),'-1')
 assert.equal(await page.locator('.backup-panel').getAttribute('aria-busy'),'false')
 await page.keyboard.press('Escape')
 assert.equal(await page.locator('.backup-preview').count(),0)
 assert.equal(await select.evaluate(e=>document.activeElement===e),true)
 assert.equal(await page.evaluate(async()=>{
  return (await (await import('/src/db.ts')).getAllProgress()).length
 }),0)
 console.log('C34 CHROMIUM keyboard PASS: Enter chooser, focus preview, Escape cancel, no write')

 await select.focus()
 const [chooser2]=await Promise.all([page.waitForEvent('filechooser'),page.keyboard.press('Enter')])
 await chooser2.setFiles(mockFile(backup))
 await page.getByRole('heading',{name:'Antes de restaurar'}).waitFor()
 const confirm=page.getByRole('button',{name:'Confirmar restauración'})
 await confirm.focus()
 await page.keyboard.press('Enter')
 await page.getByRole('status').filter({hasText:/Copia restaurada/}).waitFor()
 assert.equal(await select.evaluate(e=>document.activeElement===e),true)
 assert.equal(await page.evaluate(async()=>{
  return (await (await import('/src/db.ts')).getAllProgress()).length
 }),1)
 console.log('C34 CHROMIUM keyboard PASS: confirm using Enter and return focus')

 // Inject an account change WHILE the read-write transaction is reading rows.
 // The same-page owner listener aborts it synchronously, not only at a later check.
 await page.evaluate(async()=>{
  await (await import('/src/db.ts')).clearAllData()
 })
 await page.locator('.backup-file-input').setInputFiles(mockFile(backup))
 await page.getByRole('heading',{name:'Antes de restaurar'}).waitFor()
 const aborted=await page.evaluate(async(A)=>{
  const scope=await import('/src/localScope.ts')
  const original=IDBObjectStore.prototype.getAll
  window.c34Triggered=false
  IDBObjectStore.prototype.getAll=function(...args){
   const result=original.apply(this,args)
   if(!window.c34Triggered&&this.transaction.mode==='readwrite'&&this.name==='progress'){
    window.c34Triggered=true
    scope.setLocalOwner(A)
   }
   return result
  }
  return true
 },A)
 assert.equal(aborted,true)
 await confirm.click()
 await page.waitForFunction(()=>window.c34Triggered===true)
 await page.waitForFunction(()=>document.querySelector('.backup-preview')===null)
 const state=await page.evaluate(async()=>{
  IDBObjectStore.prototype.getAll=window.c34OriginalGetAll||IDBObjectStore.prototype.getAll
  const scope=await import('/src/localScope.ts')
  scope.setLocalOwner(null)
  const db=await import('/src/db.ts')
  return {rows:(await db.getAllProgress()).length}
 })
 assert.equal(state.rows,0,'Account change must not partially restore to prior guest')
 console.log('C34 CHROMIUM identity switch PASS: aborted before commit')

 // Export scope must not remain linked to previous account if auth changes
 // while hashing. Hook prototype only for this synthetic test.
 await page.evaluate(async(A)=>{
  const scope=await import('/src/localScope.ts')
  const original=SubtleCrypto.prototype.digest
  window.c34Digest=original
  window.c34DigestTriggered=false
  SubtleCrypto.prototype.digest=function(...args){
   if(!window.c34DigestTriggered){
    window.c34DigestTriggered=true
    scope.setLocalOwner(A)
   }
   return original.apply(this,args)
  }
 },A)
 let downloads=0
 page.on('download',()=>{downloads++})
 await page.getByRole('button',{name:/Exportar copia/}).click()
 await page.waitForFunction(()=>window.c34DigestTriggered===true)
 await page.waitForTimeout(150)
 assert.equal(downloads,0,'Export after profile change must not download old profile data')
 await page.evaluate(async()=>{
  SubtleCrypto.prototype.digest=window.c34Digest
  ;(await import('/src/localScope.ts')).setLocalOwner(null)
 })
 console.log('C34 CHROMIUM identity switch PASS: no obsolete-account download')

 const dims=await page.evaluate(()=>({inner:innerWidth,scroll:document.documentElement.scrollWidth}))
 assert.ok(dims.scroll<=dims.inner+1,JSON.stringify(dims))
} finally {
 await chromiumCase.context.close()
 await chromiumBrowser.close()
}
const webkitBrowser=await webkit.launch({headless:true})
try{
 const testCase=await openProfile(webkitBrowser,{
  viewport:{width:390,height:844},isMobile:true,hasTouch:true
 })
 try{
  const page=testCase.page
  const dims=await page.evaluate(()=>({inner:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(dims.scroll<=dims.inner+1,JSON.stringify(dims))
  const backup=await page.evaluate(async()=>{
   const db=await import('/src/db.ts')
   await db.clearAllData()
   await (await import('/src/localJournal.ts')).recordStudyAnswer({
    eventId:'webkit-q1',questionId:'webkit-q',questionnaireId:'cap',
    answer:'D',correct:false
   })
   return db.exportDatabase()
  })
  const [download]=await Promise.all([
   page.waitForEvent('download',{timeout:20000}),
   page.getByRole('button',{name:/Exportar copia/}).click()
  ])
  assert.ok(download.suggestedFilename().endsWith('.json'))
  await page.evaluate(async()=>{await (await import('/src/db.ts')).clearAllData()})
  await page.locator('.backup-file-input').setInputFiles(mockFile(backup))
  await page.getByRole('heading',{name:'Antes de restaurar'}).waitFor()
  await page.getByRole('button',{name:'Confirmar restauración'}).click()
  await page.getByRole('status').filter({hasText:/Copia restaurada/}).waitFor()
  const rows=await page.evaluate(async()=>(await (await import('/src/db.ts')).getAllProgress()).length)
  assert.equal(rows,1)
  console.log('C34 WEBKIT PASS: emulated mobile download + restore, no overflow')
 }finally{await testCase.context.close()}
}finally{await webkitBrowser.close()}
assert.deepEqual(outgoing,[])
console.log('C34 PASS zero Supabase network calls')
