import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.RUTACAP_LAUNCH_URL || 'http://127.0.0.1:4178/'
const browser = await chromium.launch({ headless: true })
try {
 for (const width of [390, 1440]) {
  const context = await browser.newContext({ viewport: { width, height: 850 }, isMobile: width===390 })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const response = await page.goto(base, { waitUntil: 'domcontentloaded' })
  assert.equal(response?.status(), 200, 'Launch root must serve HTTP 200')
  await page.locator('.pro-account-preview').waitFor()
  const legalFooter=page.locator('.pro-legal-footer')
  await legalFooter.waitFor()
  assert.equal(await legalFooter.locator('.pro-legal-links a').count(),4,'Legal links must be visible')
  const legalLayout=await legalFooter.evaluate(footer=>{
   const links=footer.querySelector('.pro-legal-links')
   if(!links)return {valid:false,reason:'missing links'}
   const outer=footer.getBoundingClientRect()
   const inner=links.getBoundingClientRect()
   return {
    valid: getComputedStyle(links).position!=='fixed' &&
      inner.top>=outer.top-1 && inner.bottom<=outer.bottom+1,
    reason:'legal links must stay inside footer in normal document flow'
   }
  })
  assert.ok(legalLayout.valid,legalLayout.reason)
  assert.equal(await page.getByText('BETA GRATUITA', { exact: true }).count(), 1)
  assert.equal(await page.getByRole('button', { name: /Continuar con Google/ }).count(), 0, 'No disabled OAuth in beta')
  assert.ok(await page.getByText('Versión beta independiente', { exact: false }).isVisible(), 'Beta disclosure required')
  await page.getByRole('button',{name:/Empezar a practicar gratis/}).click()
  await page.locator('.pro-dashboard').waitFor({timeout:30000})
  const overflow = await page.evaluate(()=>document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  assert.equal(overflow,false,'Horizontal overflow at '+width)
  await page.reload({waitUntil:'domcontentloaded'})
  await page.locator('.pro-dashboard').waitFor({timeout:30000})
  assert.deepEqual(errors,[],'JavaScript errors at '+width)
  await context.close()
  console.log('RutaCAP beta browser PASS:',width,'px: CTA, dashboard, local session persistence')
 }
} finally { await browser.close() }
