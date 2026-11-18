import test from 'node:test'
import assert from 'node:assert/strict'
import {canonical,sha256,fixtureProvider,createC39Reader} from './c39_snapshot_transfer.mjs'

const A='11111111-1111-4111-8111-111111111111'
const B='22222222-2222-4222-8222-222222222222'
const data={
  events:Array.from({length:5},(_,i)=>({eventId:'e'+i,questionId:'q'+i,answer:i%2?'A':'B',meta:{b:2,a:1}})),
  sessions:Array.from({length:3},(_,i)=>({clientId:'s'+i,answers:[{questionId:'q'+i,selected:'A'}]}))
}
const create=(opts={})=>fixtureProvider({ownerId:A,streams:data,...opts})
const reader=(p)=>createC39Reader({provider:p,pageSize:2})
const fails=async(p,code)=>assert.rejects(reader(p).read({ownerId:A}),e=>e.code===code)

test('C39 SHA-256 canonical object order and Unicode stable',()=>{
  assert.equal(canonical({z:1,a:{y:'ñ',b:2}}),canonical({a:{b:2,y:'ñ'},z:1}))
  assert.equal(sha256({x:'á'}),sha256({x:'á'}))
  assert.equal(sha256({x:1}).length,64)
  assert.notEqual(sha256({x:1}),sha256({x:2}))
})
test('C39 full paginated transfer preserves complete rows and authenticates digest',async()=>{
  const f=create();const r=await reader(f.provider).read({ownerId:A})
  assert.deepEqual(r.rows,data)
  assert.equal(r.manifest.digest,f.manifest.digest)
  assert.equal(f.stats().calls,5)
  assert.equal(f.stats().finished,1)
})
test('C39 mock-only gate cannot accept production transport',()=>{
  assert.throws(()=>createC39Reader({provider:{begin(){},page(){},finish(){}}}),e=>e.code==='MOCK_ONLY')
  assert.throws(()=>createC39Reader({provider:create().provider,pageSize:51}),e=>e.code==='BOUNDS_INVALID')
})
test('C39 missing, repeated, shuffled, foreign page and checkpoint fail closed',async()=>{
  const alterations=[
    [p=>p.stream==='events'&&p.offset===2?{...p,items:[]}:p,'PAGE_INVALID'],
    [p=>p.stream==='events'&&p.offset===2?{...p,items:[p.items[0],p.items[0]]}:p,'KEY_INVALID'],
    [p=>p.stream==='events'&&p.offset===0?{...p,items:p.items.toReversed()}:p,'DIGEST_MISMATCH'],
    [p=>p.stream==='events'&&p.offset===0?{...p,ownerId:B}:p,'PAGE_INVALID'],
    [p=>p.stream==='events'&&p.offset===0?{...p,checkpoint:'wrong'}:p,'PAGE_INVALID'],
    [p=>p.stream==='events'&&p.offset===0?{...p,digest:'0'.repeat(64)}:p,'PAGE_INVALID'],
    [p=>p.stream==='events'&&p.offset===2?{...p,offset:0}:p,'PAGE_INVALID'],
    [p=>p.stream==='events'&&p.offset===0?{...p,items:[{...p.items[0],answer:'tampered'},p.items[1]]}:p,'DIGEST_MISMATCH'],
    [p=>p.stream==='sessions'&&p.offset===2?{...p,items:[{...p.items[0],clientId:'s0'}]}:p,'KEY_INVALID']
  ]
  for(const [mutatePage,code] of alterations)await fails(create({mutatePage}).provider,code)
})
test('C39 dropped connection creates resumable journal and resumes without duplicate pages',async()=>{
  let interrupted=false
  const f=create({failAt:({stream,offset})=>{
    if(!interrupted&&stream==='events'&&offset===2){interrupted=true;return true}
    return false
  }})
  let continuation
  try{await reader(f.provider).read({ownerId:A})}catch(e){
    assert.equal(e.code,'NETWORK_INTERRUPTED')
    continuation=e.resume
  }
  assert.equal(continuation.rows.events.length,2)
  const r=await reader(f.provider).read({ownerId:A,resume:continuation})
  assert.deepEqual(r.rows,data)
  assert.equal(f.stats().finished,1)
})
test('C39 resume rejects foreign generation and counterfeit identity',async()=>{
  const f=create()
  const fake={identity:{...f.manifest},rows:{events:[],sessions:[]}}
  fake.identity.counts={...f.manifest.counts}
  fake.identity.ownerId=B
  await assert.rejects(reader(f.provider).read({ownerId:A,resume:fake}),e=>e.code==='RESUME_MISMATCH')
})
test('C39 resumed prior page tampering is detected by full digest',async()=>{
  const f=create()
  const resume={identity:{...f.manifest},rows:{events:[{...data.events[0],answer:'evil'}],sessions:[]}}
  await assert.rejects(reader(f.provider).read({ownerId:A,resume}),e=>e.code==='DIGEST_MISMATCH')
})
test('C39 a new snapshot invalidates continuation after expiry',async()=>{
  let cut=false
  const f=create({failAt:({offset,stream})=>!cut&&stream==='events'&&offset===2?(cut=true):false})
  let resume
  try{await reader(f.provider).read({ownerId:A})}catch(e){resume=e.resume}
  assert.ok(resume)
  const renewed=create({snapshotId:'another-generation'})
  await assert.rejects(reader(renewed.provider).read({ownerId:A,resume}),e=>e.code==='RESUME_MISMATCH')
})
test('C39 finish rejects mismatched digest and refuses success without commit',async()=>{
  await fails(create({mutateFinish:f=>({...f,digest:'0'.repeat(64)})}).provider,'FINISH_INVALID')
  await fails(create({mutateFinish:f=>({...f,committed:false})}).provider,'FINISH_INVALID')
})
test('C39 insufficient expected count and oversized manifests fail closed',async()=>{
  const f=create()
  await assert.rejects(createC39Reader({provider:f.provider,maxRows:2}).read({ownerId:A}),e=>e.code==='MANIFEST_INVALID')
})
