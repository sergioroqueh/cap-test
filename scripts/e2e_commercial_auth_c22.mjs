import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const origin='http://127.0.0.1:5173'
mkdirSync('artifacts/cap-auth-c22',{recursive:true})
const browser=await chromium.launch({headless:true})
try{
 for(const device of [
  {name:'mobile',width:390,height:844},
  {name:'desktop',width:1440,height:900}
 ]){
  const context=await browser.newContext({viewport:{width:device.width,height:device.height},deviceScaleFactor:1})
  const page=await context.newPage()
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'})
  const google=page.getByRole('button',{name:/Continuar con Google/})
  await google.waitFor()
  assert.equal(await google.isEnabled(),true,'auth development gate')
  assert.equal(await page.getByLabel('O accede por correo electrónico').count(),1)
  await page.screenshot({path:'artifacts/cap-auth-c22/'+device.name+'-entry.png',fullPage:true})
  await page.getByRole('button',{name:/Continuar como invitado/}).click()
  await page.getByRole('heading',{name:'Seguimos en ruta.'}).waitFor({timeout:20000})
  await page.screenshot({path:'artifacts/cap-auth-c22/'+device.name+'-guest.png',fullPage:true})
  await page.goto(origin+'/#/settings')
  const exit=page.getByRole('button',{name:'Salir del modo invitado'})
  await exit.waitFor({timeout:20000})
  await exit.click()
  await page.getByRole('button',{name:/Continuar como invitado/}).waitFor()
  assert.equal(await page.getByRole('heading',{name:'Seguimos en ruta.'}).count(),0)
  await context.close()
 }
 const context=await browser.newContext({viewport:{width:390,height:844}})
 const page=await context.newPage()
 await page.goto(origin+'/auth/callback?error=access_denied',{waitUntil:'domcontentloaded'})
 await page.getByRole('alert').waitFor({timeout:20000})
 assert.equal(new URL(page.url()).pathname,'/','callback removed from history')
 await page.screenshot({path:'artifacts/cap-auth-c22/mobile-oauth-error.png',fullPage:true})
 await context.close()
 console.log('C22 browser PASS: entry, guest, exit, callback error, mobile/desktop screenshots')
}finally{await browser.close()}
