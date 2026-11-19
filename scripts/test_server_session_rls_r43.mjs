// R43 narrow static SQL guard regression. No DB, credentials, or network.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const sql = readFileSync(new URL('../docs/commercial/sql/R43_SESSION_REVOCATION_ATOMIC_REVIEW.sql', import.meta.url),'utf8')
test('R43 review-only bundle guards every live-session access surface', () => {
  assert.match(sql,/R43 REVIEW ONLY/)
  assert.equal((sql.match(/^begin;$/gm)||[]).length,1)
  assert.equal((sql.match(/^commit;$/gm)||[]).length,1)
  assert.match(sql,/create function rc_internal\.rc_is_active_session_v1\(\)/)
  assert.match(sql,/security definer set search_path = ''/)
  assert.match(sql,/create function public\.rc_is_active_session_v1\(\)/)
  assert.match(sql,/security invoker set search_path = ''/)
  for(const name of ['rc_sync_consents_owner_read','rc_sync_consent_audit_owner_read']){
    const block=sql.match(new RegExp('alter policy '+name+'[\\s\\S]*?\\n  \\);'))?.[0]
    assert.ok(block,'missing policy: '+name)
    assert.match(block,/rc_internal\.rc_is_active_session_v1\(\)/)
  }
  for(const name of ['rc_has_active_progress_sync_consent_v1',
    'rc_grant_progress_sync_consent_v1','rc_revoke_progress_sync_consent_v1']){
    const pos=sql.indexOf('create or replace function '+
      (name.startsWith('rc_has')?'public.':'rc_internal.')+name+'(')
    assert.ok(pos>0,'missing function '+name)
    const end=sql.indexOf('$$;',pos)
    assert.ok(end>pos)
    assert.match(sql.slice(pos,end),/rc_internal\.rc_is_active_session_v1\(\)/)
  }
  assert.match(sql,/s\.id::text = \(select auth\.jwt\(\)->>'session_id'\)/)
  assert.match(sql,/s\.not_after is null or s\.not_after > statement_timestamp\(\)/)
  for(const name of ['rc_is_active_session_v1',
    'rc_grant_progress_sync_consent_v1','rc_revoke_progress_sync_consent_v1']){
    assert.match(sql,new RegExp('revoke (?:all|execute) on function (?:public\\.|rc_internal\\.)'+name+'\\('))
  }
  assert.doesNotMatch(sql,/create\s+(?:or replace\s+)?function\s+public\.[^\n]+[\s\S]{0,180}?security definer/i)
  console.log('R43 PASS: atomic review SQL checks session on direct RLS and definer transitions; no SQL applied')
})
