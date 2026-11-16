import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import { chromium } from 'playwright'

const BASE=process.env.CAP_PREVIEW_URL||'http://127.0.0.1:4173/'
const artifacts='artifacts/cap-focus-e2e'
await mkdir(artifacts,{recursive:true})
const rank=JSON.parse(await readFile('artifacts/cap-r27-ranking.json','utf8'))
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
const readSession=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('cap-test-beta-active-v1')||'null'))
const readResult=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('cap-test-beta-last-v1')||'null'))
function pdfPageCommands(bytes) {
 const binary=bytes.toString('latin1')
 return [...binary.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
  .map(match=>{
    const stream=Buffer.from(match[1],'latin1')
    try{return inflateSync(stream).toString('latin1')}catch{return match[1]}
  }).join('\n')
}
async function assertPdfDownload(page, button, solved=false, checkDecodedText=true) {
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:45000}),button.click()])
 assert.match(download.suggestedFilename(),/\.pdf$/i)
 assert.equal(download.suggestedFilename().endsWith('-soluciones.pdf'),solved,'PDF file name should distinguish solved study copies')
 const bytes=await readFile(await download.path())
 assert.equal(bytes.subarray(0,5).toString(),'%PDF-')
 assert.ok(bytes.length>10000,'PDF should contain the complete printable test')
 assert.ok(bytes.includes(Buffer.from('%%EOF')),'PDF should be complete')
 const pages=(bytes.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length
 assert.ok(pages>=2,'PDF must contain questions and at least one answer sheet page')
 // jsPDF deflate streams are binary; textual inspection is an extra check where supported.
 if(!checkDecodedText)return
 const commands=pdfPageCommands(bytes)
 assert.ok(commands.includes('HOJA DE RESPUESTAS'),'PDF should contain a printable answer sheet')
 if(solved){
  assert.ok(commands.includes('HOJA DE RESPUESTAS CORRECTAS'),'Study copy should visibly label the correct-answer sheet')
  assert.ok(commands.includes('Casilla rellena'),'Study copy should explain the marked letters')
  assert.ok(!commands.includes('SOLUCIONARIO'),'Correct-answer grid replaces the redundant standalone list')
 }else{
  assert.ok(!commands.includes('HOJA DE RESPUESTAS CORRECTAS'),'Blank exam must not reveal marked answers')
 }
}
let checks=0
async function assertViewportFit(page,label){
 const width=page.viewportSize()?.width
 const actual=await page.evaluate(()=>document.documentElement.scrollWidth)
 assert.ok(width&&actual<=width+1,label+': document '+actual+'px exceeds viewport '+width+'px')
}
async function captureViewport(page,name){
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}))
 await page.screenshot({path:artifacts+'/'+name,fullPage:false})
}


