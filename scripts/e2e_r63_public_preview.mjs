// R63 real-browser smoke of the minimal built preview. Only localhost, no cloud.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const BASE = process.env.CAP_PREVIEW_URL || 'http://127.0.0.1:4173/'
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const artifacts = 'artifacts/r63-public-package-e2e'
await mkdir(artifacts, { recursive: true })
try {
  for (const width of [390, 430, 768, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: width < 800 ? 844 : 900 },
      isMobile: width < 800, deviceScaleFactor: 1
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('response', response => {
      if (response.status() >= 400) errors.push(response.status() + ' ' + response.url())
    })
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.locator('.pro-dashboard').waitFor({ timeout: 30000 })
    assert.equal(await page.locator('.pro-bank>strong').innerText(), '8.655')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      width + 'px: viewport overflow')
    await page.screenshot({ path: artifacts + '/home-' + width + '.png' })
    await page.locator('.focus-practice-grid button').filter({ hasText: 'Por convocatoria' }).click()
    await page.locator('#cap-historicos').waitFor()
    assert.equal(await page.locator('#cap-historicos .list button').count(), 25)
    await page.getByRole('button', { name: 'Viajeros', exact: true }).click()
    assert.equal(await page.locator('#cap-historicos .list button').count(), 1)
    await page.getByRole('button', { name: 'Mercancías', exact: true }).click()
    assert.equal(await page.locator('#cap-historicos .list button').count(), 25)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      width + 'px: historical archive viewport overflow')
    await page.screenshot({ path: artifacts + '/archive-' + width + '.png' })
    assert.deepEqual(errors, [], width + 'px: failed requests or runtime errors')
    await context.close()
  }

  // Preview deliberately disables automatic service worker registration. Install
  // it explicitly in an isolated localhost test context to verify its actual
  // precache URLs exist in the packaged data/ tree.
  const pwa = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await pwa.newPage()
  await page.goto(BASE)
  const indices = await page.evaluate(async () => {
    const bank = await fetch('./data/index.json').then(r => r.json())
    const exams = await fetch('./data/exams/index.json').then(r => r.json())
    return { bank, exams }
  })
  assert.equal(indices.bank.totalQuestions, 8655)
  assert.equal(indices.bank.questionnaires.length, 33)
  assert.equal(indices.exams.totalExamModels, 26)
  assert.equal(indices.exams.totalImportedQuestions, 2600)
  assert.equal(indices.exams.exams.length, 26)
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' })
    await navigator.serviceWorker.ready
    if (!registration.active) throw Error('R63: service worker not activated')
  })
  const cached = await page.evaluate(async () => {
    const names = await caches.keys()
    const matches = names.filter(x => x.startsWith('cap-test-pro:'))
    const requests = (await Promise.all(matches.map(async name => {
      const store = await caches.open(name)
      return store.keys()
    }))).flat()
    return requests.map(x => new URL(x.url).pathname)
  })
  const paths = [
    '/', '/index.html', '/manifest.webmanifest', '/icon.svg',
    '/data/index.json', '/data/exams/index.json', '/data/exams/frequency_by_bank.json',
    ...indices.bank.questionnaires.map(x => '/' + x.path),
    ...indices.exams.exams.map(x => '/' + x.path)
  ]
  assert.deepEqual(paths.filter(path => !cached.includes(path)), [],
    'R63: PWA cache lacks required public paths')
  assert.ok(!cached.some(path => /editorial_|technical_review_|sheet_audit_/.test(path)),
    'R63: editorial material must not be prefetched')
  console.log('R63 browser PASS: 390, 430, 768, 1440 px; archive 25+1; PWA ' +
    paths.length + ' required URLs available in cache')
  await pwa.close()
} finally {
  await browser.close()
}
