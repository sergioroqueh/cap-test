import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Release smoke for cap-launch only: no HTTP, third-party credentials or database writes.
const dist='dist'
const read=path=>readFileSync(join(dist,path),'utf8')
const html=read('index.html')
assert.match(html, /<html lang="es">/)
assert.match(html, /(?:src|href)="\/assets\//, 'The beta must use root-relative assets')
assert.doesNotMatch(html, /(?:src|href)="\/cap-test\//, 'GitHub Pages base leaked into beta')
for(const path of ['manifest.webmanifest','sw.js','icon.svg','data/index.json','data/exams/index.json','data/exams/frequency_by_bank.json']){
 assert.ok(existsSync(join(dist,path)), 'Missing launch artifact: '+path)
}
const manifest=JSON.parse(read('manifest.webmanifest'))
assert.equal(manifest.short_name,'RutaCAP')
const assets=readdirSync(join(dist,'assets')).filter(name=>name.endsWith('.js'))
assert.ok(assets.length>0,'Missing JavaScript assets')
const js=assets.map(name=>read('assets/'+name)).join('\n')
assert.ok(js.includes('BETA GRATUITA'),'Beta entry label not present in bundle')
assert.ok(js.includes('Empezar a practicar gratis'),'Launch CTA not present in bundle')
assert.ok(js.includes('Versión beta independiente'),'Independent beta disclaimer missing')
assert.ok(js.includes('no oficial'),'Non-official status not disclosed')
assert.ok(!existsSync(join(dist,'data/exams/editorial_casebook_r23.json')),'Editorial data leaked into launch')
const sw=read('sw.js')
assert.ok(sw.includes('new URL(self.registration.scope).pathname'),'Service worker scope must be root-safe')
console.log('RutaCAP launch smoke PASS: root assets, beta CTA, local disclosure, PWA, public data files.')
