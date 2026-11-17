import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('C22: OAuth requires developer opt-in, localhost and publishable key',()=>{
 const s=src('src/supabase.ts')
 for(const item of ['import.meta.env.DEV',"VITE_RUTACAP_AUTH_DEV === 'true'","window.location.port === '5173'","sb_publishable_","flowType: 'pkce'","provider: 'google'","auth.getUser()","shouldCreateUser: false","export const cloudConfigured = false"]){
  // getUser is invoked on client.auth, while the rest are literal contract markers.
  if(item==='auth.getUser()')assert.ok(s.includes('client.auth.getUser()'))
  else assert.ok(s.includes(item),item)
 }
 assert.doesNotMatch(s,/service_role|SUPABASE_ANON_KEY|VITE_SUPABASE_URL|GOOGLE_CLIENT_SECRET/)
})
test('C22: each verified owner and guest has a separate namespace',()=>{
 const s=src('src/localScope.ts')
 assert.ok(s.includes('cap-test-preview-local-2026'))
 assert.ok(s.includes('rutacap-dev-'))
 assert.ok(s.includes("'user-' + ownerId"))
 assert.ok(s.includes('setLocalOwner'))
 assert.ok(src('src/db.ts').includes('indexedDB.open(localDbName(), DB_VERSION)'))
 assert.ok(src('src/Quiz.tsx').includes('activeKey()'))
 assert.ok(src('src/App.tsx').includes('lastKey()'))
 assert.ok(src('src/App.tsx').includes("sessionStorage.setItem('rutacap-dev-guest-open','1')"))
})
test('C22: no cloud migration and only local progress claims',()=>{
 const app=src('src/App.tsx')
 assert.ok(!app.includes('synchronizeAccount('))
 assert.ok(app.includes('La sincronización en la nube no está activada.'))
 const db=src('src/db.ts')
 assert.ok(db.includes("if (!cloudConfigured || !supabase) return 'empty'"))
 assert.ok(db.includes('if (!cloudConfigured || !supabase) return'))
 assert.ok(src('src/CommercialAccountPreview.tsx').includes('Continuar como invitado'))
})
test('C22: no secret variables or credentials in frontend',()=>{
 for(const path of ['src/App.tsx','src/db.ts','src/supabase.ts','src/CommercialAccountPreview.tsx']){
  const s=src(path)
  assert.doesNotMatch(s,/auth\.setSession\(|service_role|VITE_GOOGLE_CLIENT_SECRET|access_token=[A-Za-z0-9]/)
 }
})
