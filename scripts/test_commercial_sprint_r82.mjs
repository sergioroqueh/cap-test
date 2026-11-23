import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = name => readFileSync(name,'utf8')

test('public auth is opt-in, exact-origin and distinct from legacy',()=>{
 const source=read('src/supabase.ts')
 assert.match(source,/VITE_RUTACAP_PUBLIC_AUTH === 'true'/)
 assert.match(source,/window\.location\.origin === 'https:\/\/rutacap\.es'/)
 assert.match(source,/VITE_CAP_LAUNCH === 'true'/)
 assert.match(source,/shouldCreateUser: publicAuth/)
 assert.match(source,/export const cloudConfigured = false/)
 assert.doesNotMatch(source,/VITE_SUPABASE_ANON_KEY/)
})
test('payments can only be granted server-side after authenticated and verified callbacks',()=>{
 const client=read('src/commercialBilling.ts')
 const server=read('supabase/functions/rutacap-billing/index.ts')
 const sql=read('docs/commercial/sql/R82_BILLING_DRAFT.sql')
 assert.match(client,/billingEnabled = authConfigured/)
 assert.match(server,/admin\.auth\.getUser\(token\)/)
 assert.match(server,/verifyStripeSignature\(raw/)
 assert.match(server,/synchronizeSubscription\(subscriptionId\)/)
 assert.match(server,/event\.livemode!==isLive/)
 assert.match(server,/RUTACAP_LIVE_BILLING/)
 assert.match(sql,/alter table public\.rc_billing_subscriptions enable row level security/)
 assert.match(sql,/for select to authenticated/)
 assert.match(sql,/grant select \(user_id,status,current_period_end,cancel_at_period_end\)/)
 assert.doesNotMatch(sql,/grant (insert|update|delete)[^\n]*to authenticated/i)
})
test('static historical JSON cannot serve as premium protection',()=>{
 const sql=read('docs/commercial/sql/R82_BILLING_DRAFT.sql')
 assert.match(sql,/Do NOT enforce quotas on static \/data JSON files/)
 const server=read('supabase/functions/rutacap-billing/index.ts')
 assert.doesNotMatch(server,/serviceRoleKey/i)
 assert.match(server,/const ORIGIN = 'https:\/\/rutacap\.es'/)
})
