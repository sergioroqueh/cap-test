// C53: actual browser PDF regression for the jsPDF security upgrade.
// Read-only local preview, with no Supabase, cloud, scoring or UI modifications.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {inflateSync} from 'node:zlib'
import {chromium} from 'playwright'

const BASE='http://127.0.0.1:4173/'
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
const consoleErrors=[]
function decodedStreams(bytes){
 const binary=bytes.toString('latin1')
 return [...binary.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
  .map(m=>{try{return inflateSync(Buffer.from(m[1],'latin1')).toString('latin1')}
   catch{return m[1]}}).join('\n')
}
async function downloadAndCheck(page,tag){
 const btn=page.locator('.focus-study-pdf-button')
 await btn.waitFor({timeout:20000})
 assert.equal(await btn.count(),1,'Exactly one study PDF control')
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:45000}),btn.click()])
 const filename=download.suggestedFilename()
 assert.match(filename,/^rutacap-.*-soluciones\.pdf$/)
 const bytes=await readFile(await download.path())
 assert.equal(bytes.subarray(0,5).toString(),'%PDF-','Valid PDF magic header')
 assert.ok(bytes.includes(Buffer.from('%%EOF')),'Complete PDF')
 assert.ok(bytes.length>12000,'Full test, not a short placeholder')
 const pages=(bytes.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length
 assert.ok(pages>=2,'Questions and answer sheet pages')
 const stream=decodedStreams(bytes)
 assert.ok(stream.includes('HOJA DE RESPUESTAS CORRECTAS'),'Visible marked answer sheet')
 assert.ok(stream.includes('Casilla rellena'),'Legend for marked options')
 assert.ok(!stream.includes('SOLUCIONARIO'),'No redundant second solutions page')
 if(tag==='r27'){
  assert.ok(stream.includes('NOTAS DE REVISION TECNICA'),'Technical notes included')
  assert.ok(stream.includes('Pregunta 2 | Original: B | Tecnica: C'),'Historical and technical decisions preserved')
  assert.ok(stream.includes('NP - sin puntuar'),'Excluded questions not misleadingly marked')
 }
 console.log('C53 PDF PASS '+JSON.stringify({tag,pages,bytes:bytes.length,filename}))
}
try{
 const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true})
 const page=await context.newPage()
 page.on('pageerror',e=>consoleErrors.push('pageerror: '+e.message))
 page.on('console',m=>{if(m.type()==='error')consoleErrors.push('console: '+m.text())})
 await page.goto(BASE,{waitUntil:'domcontentloaded'})
 await page.locator('.pro-dashboard').waitFor({timeout:30000})
 // Match the already-established guest flow in e2e_cap_focus.mjs.
 await page.locator('header .gear').click()
 await page.locator('.pro-guest-button').click()
 await page.locator('.pro-dashboard').waitFor({timeout:20000})
 await page.locator('.focus-practice-grid button').filter({hasText:'Por convocatoria'}).click()
 const historical=page.locator('#cap-historicos .list button[data-source-pages="218–237"]')
 assert.equal(await historical.count(),1,'Expected frozen Dec 2023 exam')
 await historical.click()
 await page.locator('.focus-question').waitFor({timeout:30000})
 const active=await page.evaluate(()=>JSON.parse(localStorage.getItem('cap-test-beta-active-v1')||'null'))
 assert.equal(active.questionIds.length,100,'100 real historical questions')
 await downloadAndCheck(page,'r27')
 assert.deepEqual(consoleErrors,[],'No browser errors in export flow')
 await context.close()
} finally {
 await browser.close()
}
