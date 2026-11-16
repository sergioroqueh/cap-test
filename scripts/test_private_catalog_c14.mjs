import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { validatePrivateStage } from '../src/privateCatalog.ts'
const hash='a'.repeat(64)
function fixture(){
 const occurrences=[]
 for(const kind of ['global','promotion']){
  const nums=kind==='global'?Array.from({length:103},(_,i)=>i+1):[...Array.from({length:25},(_,i)=>i+1),101]
  for(const number of nums)occurrences.push({occurrenceId:'clm:2026-01-01:mercancias:'+kind+':a:'+String(number).padStart(3,'0'),modelId:'synthetic-'+kind,number,sourcePage:1,templatePage:2,sourceHash:hash,templateHash:hash,initialKey:'C',question:'Pregunta sintética '+number,options:{A:'Uno',B:'Dos',C:'Tres',D:'Cuatro'},releaseAllowed:false,scoringAllowed:false,progressMigrationAllowed:false})
 }
 return {schemaVersion:1,stageOnly:true,releaseAllowed:false,scoringAllowed:false,sourceCorpusSha256:hash,occurrences}
}
assert.equal(validatePrivateStage(fixture()).count,129)
for(const mutate of [x=>x.scoringAllowed=true,x=>x.releaseAllowed=true,x=>x.occurrences[0].progressMigrationAllowed=true,x=>x.occurrences.push(x.occurrences[0]),x=>x.occurrences.shift(),x=>x.occurrences[0].initialKey='E',x=>x.occurrences[0].sourceHash='x',x=>delete x.occurrences[0].options.A]){
 const x=fixture();mutate(x);assert.throws(()=>validatePrivateStage(x))
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
try{
 const p=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'})
 const outbound=[],errors=[]
 p.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:4188/'))outbound.push(r.url())})
 p.on('pageerror',e=>errors.push(e.message))
 await p.goto('http://127.0.0.1:4188/')
 await p.locator('[data-private-catalog]').waitFor()
 const upload=async x=>p.locator('#rc-file').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(x))})
 await upload(fixture())
 await p.getByText('2 modelos · 129 posiciones',{exact:true}).waitFor()
 assert.match(await p.locator('h2').innerText(),/Pregunta sintética 1$/)
 await p.getByRole('button',{name:'Ver respuesta inicial'}).click()
 assert.match(await p.getByTestId('initial-key').innerText(),/: C\./)
 await p.getByRole('button',{name:'Siguiente ›'}).click()
 assert.equal(await p.getByTestId('initial-key').count(),0)
 await p.locator('#rc-model').selectOption('synthetic-promotion')
 await p.getByText('1/26',{exact:true}).waitFor()
 await p.locator('#rc-filter').fill('101')
 await p.getByText('Pregunta 101 · Reserva',{exact:true}).waitFor()
 await p.locator('#rc-filter').fill('sin resultados')
 await p.getByText('Sin coincidencias.',{exact:true}).waitFor()
 await p.getByRole('button',{name:'Cerrar y vaciar catálogo'}).click()
 assert.equal(await p.locator('#rc-model').count(),0)
 const unsafe=fixture();unsafe.occurrences[0].scoringAllowed=true;await upload(unsafe)
 await p.getByRole('alert').waitFor()
 assert.equal(await p.locator('#rc-model').count(),0)
 await upload(fixture());await p.getByText('2 modelos · 129 posiciones',{exact:true}).waitFor()
 assert.equal(await p.evaluate(()=>localStorage.length+sessionStorage.length),0)
 assert.equal(await p.evaluate(async()=> (await indexedDB.databases()).length),0)
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await p.reload();await p.locator('#rc-file').waitFor();assert.equal(await p.locator('#rc-model').count(),0)
 assert.deepEqual(outbound,[]);assert.deepEqual(errors,[])
 console.log('C14 synthetic validation/browser PASS; no corpus uploaded')
}finally{await browser.close()}
