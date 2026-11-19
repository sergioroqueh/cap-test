// R48: purely in-memory, synthetic metadata gate. Never reads dumps, env, network or Supabase.
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const names = ['roles.sql', 'schema.sql', 'data.sql']
const hex = /^[0-9a-f]{64}$/
const sha = text => createHash('sha256').update(text).digest('hex')
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k)

export function assessBackupEvidence(m) {
  const issues = []
  if (!m || typeof m !== 'object' || Array.isArray(m)) return {status:'NO_GO',issues:['invalid manifest']}
  const allowed = ['version','environment','projectRef','backup','restore','coverage']
  if (Object.keys(m).some(k=>!allowed.includes(k))) issues.push('unrecognized top-level field')
  if (m.version !== 1 || m.environment !== 'synthetic') issues.push('synthetic-only manifest required')
  if (m.projectRef !== 'fixture.invalid') issues.push('live project reference prohibited')
  if (!m.backup || typeof m.backup!=='object' || Array.isArray(m.backup)) issues.push('backup metadata missing')
  if (m.backup && Object.keys(m.backup).some(k=>!['artifacts','encryptedAtRest','storageOutsideRepo'].includes(k))) issues.push('unrecognized backup field')
  if (m.backup?.encryptedAtRest !== true || m.backup?.storageOutsideRepo !== true) issues.push('private encrypted storage not confirmed')
  const files=m.backup?.artifacts
  if (!Array.isArray(files) || files.length!==3 || new Set(files.map(f=>f?.name)).size!==3) issues.push('exactly three distinct artifacts required')
  else for (const name of names) {
    const f=files.find(x=>x?.name===name)
    if (!f || Object.keys(f).some(k=>!['name','bytes','sha256'].includes(k)) || !Number.isSafeInteger(f.bytes) || f.bytes<=0 || !hex.test(f.sha256)) issues.push('invalid metadata: '+name)
  }
  const c=m.coverage
  if (!c || typeof c!=='object' || Array.isArray(c) || Object.keys(c).some(k=>!['database','auth','storageObjects','configAndSecrets'].includes(k))) issues.push('invalid coverage')
  else for(const k of ['database','auth','storageObjects','configAndSecrets']) if (!['verified','not-applicable','unverified'].includes(c[k])) issues.push('unknown coverage: '+k)
  const r=m.restore
  if (!r || typeof r!=='object' || Array.isArray(r) || Object.keys(r).some(k=>!['isolated','approved','executed','integrityVerified','target'].includes(k))) issues.push('invalid restore evidence')
  else {
    if (r.target!=='fixture.invalid' || r.approved!==true || r.isolated!==true || r.executed!==true || r.integrityVerified!==true) issues.push('isolated restored fixture not verified')
  }
  // Critical: synthetic fixture is never equivalent to a recoverable live project.
  return {status:issues.length ? 'NO_GO' : 'FIXTURE_PASS_ONLY',issues,liveRecoveryVerified:false,r43Authorized:false}
}

const specimen = () => ({
  version:1, environment:'synthetic', projectRef:'fixture.invalid',
  backup:{encryptedAtRest:true,storageOutsideRepo:true,artifacts:names.map(name=>({name,bytes:32,sha256:sha('synthetic:'+name)}))},
  coverage:{database:'verified',auth:'verified',storageObjects:'not-applicable',configAndSecrets:'unverified'},
  restore:{target:'fixture.invalid',isolated:true,approved:true,executed:true,integrityVerified:true}
})
test('R48 fixture passes but cannot authorize real recovery or R43',()=>{
 const result=assessBackupEvidence(specimen())
 assert.equal(result.status,'FIXTURE_PASS_ONLY')
 assert.equal(result.liveRecoveryVerified,false)
 assert.equal(result.r43Authorized,false)
})
test('R48 fails closed for incomplete artifact trio',()=>{
 const m=specimen();m.backup.artifacts.pop()
 assert.equal(assessBackupEvidence(m).status,'NO_GO')
})
test('R48 fails closed for weak or missing checksum',()=>{
 const m=specimen();m.backup.artifacts[0].sha256='md5'
 assert.equal(assessBackupEvidence(m).status,'NO_GO')
})
test('R48 fails closed for zero bytes',()=>{
 const m=specimen();m.backup.artifacts[1].bytes=0
 assert.equal(assessBackupEvidence(m).status,'NO_GO')
})
test('R48 rejects live project identifiers and real environments',()=>{
 const m=specimen();m.projectRef='rhtbqetskghkarxhrgee';m.environment='live'
 assert.equal(assessBackupEvidence(m).status,'NO_GO')
})
test('R48 rejects uncategorized secret-bearing fields',()=>{
 const m=specimen();m.password='fake'
 assert.equal(assessBackupEvidence(m).status,'NO_GO')
})
test('R48 rejects unverified private storage',()=>{
 const m=specimen();m.backup.encryptedAtRest=false
 assert.equal(assessBackupEvidence(m).status,'NO_GO')
})
test('R48 rejects unapproved or unverified restore',()=>{
 const m=specimen();m.restore.approved=false
 assert.equal(assessBackupEvidence(m).status,'NO_GO')
 const n=specimen();n.restore.integrityVerified=false
 assert.equal(assessBackupEvidence(n).status,'NO_GO')
})
test('R48 rejects unknown coverage declarations',()=>{
 const m=specimen();m.coverage.auth='maybe'
 assert.equal(assessBackupEvidence(m).status,'NO_GO')
})
test('R48 rejects accidental real restore destinations',()=>{
 const m=specimen();m.restore.target='rutacap-dev'
 assert.equal(assessBackupEvidence(m).status,'NO_GO')
})
