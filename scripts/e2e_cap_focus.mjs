import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const BASE=process.env.CAP_PREVIEW_URL||'http://127.0.0.1:4173/'
const artifacts='artifacts/cap-focus-e2e'
await mkdir(artifacts,{recursive:true})
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
const readSession=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('cap-test-beta-active-v1')||'null'))
const readResult=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('cap-test-beta-last-v1')||'null'))
let checks=0

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
 page.once('dialog',dialog=>dialog.accept())
 await page.locator('.focus-quiz-actions button').last().click()
 await page.locator('.result').waitFor({timeout:30000})
}
try{
 // Mobile: all 100 mixed questions, persisted answers, index, review marker, real scoring.
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1})
 const p=await openHome(mobile)
 assert.equal(await p.locator('html').getAttribute('data-theme'),'dark')
 await p.screenshot({path:artifacts+'/mobile-home.png',fullPage:true})
 const displayedUnique=await p.locator('.focus-unique-count').innerText()
 assert.match(displayedUnique,/\\d+[\\s.]?\\d* preguntas distintas/i,'homepage must show the number of distinct historical questions')
 await p.locator('.focus-practice-grid button').filter({hasText:'Examen mezclado'}).click()
 await p.locator('.focus-question').waitFor({timeout:30000})
 const original=await readSession(p)
 assert.equal(original.questionIds.length,100,'mixed exam should contain 100 questions')
 assert.ok(original.questionIds.every(id=>id.startsWith('cap:')),'CAP modes must not load bank questionnaire IDs')
 const available=await p.evaluate(async()=>{
  const index=await fetch('./data/exams/index.json').then(r=>r.json())
  return {stats:index.mercanciasTemplateStats,metas:index.exams.filter(e=>e.category==='mercancias'&&e.hasOriginalAnswerSheet)}
 })
 assert.equal(available.stats.templateExamModels,22)
 assert.equal(available.stats.originalAppearances,2200)
 assert.equal(available.stats.scorableAppearances,2197)
 assert.equal(available.metas.length,22)
 assert.ok(available.stats.uniqueScorableQuestions >= 100)
 assert.ok(available.stats.uniqueQuestions>=available.stats.uniqueScorableQuestions)
 assert.ok(available.stats.uniqueQuestions<=2200)
 assert.equal(new Set(original.questionIds).size,100,'mixed exam must not duplicate ids')
 assert.equal(original.timed,true,'real exam needs a running clock')
 assert.equal(original.durationMinutes,120)
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
 assert.equal(result.record.timed,true)
 assert.equal(result.record.finishedReason,'manual')
 assert.equal(await readSession(p),null,'completed test must clear active data')
 await p.screenshot({path:artifacts+'/mobile-result.png',fullPage:true})
 checks++
 await mobile.close()

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
 const disputed=h.locator('#cap-historicos .list button').filter({hasText:'conflictos sin puntuar'}).first()
 assert.ok(await disputed.count()>0,'at least one historic model has a disputed question')
 await disputed.click()
 await h.locator('.focus-question').waitFor({timeout:30000})
 assert.equal((await readSession(h)).questionIds.length,100)
 await submit(h)
 const historicResult=await readResult(h)
 assert.ok(historicResult.record.excluded>0)
 assert.equal(historicResult.record.passed,null)
 assert.match(await h.locator('.result').innerText(),/orientativo/i)
 checks++
 await historicContext.close()

 // Desktop: two-column practice choices, study feedback, light theme preference.
 const desktopContext=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1})
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
 await d.locator('.focus-choice button').filter({hasText:'Estudio'}).click()
 await d.locator('.focus-primary').click()
 await d.locator('.focus-question').waitFor({timeout:30000})
 await d.locator('.answers button').first().click()
 await d.locator('.feedback').waitFor()
 await d.screenshot({path:artifacts+'/desktop-study.png',fullPage:true})
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