async function openHome(context){
 const page=await context.newPage()
 const errors=[]
 page.on('pageerror',e=>errors.push('pageerror: '+e.message))
 page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())})
 page.on('response',r=>{if(r.status()>=400)errors.push('http '+r.status()+': '+r.url())})
 await page.goto(BASE,{waitUntil:'domcontentloaded'})
 try{await page.locator('.focus-primary').waitFor({timeout:12000})}
 catch(e){
  await page.screenshot({path:artifacts+'/home-load-error.png',fullPage:true})
  const body=(await page.locator('body').innerText()).slice(0,1800)
  throw new Error('CAP preview did not reach Focus home. URL='+page.url()+' BODY='+body+' ERRORS='+JSON.stringify(errors)+' CAUSE='+String(e))
 }
 return page
}
async function submit(page){
 await page.locator('.focus-quiz-actions button').last().click()
 const confirm=page.locator('.focus-dialog')
 if(await confirm.isVisible()){
   assert.match(await confirm.innerText(),/preguntas en blanco/i)
   await confirm.locator('.focus-dialog-confirm').click()
 }
 await page.locator('.result').waitFor({timeout:30000})
}
try{
 // Mobile: all 100 mixed questions, persisted answers, index, review marker, real scoring.
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1})
 const p=await openHome(mobile)
 await p.locator('.pro-dashboard').waitFor()
 await assertViewportFit(p,'390px commercial home')
 assert.equal(await p.locator('.pro-brand').first().evaluate(el=>getComputedStyle(el).color),'rgb(245, 247, 250)','brand must be legible in dark mode')
 assert.match(await p.locator('.cap-preview-banner').innerText(),/Datos locales.*Sin sincronización/s)
 assert.ok((await p.locator('.cap-preview-banner').boundingBox()).height<=35,'preview banner should not waste mobile vertical space')
 await captureViewport(p,'c4-mobile-home-viewport.png')
 assert.equal(await p.locator('.pro-bank>strong').innerText(),'8.655')
 assert.equal(await p.locator('.pro-track').getAttribute('aria-valuenow'),'0')
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'commercial home must fit mobile')
 await p.locator('.pro-region-feature').click()
 assert.equal(await p.locator('.pro-region-row').count(),19,'all Spanish communities and autonomous cities have a pictogram')
 assert.equal(await p.locator('.pro-region-row').filter({hasText:'Castilla-La Mancha'}).count(),1)
 const badges=await p.locator('.pro-region-row .pro-region-mark').evaluateAll(nodes=>nodes.map(n=>({code:n.getAttribute('data-region'),view:n.querySelector('svg')?.getAttribute('viewBox'),width:n.getBoundingClientRect().width,paths:[...n.querySelectorAll('path')].map(p=>p.getAttribute('d')).join(' ')})))
 assert.equal(new Set(badges.map(b=>b.code)).size,19,'regional IDs must be unique')
 assert.equal(new Set(badges.map(b=>b.paths)).size,19,'each region must have a genuinely distinct emblem')
 assert.ok(badges.every(b=>b.view==='0 0 48 48'&&b.width>=34&&b.paths),'regional emblems must remain legible at mobile size')
 assert.equal(await p.locator('.pro-region-row [data-region="md"] path').count(),7,'Madrid badge uses seven stars')
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'expanded region collection must fit mobile')
 await p.screenshot({path:artifacts+'/commercial-mobile-regions.png',fullPage:true})
 await p.locator('.pro-region-feature').click()
 await p.locator('.pro-region-feature').click()
 await p.locator('.pro-region-row').filter({hasText:'Comunidad de Madrid'}).click()
 assert.match(await p.locator('.pro-region-feature').innerText(),/Comunidad de Madrid/)
 assert.equal(await p.evaluate(()=>localStorage.getItem('cap-test-pro-preview-region-v1')),'md')
 await p.reload()
 await p.locator('.pro-dashboard').waitFor()
 assert.match(await p.locator('.pro-region-feature').innerText(),/Comunidad de Madrid/)
 await p.locator('header .gear').click()
 await p.locator('.pro-account-preview').waitFor()
 assert.equal(await p.locator('.pro-google-button').isDisabled(),true,'unconfigured Google sign-in must never launch')
 assert.equal(await p.locator('#pro-profile-region-select').inputValue(),'md')
 await assertViewportFit(p,'390px profile')
 await captureViewport(p,'c5-mobile-account.png')
 await p.locator('#pro-profile-region-select').selectOption('clm')
 await p.locator('.pro-guest-button').click()
 await p.locator('.pro-dashboard').waitFor()
 assert.match(await p.locator('.pro-region-feature').innerText(),/Castilla-La Mancha/)
 assert.equal(await p.evaluate(()=>localStorage.getItem('cap-test-pro-preview-region-v1')),'clm')
 await p.locator('.pro-bank').click()
 await p.locator('.hero').waitFor()
 await p.locator('nav button').filter({hasText:'Inicio'}).click()
 await p.locator('.pro-dashboard').waitFor()
 checks++
 assert.equal(await p.locator('html').getAttribute('data-theme'),'dark')
 await p.screenshot({path:artifacts+'/mobile-home.png',fullPage:true})
 await p.locator('.focus-unique-count strong').waitFor({timeout:30000})
 const displayedUnique=await p.locator('.focus-unique-count').innerText()
 assert.match(displayedUnique,/\d+[\s.]?\d* preguntas distintas/i,'homepage must show the number of distinct historical questions')
 await p.locator('.focus-practice-grid button').filter({hasText:'Examen mezclado'}).click()
 await p.locator('.focus-question').waitFor({timeout:30000})
 await assertViewportFit(p,'390px quiz')
 assert.ok((await p.locator('.focus-question').boundingBox()).y<360,'question should start high in a 390px mobile viewport')
 await captureViewport(p,'c4-mobile-quiz-viewport.png')
 const original=await readSession(p)
 assert.equal(original.questionIds.length,100,'mixed exam should contain 100 questions')
 assert.ok(original.questionIds.every(id=>id.startsWith('cap:')),'CAP modes must not load bank questionnaire IDs')
 const available=await p.evaluate(async()=>{
  const index=await fetch('./data/exams/index.json').then(r=>r.json())
  const metas=index.exams.filter(e=>e.category==='mercancias'&&e.hasOriginalAnswerSheet)
  const rows=(await Promise.all(metas.map(async meta=>fetch('./'+meta.path).then(r=>r.json())))).flat()
  const countUnique=questions=>{
    const ids=new Set(), texts=new Set()
    for(const q of questions){
      const id=q.canonicalQuestionId||q.id
      const text=q.question.normalize('NFKC').toLocaleLowerCase('es').replace(/\s+/g,' ').replace(/[¿?¡!.,;:()[\]{}]/g,'').trim()
      if(ids.has(id)||texts.has(text))continue
      ids.add(id);texts.add(text)
    }
    return ids.size
  }
  return {stats:index.technicalR31Stats,metas,manualCount:countUnique(rows),manualScorable:countUnique(rows.filter(q=>q.scoringEligible && q.technicalDecision?.action!=='exclude'))}
 })
 assert.equal(available.stats.templateExamModels,24)
 assert.equal(available.stats.originalAppearances,2400)
 assert.equal(available.stats.scorableAppearances,2382)
 assert.equal(available.metas.length,24)
 assert.equal(available.stats.uniqueQuestions,available.manualCount)
 assert.equal(available.stats.uniqueScorableQuestions,available.manualScorable)
 assert.equal(Number(displayedUnique.match(/[0-9.]+/)?.[0].replaceAll('.','')),available.stats.uniqueQuestions)
 assert.ok(available.stats.uniqueScorableQuestions >= 100)
 assert.ok(available.stats.uniqueQuestions>=available.stats.uniqueScorableQuestions)
 assert.ok(available.stats.uniqueQuestions<=2400)
 assert.equal(new Set(original.questionIds).size,100,'mixed exam must not duplicate ids')
 assert.equal(original.timed,true,'real exam needs a running clock')
 assert.equal(original.durationMinutes,120)
 assert.match(await p.locator('.focus-frequency').innerText(),/Aparece en [0-9]+ de [0-9]+ exámenes \([0-9]+ %\)/i)
 assert.equal(await p.locator('.focus-provenance').count(),0)
 assert.match(await p.locator('.focus-mark-help').innerText(),/Revisar.*test.*Favorita.*repasos/i)
 await p.locator('.answers button').first().click()
 assert.match(await p.locator('.focus-question>small').innerText(),/pregunta 2 de 100/i,'exam should auto-advance without revealing the solution')
 assert.equal(await p.locator('.feedback').count(),0,'exam mode must not show correction before submitting')
 await p.locator('.focus-quiz-actions button').first().click()
 assert.match(await p.locator('.focus-question>small').innerText(),/pregunta 1 de 100/i,'the previous button must work after automatic navigation')
 await p.locator('.focus-mark').click()
 await p.locator('.focus-quiz-actions button').nth(1).click()
 await p.screenshot({path:artifacts+'/mobile-question.png',fullPage:true})
 await p.reload()
 await p.locator('.focus-question').waitFor({timeout:30000})
 const resumed=await readSession(p)
 assert.equal(resumed.startedAt,original.startedAt,'refresh must not reset the timer')
 assert.equal(Object.keys(resumed.selectedAnswers).length,1,'response must survive refresh')
 assert.equal(resumed.markedIds.length,1,'marked questions must survive refresh')
 await p.locator('.focus-index summary').click()
 assert.equal(await p.locator('.focus-question-grid button').count(),100)
 await p.locator('.focus-question-grid button').nth(99).click()
 await p.locator('.answers button').first().click()
 assert.match(await p.locator('.focus-question>small').innerText(),/pregunta 100 de 100/i,'the last answer must not automatically submit the test')
 assert.equal(await p.locator('.result').count(),0,'the student decides when to submit')
 await p.locator('.focus-question-grid button').nth(9).click()
 assert.match(await p.locator('.focus-question>small').innerText(),/pregunta 10 de 100/i)
 await submit(p)
 const result=await readResult(p)
 assert.equal(result.record.total,100)
 assert.equal(result.record.answered,2)
 assert.match(await p.locator('.result strong').innerText(),/puntos/i)
 assert.equal(result.record.timed,true)
 assert.equal(result.record.finishedReason,'manual')
 assert.equal(await readSession(p),null,'completed test must clear active data')
 assert.equal(await p.locator('.focus-study-pdf-button').count(),1,'Only one PDF action after exam')
 await assertPdfDownload(p,p.locator('.focus-study-pdf-button'),true)
 await assertViewportFit(p,'390px results')
 assert.equal((await p.locator('.result strong').innerText()).includes('-1 puntos'),false,'singular point label for -1')
 assert.equal(await p.locator('.pro-result-metrics article').count(),result.record.excluded>0?6:5)
 assert.match(await p.locator('.pro-result-metrics').innerText(),/Tiempo \(min:seg\)/)
 assert.match(await p.locator('.pro-result-metrics').innerText(),/Precisión contestadas/)
 assert.equal(await p.locator('.pro-next-steps').count(),1)
 await captureViewport(p,'c4-mobile-result-viewport.png')
 await p.screenshot({path:artifacts+'/mobile-result.png',fullPage:true})
 checks++
 await mobile.close()

 // Top 100: full-length CAP exam, only unique gradeable historic questions.
 const topContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true})
 const topPage=await openHome(topContext)
 await topPage.locator('.focus-practice-grid button').filter({hasText:'Top más repetidas'}).click()
 await topPage.getByRole('dialog',{name:'Top más repetidas'}).waitFor()
 await topPage.getByRole('dialog',{name:'Top más repetidas'}).getByText(`${rank.threePlus} preguntas`).waitFor({timeout:30000})
 await topPage.getByRole('dialog',{name:'Top más repetidas'}).getByText(`${rank.fourPlus} preguntas`).waitFor({timeout:30000})
 await topPage.getByRole('dialog',{name:'Top más repetidas'}).getByRole('button',{name:/Top 100/}).click()
 await topPage.locator('.focus-question').waitFor({timeout:30000})
 const topSession=await readSession(topPage)
 assert.equal(topSession.source,'cap-top100')
 assert.equal(topSession.type,'exam')
 assert.equal(topSession.timed,true)
 assert.equal(topSession.durationMinutes,120)
 assert.equal(topSession.questionIds.length,100)
 assert.equal(new Set(topSession.questionIds).size,100)
 assert.equal(await topPage.locator('.focus-study-pdf-button').count(),1,'Only one PDF action in Top 100')
 await assertPdfDownload(topPage,topPage.locator('.focus-study-pdf-button'),true)
 const topAudit=await topPage.evaluate(async ids=>{
  const index=await fetch('./data/exams/index.json').then(r=>r.json())
  const metas=index.exams.filter(e=>e.category==='mercancias'&&e.hasOriginalAnswerSheet)
  const all=(await Promise.all(metas.map(e=>fetch('./'+e.path).then(r=>r.json())))).flat()
  const rows=new Map(all.map(q=>['cap:'+q.examId+':'+q.number,q]))
  return ids.map(id=>rows.get(id)).map(q=>({found:!!q,valid:q?.scoringEligible===true&&q?.technicalDecision?.action!=='exclude',frequency:q?.examFrequency||0}))
 },topSession.questionIds)
 assert.ok(topAudit.every(q=>q.found&&q.valid&&q.frequency>0),'Top 100 includes only gradeable questions')
 await assertViewportFit(topPage,'390px Top 100 quiz')
 await topPage.screenshot({path:artifacts+'/mobile-top-100.png',fullPage:true})
 checks++
 await topContext.close()

 // Exact frequency minimums must keep every eligible distinct question together.
 for(const preset of [{label:'Desde 3 repeticiones',source:'cap-top3',length:rank.threePlus,min:3},
                      {label:'Desde 4 repeticiones',source:'cap-top4',length:rank.fourPlus,min:4}]) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true})
  const page=await openHome(context)
  await page.locator('.focus-practice-grid button').filter({hasText:'Top más repetidas'}).click()
  await page.getByRole('dialog',{name:'Top más repetidas'}).getByRole('button',{name:new RegExp(preset.label)}).click()
  await page.locator('.focus-question').waitFor({timeout:30000})
  const session=await readSession(page)
  assert.equal(session.source,preset.source)
  assert.equal(session.questionIds.length,preset.length)
  assert.equal(new Set(session.questionIds).size,preset.length)
  assert.equal(session.type,'exam')
  assert.equal(session.timed,false,'Non-100 practice exams must not masquerade as timed official CAP tests')
  // The session is the source of truth; visible per-question labels can vary.
  assert.equal(await page.locator('.focus-question').count(),1)
  const frequencies=await page.evaluate(async ids=>{
   const index=await fetch('./data/exams/index.json').then(r=>r.json())
   const metas=index.exams.filter(e=>e.category==='mercancias'&&e.hasOriginalAnswerSheet)
   const rows=(await Promise.all(metas.map(e=>fetch('./'+e.path).then(r=>r.json())))).flat()
   const byId=new Map(rows.map(q=>['cap:'+q.examId+':'+q.number,q]))
   return ids.map(id=>byId.get(id)?.examFrequency??0)
  },session.questionIds)
  assert.ok(frequencies.every(f=>f>=preset.min),'Minimum frequency must be respected')
  assert.equal(await page.locator('.focus-study-pdf-button').count(),1)
  await assertPdfDownload(page,page.locator('.focus-study-pdf-button'),true)
  checks++
  await context.close()
 }

 // R26: both new models must be selectable and export their complete solved PDFs.
 for(const [eid,pages] of [['2025-07-26-mercancias-b','185–201'],['2023-12-02-mercancias-global','218–237']]){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true})
  const page=await openHome(ctx)
  await page.locator('.focus-practice-grid button').filter({hasText:'Por convocatoria'}).click()
  const option=page.locator('#cap-historicos .list button').filter({hasText:pages})
  assert.equal(await option.count(),1)
  assert.ok(await option.isEnabled())
  assert.match(await option.innerText(),/97 puntuables/)
  await option.click()
  await page.locator('.focus-question').waitFor({timeout:30000})
  const session=await readSession(page)
  assert.equal(session.questionIds.length,100)
  assert.ok(session.questionIds.every(id=>id.startsWith('cap:'+eid+':')))
  await assertPdfDownload(page,page.locator('.focus-study-pdf-button'),true)
  checks++
  await ctx.close()
 }

 // R27: known historical error must grade C, not B, and exclusions must not penalize.
 {
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true})
  const page=await openHome(ctx)
  await page.getByRole('button',{name:'Estudio',exact:true}).click()
  await page.locator('.focus-practice-grid button').filter({hasText:'Por convocatoria'}).click()
  await page.locator('#cap-historicos .list button').filter({hasText:'218–237'}).click()
  await page.locator('.focus-question').waitFor()
  await page.locator('.focus-index summary').click()
  await page.locator('.focus-question-grid button').nth(1).click()
  await page.locator('.answers button').nth(2).click()
  assert.match(await page.locator('.feedback').innerText(),/Correcta/)
  assert.match(await page.locator('.focus-question .cap-r25-final').innerText(),/Plantilla original: B · Solución técnica: C/)
  await page.locator('.focus-question-grid button').nth(2).click()
  await page.locator('.answers button').nth(2).click()
  assert.match(await page.locator('.feedback').innerText(),/Correcta/)
  assert.match(await page.locator('.focus-question .cap-r25-final').innerText(),/Plantilla original: B · Solución técnica: C/)
  await page.locator('.focus-question-grid button').nth(44).click()
  await page.locator('.answers button').nth(0).click()
  assert.match(await page.locator('.feedback').innerText(),/No puntúa/)
  assert.match(await page.locator('.focus-question .cap-r25-final').innerText(),/Sin respuesta única válida/)
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.focus-study-pdf-button').click()])
  const commands=pdfPageCommands(await readFile(await download.path()))
  assert.ok(commands.includes('NOTAS DE REVISION TECNICA R27'))
  assert.ok(commands.includes('Pregunta 2 | Original: B | Tecnica: C'))
  assert.ok(commands.includes('NP - sin puntuar'))
  await submit(page)
  const result=await readResult(page)
  assert.equal(result.record.correct,2)
  assert.equal(result.record.incorrect,0)
  assert.equal(result.record.excluded,3)
  checks++
  await ctx.close()
 }

 // R28: copied ambiguity and new semantic variant must both stay unscored.
 for(const [pages,n,letter] of [['97–111',26,1],['275–290',42,0],['482–499',76,1]]){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true})
  const page=await openHome(ctx)
  await page.getByRole('button',{name:'Estudio',exact:true}).click()
  await page.locator('.focus-practice-grid button').filter({hasText:'Por convocatoria'}).click()
  await page.locator('#cap-historicos .list button').filter({hasText:pages}).click()
  await page.locator('.focus-question').waitFor({timeout:30000})
  await page.locator('.focus-index summary').click()
  const target=page.locator('.focus-question-grid button').nth(n-1)
   await target.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}))
   await target.click()
  await page.locator('.answers button').nth(letter).click()
  assert.match(await page.locator('.feedback').innerText(),/No puntúa/)
  assert.match(await page.locator('.focus-question .cap-r25-final').innerText(),/R28/)
  await submit(page)
  const result=await readResult(page)
  assert.equal(result.record.correct,0)
  assert.equal(result.record.incorrect,0)
  checks++
  await ctx.close()
 }

 // R29: verify every new exclusion in real study sessions, preserving existing alignments.
 for(const [pages,items] of [['1–21',[[6,0]]],['97–111',[[5,1],[6,0]]],['291–311',[[39,0]]],['460–481',[[41,0]]],['128–144',[[60,0]]]]){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true})
  const page=await openHome(ctx)
  await page.getByRole('button',{name:'Estudio',exact:true}).click()
  await page.locator('.focus-practice-grid button').filter({hasText:'Por convocatoria'}).click()
  await page.locator('#cap-historicos .list button').filter({hasText:pages}).click()
  await page.locator('.focus-question').waitFor({timeout:30000})
  await page.locator('.focus-index summary').click()
  for(const [n,letter] of items){
   const target=page.locator('.focus-question-grid button').nth(n-1)
   await target.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}))
   await target.click()
   await page.locator('.answers button').nth(letter).click()
   assert.match(await page.locator('.feedback').innerText(),/No puntúa/)
   assert.match(await page.locator('.focus-question .cap-r25-final').innerText(),/R29/)
  }
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.focus-study-pdf-button').click()])
  const commands=pdfPageCommands(await readFile(await download.path()))
  for(const [n,letter] of items)assert.ok(commands.includes('Pregunta '+n+' | Original: '+'ABCD'[letter]+' | Tecnica: NP'))
  await submit(page)
  const result=await readResult(page)
  assert.equal(result.record.correct,0)
  assert.equal(result.record.incorrect,0)
  checks++
  await ctx.close()
 }
 {
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true})
  const page=await openHome(ctx)
  await page.getByRole('button',{name:'Estudio',exact:true}).click()
  await page.locator('.focus-practice-grid button').filter({hasText:'Por convocatoria'}).click()
  await page.locator('#cap-historicos .list button').filter({hasText:'57–78'}).click()
  await page.locator('.focus-question').waitFor({timeout:30000})
  await page.locator('.focus-index summary').click()
  for(const [n,letter] of [[44,1],[49,2]]){
   const target=page.locator('.focus-question-grid button').nth(n-1)
   await target.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}))
   await target.click()
   await page.locator('.answers button').nth(letter).click()
   assert.match(await page.locator('.feedback').innerText(),/Correcta/)
   assert.match(await page.locator('.focus-question .cap-r25-final').innerText(),/R29/)
  }
  await submit(page)
  const result=await readResult(page)
  assert.equal(result.record.correct,2)
  assert.equal(result.record.incorrect,0)
  checks++
  await ctx.close()
 }

 // R31: source-text repair must display both options correctly and preserve C.
 {
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true})
  const page=await openHome(ctx)
  await page.getByRole('button',{name:'Estudio',exact:true}).click()
  await page.locator('.focus-practice-grid button').filter({hasText:'Por convocatoria'}).click()
  await page.locator('#cap-historicos .list button').filter({hasText:'218–237'}).click()
  await page.locator('.focus-question').waitFor({timeout:30000})
  await page.locator('.focus-index summary').click()
  const target=page.locator('.focus-question-grid button').nth(56)
  await target.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}))
  await target.click()
  assert.match(await page.locator('.answers button').nth(1).innerText(),/Solo desde un taller\./)
  assert.match(await page.locator('.answers button').nth(2).innerText(),/Desde el tacógrafo o a través de un lector de tarjetas/)
  await page.locator('.answers button').nth(2).click()
  assert.match(await page.locator('.feedback').innerText(),/Correcta/)
  assert.match(await page.locator('.focus-question .cap-r25-final').innerText(),/R31/)
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.focus-study-pdf-button').click()])
  const commands=pdfPageCommands(await readFile(await download.path()))
  assert.ok(commands.includes('Pregunta 57 | Original: C | Tecnica: C'))
  await submit(page)
  const result=await readResult(page)
  assert.equal(result.record.correct,1)
  assert.equal(result.record.incorrect,0)
  checks++
  await ctx.close()
 }

 // The general question bank must also export a generated exam PDF.
 const generalContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true})
 const general=await openHome(generalContext)
 await general.locator('nav button').filter({hasText:'Test general'}).click()
 await general.getByRole('button',{name:'Comenzar simulacro'}).click()
 await general.locator('.focus-question').waitFor({timeout:30000})
 const generalSession=await readSession(general)
 assert.equal(generalSession.source,'random')
 assert.equal(generalSession.questionIds.length,30)
 assert.equal(await general.locator('.focus-study-pdf-button').count(),1)
 await assertPdfDownload(general,general.locator('.focus-study-pdf-button'),true,false)
 checks++
 await generalContext.close()

 // Deadline: altering only the stored start time simulates returning after 2 hours.
 const timeoutContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true})
 const t=await openHome(timeoutContext)
 await t.locator('.focus-primary').click()
 await t.locator('.focus-question').waitFor({timeout:30000})
 await t.evaluate(()=>{
   const key='cap-test-beta-active-v1'
   const session=JSON.parse(localStorage.getItem(key))
   session.startedAt=Date.now()-121*60*1000
   localStorage.setItem(key,JSON.stringify(session))
 })
 await t.reload()
 await t.locator('.result').waitFor({timeout:30000})
 const timeoutResult=await readResult(t)
 assert.equal(timeoutResult.record.finishedReason,'timeout')
 assert.equal(timeoutResult.record.answered,0)
 assert.equal(timeoutResult.record.score,0)
 assert.equal(await readSession(t),null)
 checks++
 await timeoutContext.close()

 // Original historic model with an editorial exclusion must never show an official pass.
 const historicContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true})
 const h=await openHome(historicContext)
 assert.equal(await h.locator('#cap-historicos').count(),0,'historical list stays hidden until requested')
 await h.locator('.focus-practice-grid button').filter({hasText:'Por convocatoria'}).click()
 await h.locator('#cap-historicos').waitFor({timeout:10000})
 assert.equal(await h.locator('#cap-historicos .list button').count(),25)
 const disputed=h.locator('#cap-historicos .list button').filter({hasText:'incidencias sin puntuar'}).first()
 assert.ok(await disputed.count()>0,'at least one historic model has a disputed question')
 await disputed.click()
 await h.locator('.focus-question').waitFor({timeout:30000})
 assert.equal((await readSession(h)).questionIds.length,100)
 await submit(h)
 const historicResult=await readResult(h)
 assert.ok(historicResult.record.excluded>0)
 assert.equal(await h.locator('.focus-study-pdf-button').count(),1)
 await assertPdfDownload(h,h.locator('.focus-study-pdf-button'),true)
 assert.equal(historicResult.record.passed,null)
 assert.match(await h.locator('.result').innerText(),/orientativo/i)
 checks++
 await historicContext.close()

 // Replacement of a saved CAP session uses a friendly modal, not native browser confirms.
 const modalContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true})
 const modalPage=await openHome(modalContext)
 modalPage.on('dialog',dialog=>{throw new Error('Unexpected native dialog: '+dialog.message())})
 await modalPage.locator('.focus-primary').click()
 await modalPage.locator('.focus-question').waitFor()
 await modalPage.locator('.focus-quiz-head button').first().click()
 await modalPage.locator('.focus-practice-grid button').filter({hasText:'Examen mezclado'}).click()
 await modalPage.locator('.focus-dialog').waitFor()
 assert.match(await modalPage.locator('.focus-dialog').innerText(),/test guardado/i)
 await modalPage.locator('.focus-dialog-actions button').first().click()
 assert.equal(await modalPage.locator('.focus-dialog').count(),0)
 assert.ok(await readSession(modalPage),'cancel must preserve saved CAP test')
 checks++
 await modalContext.close()

 // Desktop: two-column practice choices, study feedback, light theme preference.
 const desktopContext=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1})
 const narrow=await browser.newContext({viewport:{width:320,height:740},isMobile:true,deviceScaleFactor:1})
 const n=await openHome(narrow)
 await assertViewportFit(n,'320px commercial home')
 await n.locator('.pro-region-feature').click()
 await assertViewportFit(n,'320px regional catalog')
 await n.locator('.pro-region-feature').click()
 await n.locator('.focus-primary').click()
 await n.locator('.focus-question').waitFor({timeout:30000})
 await assertViewportFit(n,'320px quiz')
 await captureViewport(n,'c4-narrow-quiz-viewport.png')
 await narrow.close()
 checks++
 const d=await openHome(desktopContext)
 assert.equal(await d.locator('html').getAttribute('data-theme'),'dark')
 assert.equal(await d.locator('#cap-historicos').count(),0)
 await d.locator('.focus-practice-grid button').filter({hasText:'Por convocatoria'}).click()
 await d.locator('#cap-historicos').waitFor()
 await d.locator('.focus-convocation-close').click()
 assert.equal(await d.locator('#cap-historicos').count(),0,'desktop list closes without leaving the page')
 const overflow=await d.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)
 assert.equal(overflow,false,'desktop must not have horizontal overflow')
 await d.screenshot({path:artifacts+'/desktop-home.png',fullPage:true})
 await assertViewportFit(d,'desktop home')
 await captureViewport(d,'c4-desktop-home-viewport.png')
 await d.locator('.pro-region-feature').click()
 assert.equal(await d.locator('.pro-region-row').count(),19)
 assert.equal(await d.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'expanded region collection must fit desktop')
 await d.screenshot({path:artifacts+'/commercial-desktop-regions.png',fullPage:true})
 await d.locator('.pro-region-feature').click()

 await d.locator('.focus-choice button').filter({hasText:'Estudio'}).click()
 await d.locator('.focus-primary').click()
 await d.locator('.focus-question').waitFor({timeout:30000})
 const sourceQuestions=await d.evaluate(async()=>{
  const saved=JSON.parse(localStorage.getItem('cap-test-beta-active-v1'))
  const examId=saved.questionIds[0].split(':')[1]
  const index=await fetch('./data/exams/index.json').then(r=>r.json())
  return fetch('./'+index.exams.find(x=>x.id===examId).path).then(r=>r.json())
 })
 const right=sourceQuestions[0].technicalDecision?.technicalAnswer||sourceQuestions[0].correctAnswer
 const wrong=['A','B','C','D'].find(x=>x!==(sourceQuestions[1].technicalDecision?.technicalAnswer||sourceQuestions[1].correctAnswer))
 assert.ok(right&&wrong)
 await d.locator('.answers button').nth(['A','B','C','D'].indexOf(right)).click()
 await d.locator('.feedback').waitFor()
 assert.match(await d.locator('.focus-frequency').innerText(),/[0-9]+ %/)
 await d.locator('.focus-quiz-actions button').nth(1).click()
 await d.locator('.answers button').nth(['A','B','C','D'].indexOf(wrong)).click()
 await d.locator('.feedback').waitFor()
 await d.screenshot({path:artifacts+'/desktop-study.png',fullPage:true})
 await d.locator('.focus-quiz-actions button').last().click()
 await d.locator('.result').waitFor()
 assert.match(await d.locator('.result strong').innerText(),/0,5 puntos/i,'study points must be net CAP points')
 assert.match(await d.locator('.result').innerText(),/Precisión entre las 2 respuestas[^\n]*50/i)
 await d.screenshot({path:artifacts+'/desktop-study-result.png',fullPage:true})
 await d.locator('header .gear').click()
 await d.locator('.panel').filter({hasText:'Tema'}).getByRole('button',{name:/Claro/}).click()
 await d.reload()
 await d.locator('html[data-theme="light"]').waitFor()
 checks++
 await desktopContext.close()
 console.log('CAP Focus E2E PASS: '+checks+' mobile/desktop scenarios')
}finally{
 await browser.close()
}
