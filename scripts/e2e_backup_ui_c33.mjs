// C33 real UI smoke: mobile + desktop, manual download/import, errors, identity switch.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const URL='http://127.0.0.1:5173/'
const A='11111111-1111-4111-8111-111111111111'
const browser=await chromium.launch({headless:true})
const network=[]
const contexts=[]
const toFile=(name,data)=>({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))})
async function openProfile(viewport,isMobile=false){
 const context=await browser.newContext({viewport,isMobile,hasTouch:isMobile,acceptDownloads:true})
 contexts.push(context)
 const page=await context.newPage()
 page.on('request',r=>{if(/\.supabase\.co|\/rest\/v1\/|\/auth\/v1\//.test(r.url()))network.push(r.url())})
 await page.goto(URL)
 const guest=page.getByRole('button',{name:/Continuar como invitado/i})
 await guest.waitFor({state:'visible',timeout:15000})
 await guest.click()
 await page.goto(URL+'#/settings')
 await page.getByRole('heading',{name:'Copia de seguridad'}).waitFor({state:'visible',timeout:15000})
 return page
}
try{
 const mobile=await openProfile({width:375,height:812},true)
 const horizontal=await mobile.evaluate(()=>({
  width:innerWidth,scroll:document.documentElement.scrollWidth,
  heading:document.querySelector('.backup-panel')?.getBoundingClientRect().width
 }))
 assert.ok(horizontal.scroll <= horizontal.width+1,JSON.stringify(horizontal))
 assert.ok(horizontal.heading>0)

 await mobile.evaluate(async()=>{
  const db=await import('/src/db.ts')
  const journal=await import('/src/localJournal.ts')
  await db.clearAllData()
  await journal.recordStudyAnswer({eventId:'ui-answer',questionId:'ui-question',
   questionnaireId:'cap-mob',answer:'A',correct:true})
  await db.addSession({clientId:'ui-exam',type:'exam',label:'CAP móvil',startedAt:100,
   completedAt:200,total:2,answered:1,correct:1,incorrect:0,score:50,
   answers:[{questionId:'ui-question',questionnaireId:'cap-mob',selected:'A',
    correctAnswer:'A',correct:true},{questionId:'other',questionnaireId:'cap-mob',
    correctAnswer:'B',correct:false}]})
 })
 const [download]=await Promise.all([
  mobile.waitForEvent('download',{timeout:15000}),
  mobile.getByRole('button',{name:/Exportar copia/}).click()
 ])
 const original=JSON.parse(await readFile(await download.path(),'utf8'))
 assert.equal(original.version,3)
 assert.equal(original.owner.kind,'guest')
 assert.equal(original.progress.length,1)
 assert.equal(original.sessions[0].answers.length,2)
 assert.ok(original.checksum)
 await mobile.getByRole('status').filter({hasText:/Copia preparada/}).waitFor()
 console.log('C33 MOBILE PASS download full v3 backup with deferred revoke')

 // Test manual restore from user-visible selector; cancel must never write.
 await mobile.evaluate(async()=>{await (await import('/src/db.ts')).clearAllData()})
 const file=mobile.locator('.backup-file-input')
 await file.setInputFiles(toFile('copias.json',original))
 await mobile.getByRole('heading',{name:'Antes de restaurar'}).waitFor()
 assert.match(await mobile.locator('.backup-preview').innerText(),/1\s+pregunta(s)?/)
 await mobile.getByRole('button',{name:'Cancelar'}).click()
 assert.equal(await mobile.evaluate(async()=>(await import('/src/db.ts')).getAllProgress().then(x=>x.length)),0)
 await file.setInputFiles(toFile('rutacap.json',original))
 await mobile.getByRole('button',{name:'Confirmar restauración'}).click()
 await mobile.getByRole('status').filter({hasText:/Copia restaurada/}).waitFor()
 const restored=await mobile.evaluate(async()=>{
  const db=await import('/src/db.ts')
  return {questions:(await db.getAllProgress()).length,sessions:(await db.getRecentSessions(10)).length}
 })
 assert.deepEqual(restored,{questions:1,sessions:1})
 await file.setInputFiles(toFile('repetida.json',original))
 await mobile.getByRole('button',{name:'Confirmar restauración'}).click()
 await mobile.getByRole('status').filter({hasText:/Copia restaurada/}).waitFor()
 assert.equal(await mobile.evaluate(async()=>(await import('/src/db.ts')).getRecentSessions(10).then(x=>x.length)),1)
 console.log('C33 MOBILE PASS cancel, validated preview, restore and idempotent retry')

 const changed=structuredClone(original)
 changed.progress[0].attempts=400
 await file.setInputFiles(toFile('alterado.json',changed))
 await mobile.getByRole('alert').filter({hasText:/huella de integridad/i}).waitFor()
 assert.equal(await mobile.locator('.backup-preview').count(),0)
 await file.setInputFiles({name:'invalido.json',mimeType:'application/json',buffer:Buffer.from('{')})
 await mobile.getByRole('alert').filter({hasText:/JSON válido/}).waitFor()
 assert.equal(await mobile.locator('.backup-preview').count(),0)

 await file.setInputFiles(toFile('cuenta-invitado.json',original))
 await mobile.getByRole('heading',{name:'Antes de restaurar'}).waitFor()
 await mobile.evaluate(A=>(import('/src/localScope.ts').then(scope=>scope.setLocalOwner(A))),A)
 // C34 proactively discards the preview and its selected file on owner change:
 // there must no longer be a "Confirmar" button to click.
 await mobile.locator('.backup-preview').waitFor({state:'detached'})
 assert.equal(await mobile.getByRole('button',{name:'Confirmar restauración'}).count(),0)
 await mobile.evaluate(()=>import('/src/localScope.ts').then(scope=>scope.setLocalOwner(null)))
 console.log('C33 MOBILE PASS tampered/invalid files and account switch during preview')

 // Desktop is a separate browser context, simulating a manual backup transfer.
 const desktop=await openProfile({width:1280,height:800})
 await desktop.locator('.backup-file-input').setInputFiles(toFile('manual-export.json',original))
 await desktop.getByRole('heading',{name:'Antes de restaurar'}).waitFor()
 await desktop.getByRole('button',{name:'Confirmar restauración'}).click()
 await desktop.getByRole('status').filter({hasText:/Copia restaurada/}).waitFor()
 const counts=await desktop.evaluate(async()=>{
  const db=await import('/src/db.ts')
  return {progress:(await db.getAllProgress()).length,sessions:(await db.getRecentSessions()).length}
 })
 assert.deepEqual(counts,{progress:1,sessions:1})
 const dDimensions=await desktop.evaluate(()=>({
  width:innerWidth,scroll:document.documentElement.scrollWidth
 }))
 assert.ok(dDimensions.scroll<=dDimensions.width+1,JSON.stringify(dDimensions))
 console.log('C33 DESKTOP PASS manual restore into independent browser')
 assert.deepEqual(network,[],'No Supabase network requests allowed')
 console.log('C33 PASS zero Supabase network calls')
}finally{
 for(const context of contexts)await context.close()
 await browser.close()
}
