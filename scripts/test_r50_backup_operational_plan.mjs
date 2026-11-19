// R50: offline-only planning gate. No CLI invocation, environment, disk dumps, network,
// database URLs or process spawning. Synthetic fixtures only.
import assert from 'node:assert/strict'
import { test } from 'node:test'

export const BACKUP_PARTS = Object.freeze(['roles.sql', 'schema.sql', 'data.sql'])
export const COVERAGE = Object.freeze([
  'databaseSchema',
  'databaseRows',
  'rlsPolicies',
  'roleGrants',
  'authDatabaseRows',
  'authProviderConfiguration',
  'storageMetadata',
  'storageBinaryObjects',
  'migrationHistory',
  'encryptionAndVault',
  'extensionsAndTriggers'
])
export const STEPS = Object.freeze([
  {id:'check-cli', phase:'prepare', approval:'none', description:'Verify CLI version/help and official backup guidance offline'},
  {id:'verify-source', phase:'prepare', approval:'none', description:'Confirm source project/ref and scope privately; do not log credentials'},
  {id:'backup', phase:'export', approval:'explicit-export', description:'Export roles, schema and data to encrypted private storage with separately approved credentials'},
  {id:'hash', phase:'export', approval:'explicit-export', description:'Check nonzero file sizes and SHA-256 privately; never commit dumps or manifest'},
  {id:'review-coverage', phase:'review', approval:'explicit-export', description:'Evaluate Auth, Storage blobs, migration history, extensions and encryption separately'},
  {id:'restore', phase:'restore', approval:'explicit-restore', description:'Restore only into independently verified isolated empty destination'},
  {id:'compare', phase:'restore', approval:'explicit-restore', description:'Reconcile schema, six commercial tables, twelve policies, ACL, rows and missing scope'},
  {id:'decision', phase:'migration', approval:'new-r43-approval', description:'Require separate R43 authorization and fresh preflight even after successful restore'}
])

// This plan is descriptive data, not shell scripts or commands.
export function evaluatePreparatoryChecklist(input) {
  const issues = []
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return {state:'BLOCKED',issues:['invalid input'],canExport:false,canRestore:false,canApplyR43:false}
  const fields=['kind','mode','source','privateStorage','coverage','restoreTarget']
  if(Object.keys(input).some(k=>!fields.includes(k))) issues.push('unexpected field')
  if(input.kind!=='rutacap-r50-plan' || input.mode!=='fixture-only') issues.push('invalid fixture mode')
  if(input.source!=='fixture.invalid' || input.restoreTarget!=='fixture.invalid') issues.push('real endpoints forbidden')
  if(input.privateStorage!== 'planned-encrypted-off-repo') issues.push('private encrypted destination not planned')
  if(!input.coverage || typeof input.coverage!=='object' || Array.isArray(input.coverage)) issues.push('coverage missing')
  else {
    if(Object.keys(input.coverage).some(k=>!COVERAGE.includes(k))) issues.push('unknown coverage property')
    for(const key of COVERAGE) if(!['planned','excluded-with-reason','unknown'].includes(input.coverage[key])) issues.push('coverage not classified: '+key)
  }
  return {state:issues.length?'BLOCKED':'PLAN_ONLY',issues,canExport:false,canRestore:false,canApplyR43:false}
}

const specimen=()=>({
  kind:'rutacap-r50-plan',mode:'fixture-only',source:'fixture.invalid',
  privateStorage:'planned-encrypted-off-repo',restoreTarget:'fixture.invalid',
  coverage:Object.fromEntries(COVERAGE.map(k=>[k,'planned']))
})

test('R50 plan cannot execute exports, restores or migration',()=>{
  const result=evaluatePreparatoryChecklist(specimen())
  assert.equal(result.state,'PLAN_ONLY')
  assert.equal(result.canExport,false)
  assert.equal(result.canRestore,false)
  assert.equal(result.canApplyR43,false)
})
test('R50 only uses descriptive steps and separate authorizations',()=>{
  assert.deepEqual(BACKUP_PARTS,['roles.sql','schema.sql','data.sql'])
  assert.deepEqual([...new Set(STEPS.map(s=>s.approval))],['none','explicit-export','explicit-restore','new-r43-approval'])
  assert.ok(STEPS.every(s=>!Object.values(s).some(v=>/postgresql:\/\/|--db-url|psql -|supabase db dump|password=/i.test(v))))
})
test('R50 rejects real source or destination',()=>{
  const a=specimen();a.source='rutacap-dev'
  const b=specimen();b.restoreTarget='rhtbqetskghkarxhrgee'
  assert.equal(evaluatePreparatoryChecklist(a).state,'BLOCKED')
  assert.equal(evaluatePreparatoryChecklist(b).state,'BLOCKED')
})
test('R50 rejects unexpected credential fields',()=>{
  const a=specimen();a.connectionString='sensitive'
  assert.equal(evaluatePreparatoryChecklist(a).state,'BLOCKED')
})
test('R50 records all distinct coverage surfaces',()=>{
  const a=specimen();delete a.coverage.storageBinaryObjects
  assert.equal(evaluatePreparatoryChecklist(a).state,'BLOCKED')
  assert.ok(COVERAGE.includes('migrationHistory'))
  assert.ok(COVERAGE.includes('encryptionAndVault'))
})
test('R50 does not grant authorization even if all fields are planned',()=>{
  const a=specimen()
  assert.equal(evaluatePreparatoryChecklist(a).canApplyR43,false)
  assert.equal(evaluatePreparatoryChecklist(a).canExport,false)
})
test('R50 rejects unexpected coverage and unclassified items',()=>{
  const a=specimen();a.coverage.password='anything'
  const b=specimen();b.coverage.authDatabaseRows='verified'
  assert.equal(evaluatePreparatoryChecklist(a).state,'BLOCKED')
  assert.equal(evaluatePreparatoryChecklist(b).state,'BLOCKED')
})
