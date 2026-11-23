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

test('exactly three commercial tiers; beta is a launch phase, not an entitlement',()=>{
 const client=read('src/commercialBilling.ts')
 const sql=read('docs/commercial/sql/R82_BILLING_DRAFT.sql')
 const panel=read('src/CommercialBillingPanel.tsx')
 assert.match(client,/CommercialTier = 'guest' \| 'free' \| 'premium'/)
 assert.doesNotMatch(client,/tier:\s*'beta'|CommercialTier[^\n]*'beta'/)
 assert.match(client,/if \(!billingEnabled\) return \{ tier:'free'/)
 assert.match(sql,/tier in \('guest','free','premium'\)/)
 assert.doesNotMatch(sql,/\('beta',/)
 for(const tier of ['guest','free','premium']){
  assert.match(sql,new RegExp("\\('"+tier+"',"))
 }
 assert.doesNotMatch(panel,/tier:signedIn\?'beta'|\?'Beta gratuita'/)
 assert.match(panel,/Cuenta gratuita/)
});

test('email OTP is opt-in, verifies six digits, and does not impersonate synced progress',()=>{
 const auth=read('src/supabase.ts')
 const entry=read('src/CommercialAccountPreview.tsx')
 const app=read('src/App.tsx')
 const wf=read('.github/workflows/launch-beta.yml')
 assert.match(auth,/VITE_RUTACAP_EMAIL_OTP === 'true'/)
 assert.match(auth,/verifyEmailOtp\(email: string, token: string\)/)
 assert.match(auth,/type: 'email'/)
 assert.match(auth,/shouldCreateUser: publicAuth/)
 assert.match(entry,/emailOtpEnabled&&codeSent/)
 assert.match(entry,/pattern="\[0-9\]\{6\}"/)
 assert.match(app,/onVerifyEmail=\{verifyEmailOtp\}/)
 assert.match(wf,/RUTACAP_EMAIL_OTP/)
 assert.match(auth,/export const cloudConfigured = false/)
});
test('Premium presentation requires an unexpired paid subscription, not a browser flag',()=>{
 const billing=read('src/commercialBilling.ts')
 assert.match(billing,/status === 'active' \|\| status === 'trialing'/)
 assert.match(billing,/Date\.parse\(renewalAt\) > Date\.now\(\)/)
 assert.match(billing,/return \{tier:active\?'premium':'free'/)
});

test('R86: separately gate public Google, email OTP and dev-only registrations',()=>{
 const client=read('src/supabase.ts')
 const app=read('src/App.tsx')
 const entry=read('src/CommercialAccountPreview.tsx')
 const workflow=read('.github/workflows/launch-beta.yml')
 assert.match(client,/VITE_RUTACAP_GOOGLE_AUTH === 'true'/)
 assert.match(client,/if \(!googleConfigured\) throw new Error/)
 assert.match(client,/VITE_RUTACAP_DEV_SIGNUPS === 'true'/)
 assert.match(client,/shouldCreateUser: publicAuth \|\| devSignupConfigured/)
 assert.match(app,/googleEnabled=\{googleConfigured\}/)
 assert.match(entry,/\{googleEnabled&&<>/)
 assert.doesNotMatch(entry,/disabled=\{!authEnabled\|\|busy\}/)
 assert.match(entry,/Continuar como invitado/)
 assert.match(workflow,/feat\/rutacap-commerce-sprint-20261123/)
 assert.match(workflow,/RUTACAP_GOOGLE_AUTH/)
 assert.match(client,/export const cloudConfigured = false/)
});
