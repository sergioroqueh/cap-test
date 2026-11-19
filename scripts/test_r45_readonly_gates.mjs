// R45 only static integrity of SQL pre/postflight; no database or network.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const pre=readFileSync(new URL('../docs/commercial/sql/R45_PREFLIGHT_READ_ONLY.sql',import.meta.url),'utf8')
const post=readFileSync(new URL('../docs/commercial/sql/R45_POSTFLIGHT_READ_ONLY.sql',import.meta.url),'utf8')
test('R45 single SELECT-only preflight/postflight and expected safeguards',()=>{
 for(const [name,src] of [['preflight',pre],['postflight',post]]){
   const sql=src.replace(/--[^\n]*/g,'').trim().replace(/'[^']*'/g,"''")
   assert.match(sql,/^select\b/i,name+' must start with SELECT')
   assert.equal((sql.match(/;/g)||[]).length,1,name+' multiple statements')
   assert.doesNotMatch(sql,/\b(?:create|alter|drop|insert|update|delete|truncate|grant|revoke|do|call|execute|copy|set_config)\s/i,name+' includes mutating SQL')
   assert.match(sql,/rc_progress_events/)
   assert.match(sql,/rc_sync_consents/)
 }
 assert.match(pre,/function_fingerprint/)
 assert.match(pre,/policy_fingerprint/)
 assert.match(post,/session_rpc_acl/)
 assert.match(post,/direct_consent_guards/)
 assert.match(post,/consent_function_guards/)
 console.log('R45 PASS: pre/postflight read-only guards; no Supabase DDL')
})
